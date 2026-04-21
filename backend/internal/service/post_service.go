package service

import (
	"context"
	"errors"
	"strings"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/repository"
)

var (
	ErrUserRequired      = errors.New("user is required")
	ErrImagePathRequired = errors.New("image path is required")
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

func (s *PostService) CreatePost(ctx context.Context, p CreatePostParams) (*model.Posts, error) {
	if p.UserID == 0 {
		return nil, ErrUserRequired
	}
	if strings.TrimSpace(p.ImagePath) == "" {
		return nil, ErrImagePathRequired
	}

	createdPost, err := s.postRepo.CreatePost(ctx, repository.CreatePostParams{
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

	return createdPost, nil
}

func (s *PostService) ListPosts(ctx context.Context) ([]model.Posts, error) {
	return s.postRepo.ListPosts(ctx)
}
