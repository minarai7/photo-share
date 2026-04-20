package repository

import (
	"context"
	"database/sql"

	model "backend/internal/db/gen/photoshare/public/model"
	table "backend/internal/db/gen/photoshare/public/table"
)

type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {
	return &PostRepository{db: db}
}

type CreatePostParams struct {
	UserID     int64
	ImagePath  string
	Caption    string
	Location   *string
	CameraBody *string
	Lens       *string
}

type CreatePostResult struct {
	ID int64
}

func (r *PostRepository) ListPosts(ctx context.Context) ([]model.Posts, error) {
	return nil, nil
}

func (r *PostRepository) CreatePost(ctx context.Context, p CreatePostParams) (CreatePostResult, error) {
	stmt := table.Posts.
		INSERT(
			table.Posts.UserID,
			table.Posts.ImagePath,
			table.Posts.Caption,
			table.Posts.Location,
			table.Posts.CameraBody,
			table.Posts.Lens).
		MODEL(p).
		RETURNING(table.Posts.ID.AS("create_post_result.id"))

	var dest CreatePostResult
	err := stmt.QueryContext(ctx, r.db, &dest)
	if err != nil {
		return CreatePostResult{}, err
	}

	return dest, nil
}
