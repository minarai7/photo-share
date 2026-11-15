package service

import (
	"context"
	"errors"
	"fmt"
	"log"
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
	tints    TintSource
}

// TintSource computes a post's page colour from its cover's thumbnail.
// StorageTints is the real one.
type TintSource interface {
	// TintFor returns the tint ("#rrggbb") of the stored thumbnail at the
	// public path thumbnailPath (/uploads/<name>_w800.jpg).
	TintFor(ctx context.Context, thumbnailPath string) (string, error)
}

// NewPostService returns the post service. tints may be nil: posts are then
// created without a tint (clients use their default page colour).
func NewPostService(postRepo PostStore, tints TintSource) *PostService {
	return &PostService{postRepo: postRepo, tints: tints}
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

// MaxUserIDs is the most people one list or count can be filtered to.
const MaxUserIDs = 100

var (
	// ErrInvalidPagination: a page size outside 1..MaxPageSize, or a malformed cursor.
	ErrInvalidPagination = fmt.Errorf("limit must be 1 to %d, and the cursor needs before_created_at, a positive before_id and, for sort=most, a positive before_image_count", MaxPageSize)
	// ErrInvalidSort: sort is not newest, oldest or most.
	ErrInvalidSort = errors.New("sort must be newest, oldest or most")
	// ErrInvalidPhotosFilter: photos is not any, single or series.
	ErrInvalidPhotosFilter = errors.New("photos must be any, single or series")
	// ErrInvalidUserIDs: a user id that is not positive, or too many of them.
	ErrInvalidUserIDs = fmt.Errorf("user ids must be positive numbers, at most %d of them", MaxUserIDs)
)

// Sorts and photo filters, as the API names them.
type (
	PostSort     = repository.PostSort
	PhotosFilter = repository.PhotosFilter
	PostFilter   = repository.PostFilter
)

const (
	SortNewest   = repository.SortNewest
	SortOldest   = repository.SortOldest
	SortMost     = repository.SortMost
	PhotosAny    = repository.PhotosAny
	PhotosSingle = repository.PhotosSingle
	PhotosSeries = repository.PhotosSeries
)

// PostCursor is the last post of the previous page: its created_at and id,
// and for SortMost its image count.
type PostCursor = repository.PostCursor

// ListPostsParams selects a page of the feed, filtered and sorted.
type ListPostsParams struct {
	PostFilter
	// Sort is the order; "" means newest first.
	Sort PostSort
	// After is where the previous page ended; nil for the first page.
	After *PostCursor
	// Limit is the page size, 1..MaxPageSize; 0 means every post (clients
	// from before pagination send no limit).
	Limit int
}

func validateFilter(f PostFilter) error {
	if len(f.UserIDs) > MaxUserIDs {
		return ErrInvalidUserIDs
	}
	for _, id := range f.UserIDs {
		if id <= 0 {
			return ErrInvalidUserIDs
		}
	}
	switch f.Photos {
	case "", PhotosAny, PhotosSingle, PhotosSeries:
		return nil
	}
	return ErrInvalidPhotosFilter
}

// ListPosts returns a page of posts. They carry the cover, ImageCount and
// Tint, not Images: a slide needs nothing else, and the post page fetches the post.
func (s *PostService) ListPosts(ctx context.Context, p ListPostsParams) ([]dto.PostResponse, error) {
	if err := validateFilter(p.PostFilter); err != nil {
		return nil, err
	}
	switch p.Sort {
	case "", SortNewest, SortOldest, SortMost:
	default:
		return nil, ErrInvalidSort
	}
	if p.Limit < 0 || p.Limit > MaxPageSize {
		return nil, ErrInvalidPagination
	}
	if c := p.After; c != nil && (c.ID <= 0 || (p.Sort == SortMost && c.ImageCount <= 0)) {
		return nil, ErrInvalidPagination
	}
	posts, err := s.postRepo.ListPosts(ctx, repository.ListPostsParams{
		PostFilter: p.PostFilter,
		Sort:       p.Sort,
		After:      p.After,
		Limit:      p.Limit,
	})
	if err != nil {
		return nil, err
	}
	for i := range posts {
		posts[i].ImageCount = max(posts[i].ImageCount, 1)
	}
	return posts, nil
}

// CountPosts returns how many posts match the filter (the Index's "4 of 10 works").
func (s *PostService) CountPosts(ctx context.Context, f PostFilter) (int, error) {
	if err := validateFilter(f); err != nil {
		return 0, err
	}
	return s.postRepo.CountPosts(ctx, f)
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
		Tint:       s.coverTint(ctx, repoImages[0].ThumbnailPath),
	})
	if err != nil {
		return nil, err
	}

	return s.GetPostByID(ctx, createdPostID)
}

// coverTint is the page colour of a post whose cover has the (already
// validated) thumbnail at thumbnailPath. It is computed here, from the stored
// file, rather than taken from the client. Best-effort, like the thumbnail
// itself: without a thumbnail, or on any error, the post has no tint
// (cmd/tints can add it later).
func (s *PostService) coverTint(ctx context.Context, thumbnailPath *string) *string {
	if s.tints == nil || thumbnailPath == nil {
		return nil
	}
	t, err := s.tints.TintFor(ctx, *thumbnailPath)
	if err != nil {
		log.Printf("create post: no tint from %s: %v", *thumbnailPath, err)
		return nil
	}
	return &t
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
