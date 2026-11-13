package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"backend/internal/dto"
	"backend/internal/repository"

	"github.com/go-jet/jet/v2/qrm"
)

var (
	ErrUserRequired      = errors.New("user is required")
	ErrImagePathRequired = errors.New("image path is required")
	ErrPostNotFound      = errors.New("post not found")
	ErrForbidden         = errors.New("forbidden")
	// ErrInvalidThumbnailPath: a post's thumbnail must be the one made for its image.
	ErrInvalidThumbnailPath = errors.New("thumbnail_path does not match image_path")
	ErrTooManyImages        = fmt.Errorf("a post can have at most %d images", MaxImagesPerPost)
	ErrDuplicateImage       = errors.New("the same image is in the post more than once")
)

// MaxImagesPerPost is the most images one post can have. The frontend mirrors
// it in src/config/upload.ts; change both together.
const MaxImagesPerPost = 10

type PostService struct {
	postRepo PostStore
}

func NewPostService(postRepo PostStore) *PostService {
	return &PostService{postRepo: postRepo}
}

type CreatePostParams struct {
	UserID int64
	// Images are the post's images in display order; the first is the cover.
	Images []CreatePostImage
	// ImagePath and ThumbnailPath are the single-image form that clients
	// sent before posts could have several images. They are used only when
	// Images is empty.
	ImagePath     string
	ThumbnailPath *string
	Caption       string
	Location      *string
	CameraBody    *string
	Lens          *string
}

type CreatePostImage struct {
	ImagePath string
	// ThumbnailPath is optional. When set, it must equal
	// ThumbnailPathFor(ImagePath), so a post can't point its grid image at
	// someone else's file.
	ThumbnailPath *string
}

type UpdatePostParams struct {
	PostID     int64
	UserID     int64
	Caption    string
	Location   *string
	CameraBody *string
	Lens       *string
}

type DeletePostParams struct {
	PostID int64
	UserID int64
}

// MaxPageSize is the largest page ListPosts serves.
const MaxPageSize = 100

// ErrInvalidPagination: a page size outside 1..MaxPageSize, or a malformed cursor.
var ErrInvalidPagination = fmt.Errorf("limit must be 1 to %d, and the cursor needs both before_created_at and a positive before_id", MaxPageSize)

// PostCursor is the created_at and id of the last post of the previous page.
type PostCursor = repository.PostCursor

// ListPostsParams selects a page of the feed (or of one user's posts).
type ListPostsParams struct {
	UserID *int64
	// Before is where the previous page ended; nil for the first page.
	Before *PostCursor
	// Limit is the page size, 1..MaxPageSize; 0 means every post (clients
	// from before pagination send no limit).
	Limit int
}

// ListPosts returns posts newest first. They carry the cover and ImageCount,
// not Images: a card needs nothing else, and the detail page fetches the post.
func (s *PostService) ListPosts(ctx context.Context, p ListPostsParams) ([]dto.PostResponse, error) {
	if p.Limit < 0 || p.Limit > MaxPageSize || (p.Before != nil && p.Before.ID <= 0) {
		return nil, ErrInvalidPagination
	}
	posts, err := s.postRepo.ListPosts(ctx, repository.ListPostsParams{
		UserID: p.UserID,
		Before: p.Before,
		Limit:  p.Limit,
	})
	if err != nil {
		return nil, err
	}
	for i := range posts {
		// A post from an older backend has no image rows: its cover is its image.
		posts[i].ImageCount = max(posts[i].ImageCount, 1)
	}
	return posts, nil
}

func (s *PostService) GetPostByID(ctx context.Context, id int64) (*dto.PostResponse, error) {
	post, err := s.postRepo.GetPostByID(ctx, id)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, ErrPostNotFound
		}
		return nil, err
	}

	withImages(post)
	return post, nil
}

// withImages makes sure post.Images is never empty: a post created by an
// older backend (after post_images existed, before this one was deployed) has
// no image rows, so its cover is its only image. It also sets ImageCount.
func withImages(post *dto.PostResponse) {
	if len(post.Images) == 0 {
		post.Images = []dto.PostImageResponse{{
			ImagePath:     post.ImagePath,
			ThumbnailPath: post.ThumbnailPath,
		}}
	}
	post.ImageCount = len(post.Images)
}

func (s *PostService) CreatePost(ctx context.Context, p CreatePostParams) (*dto.PostResponse, error) {
	if p.UserID == 0 {
		return nil, ErrUserRequired
	}

	images := p.Images
	if len(images) == 0 {
		images = []CreatePostImage{{ImagePath: p.ImagePath, ThumbnailPath: p.ThumbnailPath}}
	}
	if len(images) > MaxImagesPerPost {
		return nil, ErrTooManyImages
	}

	repoImages := make([]repository.CreatePostImageParams, len(images))
	seen := make(map[string]bool, len(images))
	for i, img := range images {
		if strings.TrimSpace(img.ImagePath) == "" {
			return nil, ErrImagePathRequired
		}
		if seen[img.ImagePath] {
			return nil, ErrDuplicateImage
		}
		seen[img.ImagePath] = true

		thumbnailPath := img.ThumbnailPath
		if thumbnailPath != nil && *thumbnailPath == "" {
			thumbnailPath = nil
		}
		if thumbnailPath != nil && *thumbnailPath != ThumbnailPathFor(img.ImagePath) {
			return nil, ErrInvalidThumbnailPath
		}
		repoImages[i] = repository.CreatePostImageParams{ImagePath: img.ImagePath, ThumbnailPath: thumbnailPath}
	}

	createdPostID, err := s.postRepo.CreatePost(ctx, repository.CreatePostParams{
		UserID:     p.UserID,
		Images:     repoImages,
		Caption:    p.Caption,
		Location:   p.Location,
		CameraBody: p.CameraBody,
		Lens:       p.Lens,
	})
	if err != nil {
		return nil, err
	}

	return s.GetPostByID(ctx, createdPostID)
}

func (s *PostService) UpdatePost(ctx context.Context, p UpdatePostParams) (*dto.PostResponse, error) {
	existingPost, err := s.GetPostByID(ctx, p.PostID)
	if err != nil {
		return nil, err
	}

	if existingPost.UserID != p.UserID {
		return nil, ErrForbidden
	}

	err = s.postRepo.UpdatePost(ctx, repository.UpdatePostParams{
		ID:         p.PostID,
		UserID:     p.UserID,
		Caption:    p.Caption,
		Location:   p.Location,
		CameraBody: p.CameraBody,
		Lens:       p.Lens,
	})
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, ErrPostNotFound
		}
		return nil, err
	}

	return s.GetPostByID(ctx, p.PostID)
}

func (s *PostService) DeletePost(ctx context.Context, p DeletePostParams) error {
	existingPost, err := s.GetPostByID(ctx, p.PostID)
	if err != nil {
		return err
	}

	if existingPost.UserID != p.UserID {
		return ErrForbidden
	}

	err = s.postRepo.DeletePostByID(ctx, p.PostID)
	if err != nil {
		return err
	}

	return nil
}
