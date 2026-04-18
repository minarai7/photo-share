package service

import (
	"context"
	"errors"
	"strings"

	"backend/internal/auth"
	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/repository"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidSignupInput    = errors.New("username, email, and password are required")
	ErrPasswordTooLong       = errors.New("password must be 72 bytes or fewer")
	ErrEmailAlreadyExists    = errors.New("email already exists")
	ErrUsernameAlreadyExists = errors.New("username already exists")
	ErrInvalidCredentials    = errors.New("invalid credentials")
)

type AuthService struct {
	userRepo  *repository.UserRepository
	jwtSecret string
}

func NewAuthService(userRepo *repository.UserRepository, jwtSecret string) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
	}
}

type SignupParams struct {
	Username string
	Email    string
	Password string
}

type LoginParams struct {
	Email    string
	Password string
}

type LoginResult struct {
	Token string
	User  model.Users
}

func (s *AuthService) Signup(ctx context.Context, p SignupParams) (*model.Users, error) {
	username := strings.TrimSpace(p.Username)
	email := strings.TrimSpace(p.Email)
	password := p.Password

	if username == "" || email == "" || password == "" {
		return nil, ErrInvalidSignupInput
	}

	if len([]byte(password)) > 72 {
		return nil, ErrPasswordTooLong
	}

	existingByEmail, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if existingByEmail != nil {
		return nil, ErrEmailAlreadyExists
	}

	existingByUsername, err := s.userRepo.GetByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if existingByUsername != nil {
		return nil, ErrUsernameAlreadyExists
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	createdUser, err := s.userRepo.Create(ctx, repository.CreateUserParams{
		Username:     username,
		Email:        email,
		PasswordHash: string(hashedPassword),
	})
	if err != nil {
		return nil, err
	}

	return createdUser, nil
}

func (s *AuthService) Login(ctx context.Context, params LoginParams) (LoginResult, error) {
	user, err := s.userRepo.GetByEmail(ctx, params.Email)
	if err != nil {
		return LoginResult{}, err
	}
	if user == nil {
		return LoginResult{}, ErrInvalidCredentials
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(params.Password))
	if err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}

	return s.IssueAuth(*user)
}

func (s *AuthService) IssueAuth(user model.Users) (LoginResult, error) {
	token, err := auth.GenerateToken(s.jwtSecret, user.ID)
	if err != nil {
		return LoginResult{}, err
	}

	return LoginResult{
		Token: token,
		User:  user,
	}, nil
}
