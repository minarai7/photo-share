package service

import (
	"context"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/dto"
)

// UserService serves what anyone may read about people: a person's public
// profile and the list of people who have posted. Nothing it returns is
// private (no email, no settings).
type UserService struct {
	users UserStore
	posts PostStore
}

func NewUserService(users UserStore, posts PostStore) *UserService {
	return &UserService{users: users, posts: posts}
}

// UserProfile is a person and the counts of their work.
type UserProfile struct {
	User *model.Users
	Work dto.UserWork
}

// GetProfile returns the user with their post and photo counts, or
// ErrUserNotFound.
func (s *UserService) GetProfile(ctx context.Context, id int64) (*UserProfile, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}
	work, err := s.posts.UserWork(ctx, id)
	if err != nil {
		return nil, err
	}
	return &UserProfile{User: user, Work: work}, nil
}

// ListAuthors returns everyone who has posted, by username.
func (s *UserService) ListAuthors(ctx context.Context) ([]dto.Author, error) {
	return s.users.ListAuthors(ctx)
}
