package service

import (
	"context"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/dto"
	"backend/internal/repository"
)

// UserStore is the persistence surface the services need for users.
// *repository.UserRepository implements it; tests use internal/testutil/memstore.
//
// Contract (verified against Postgres in internal/repository tests):
//   - GetByID / GetByEmail / GetByUsername return (nil, nil) when no row matches.
//   - UpdatePreferredLanguage returns repository.ErrorUserNotFound when no row matches.
type UserStore interface {
	GetByID(ctx context.Context, id int64) (*model.Users, error)
	GetByEmail(ctx context.Context, email string) (*model.Users, error)
	GetByUsername(ctx context.Context, username string) (*model.Users, error)
	Create(ctx context.Context, p repository.CreateUserParams) (*model.Users, error)
	UpdatePreferredLanguage(ctx context.Context, id int64, preferredLanguage string) error
}

// PostStore is the persistence surface the services need for posts.
// *repository.PostRepository implements it; tests use internal/testutil/memstore.
//
// Contract (verified against Postgres in internal/repository tests):
//   - GetPostByID returns qrm.ErrNoRows when no row matches.
//   - UpdatePost / DeletePostByID return repository.ErrorPostNotFound when no row matches.
//   - ListPosts returns newest first (created_at DESC, id DESC), never nil,
//     filtered by UserID and to posts strictly before the Before cursor,
//     at most Limit posts (0 = all). Its posts carry ImageCount (the number
//     of image rows; 0 for a post without any) and no Images.
//   - CreatePost stores Images in order (position 0 is also the post's
//     image_path/thumbnail_path, the cover) atomically, and returns
//     repository.ErrorNoImages for an empty Images. GetPostByID returns
//     Images in that order (ImageCount unset); a post without image rows
//     (written by an older backend) comes back with empty Images. Deleting
//     a post deletes its images.
type PostStore interface {
	ListPosts(ctx context.Context, p repository.ListPostsParams) ([]dto.PostResponse, error)
	GetPostByID(ctx context.Context, id int64) (*dto.PostResponse, error)
	CreatePost(ctx context.Context, p repository.CreatePostParams) (int64, error)
	UpdatePost(ctx context.Context, p repository.UpdatePostParams) error
	DeletePostByID(ctx context.Context, id int64) error
}

var (
	_ UserStore = (*repository.UserRepository)(nil)
	_ PostStore = (*repository.PostRepository)(nil)
)
