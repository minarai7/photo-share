package service

import (
	"context"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/repository"
)

type AuthService struct {
	userRepo *repository.UserRepository
}

func NewAuthService(userRepo *repository.UserRepository) *AuthService {
	return &AuthService{userRepo: userRepo}
}

func (s *AuthService) Signup(ctx context.Context, user *model.Users) error {
	return s.userRepo.Create(ctx, user)
}
