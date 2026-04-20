package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
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
	jwtSecret []byte
}

func NewAuthService(userRepo *repository.UserRepository, jwtSecret string) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		jwtSecret: []byte(jwtSecret),
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

type Claims struct {
	jwt.RegisteredClaims
	UserID int64 `json:"user_id"`
}

func (s *AuthService) IssueAuth(user model.Users) (LoginResult, error) {
	token, err := s.GenerateToken(user.ID)
	if err != nil {
		return LoginResult{}, err
	}

	return LoginResult{
		Token: token,
		User:  user,
	}, nil
}

func (s *AuthService) GenerateToken(userID int64) (string, error) {
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(s.jwtSecret)
}

func (s *AuthService) ParseToken(tokenString string) (int64, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return s.jwtSecret, nil
		},
	)

	if err != nil {
		return 0, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return 0, errors.New("invalid token")
	}
	return claims.UserID, nil
}
