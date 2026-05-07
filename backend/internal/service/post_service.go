package service

import (
	"context"
	"errors"
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
)

type PostService struct {
	postRepo *repository.PostRepository
}

func NewPostService(postRepo *repository.PostRepository) *PostService {
	return &PostService{postRepo: postRepo}
}

type CreatePostParams struct {
	UserID     int64
	ImagePath  string
	Caption    string
	Location   *string
	CameraBody *string
	Lens       *string
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

func (s *PostService) ListPosts(ctx context.Context) ([]dto.PostResponse, error) {
	return s.postRepo.ListPosts(ctx)
}

func (s *PostService) GetPostByID(ctx context.Context, id int64) (*dto.PostResponse, error) {
	post, err := s.postRepo.GetPostByID(ctx, id)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, ErrPostNotFound
		}
		return nil, err
	}

	return post, nil
}

func (s *PostService) CreatePost(ctx context.Context, p CreatePostParams) (*dto.PostResponse, error) {
	if p.UserID == 0 {
		return nil, ErrUserRequired
	}
	if strings.TrimSpace(p.ImagePath) == "" {
		return nil, ErrImagePathRequired
	}

	createdPostID, err := s.postRepo.CreatePost(ctx, repository.CreatePostParams{
		UserID:     p.UserID,
		ImagePath:  p.ImagePath,
		Caption:    p.Caption,
		Location:   p.Location,
		CameraBody: p.CameraBody,
		Lens:       p.Lens,
	})
	if err != nil {
		return nil, err
	}

	return s.postRepo.GetPostByID(ctx, createdPostID)
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

	return s.postRepo.GetPostByID(ctx, p.PostID)
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
