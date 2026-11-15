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
//   - ListAuthors returns only users with at least one post, with PostCount,
//     ordered by username then id; never nil.
type UserStore interface {
	GetByID(ctx context.Context, id int64) (*model.Users, error)
	GetByEmail(ctx context.Context, email string) (*model.Users, error)
	GetByUsername(ctx context.Context, username string) (*model.Users, error)
	Create(ctx context.Context, p repository.CreateUserParams) (*model.Users, error)
	UpdatePreferredLanguage(ctx context.Context, id int64, preferredLanguage string) error
	ListAuthors(ctx context.Context) ([]dto.Author, error)
}

// PostStore is the persistence surface the services need for posts.
// *repository.PostRepository implements it; tests use internal/testutil/memstore.
//
// Contract (verified against Postgres in internal/repository tests):
//   - GetPostByID returns qrm.ErrNoRows when no row matches.
//   - UpdatePost / DeletePostByID return repository.ErrorPostNotFound when no row matches.
//   - ListPosts returns posts in Sort's order, never nil: newest (default)
//     is created_at DESC, id DESC; oldest is created_at ASC, id ASC; most is
//     image_count DESC, created_at DESC, id DESC. It keeps posts of UserIDs
//     (all when empty) with Photos' image count (single = 1, series >= 2),
//     strictly after the After cursor in that order (most compares
//     (image_count, created_at, id); the others (created_at, id)), at most
//     Limit posts (0 = all). Its posts carry ImageCount (the stored count:
//     1 for a post written before the column) and Tint, and no Images.
//   - CountPosts counts the posts ListPosts would return for the filter
//     without a cursor or limit.
//   - UserWork counts a user's posts and the sum of their ImageCount; zeros
//     for a user without posts or an unknown user.
//   - CreatePost stores Images in order (position 0 is also the post's
//     image_path/thumbnail_path, the cover), image_count = len(Images) and
//     Tint, atomically, and returns repository.ErrorNoImages for an empty
//     Images. GetPostByID returns Images in that order (ImageCount unset)
//     and Tint; a post without image rows (written by an older backend)
//     comes back with empty Images. Deleting a post deletes its images.
type PostStore interface {
	ListPosts(ctx context.Context, p repository.ListPostsParams) ([]dto.PostResponse, error)
	CountPosts(ctx context.Context, f repository.PostFilter) (int, error)
	UserWork(ctx context.Context, userID int64) (dto.UserWork, error)
	GetPostByID(ctx context.Context, id int64) (*dto.PostResponse, error)
	CreatePost(ctx context.Context, p repository.CreatePostParams) (int64, error)
	UpdatePost(ctx context.Context, p repository.UpdatePostParams) error
	DeletePostByID(ctx context.Context, id int64) error
}

var (
	_ UserStore = (*repository.UserRepository)(nil)
	_ PostStore = (*repository.PostRepository)(nil)
)
