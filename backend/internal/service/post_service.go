package service

import (
	"context"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/repository"
)

type PostService struct {
	postRepo *repository.PostRepository
}

func NewPostService(postRepo *repository.PostRepository) *PostService {
	return &PostService{postRepo: postRepo}
}

func (s *PostService) CreatePost(ctx context.Context, post repository.CreatePostParams) (repository.CreatePostResult, error) {
	createdPost, err := s.postRepo.CreatePost(ctx, post)
	if err != nil {
		return repository.CreatePostResult{}, err
	}

	return createdPost, nil
}

func (s *PostService) ListPosts(ctx context.Context) ([]model.Posts, error) {
	return s.postRepo.ListPosts(ctx)
}
