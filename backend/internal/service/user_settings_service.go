package service

import (
	"backend/internal/repository"
	"context"
	"errors"
)

var (
	ErrInvalidPreferredLanguage = errors.New("invalid preferred language")
)

type UserSettingsService struct {
	userRepo *repository.UserRepository
}

func NewUserSettingsService(userRepository *repository.UserRepository) *UserSettingsService {
	return &UserSettingsService{
		userRepo: userRepository,
	}
}

type UpdatePreferredLanguageParams struct {
	UserID            int64
	PreferredLanguage string
}

func (s *UserSettingsService) UpdatePreferredLanguage(ctx context.Context, p UpdatePreferredLanguageParams) error {
	if p.PreferredLanguage != "en" && p.PreferredLanguage != "ja" {
		return ErrInvalidPreferredLanguage
	}

	err := s.userRepo.UpdatePreferredLanguage(ctx, p.UserID, p.PreferredLanguage)
	if err != nil {
		if errors.Is(err, repository.ErrorUserNotFound) {
			return ErrUserNotFound
		}
		return err
	}

	return nil
}
