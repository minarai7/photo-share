package repository

import (
	"context"
	"database/sql"

	model "backend/internal/db/gen/photoshare/public/model"
	table "backend/internal/db/gen/photoshare/public/table"

	"github.com/go-jet/jet/v2/postgres"
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
	stmt := table.Posts.
		SELECT(table.Posts.AllColumns).
		FROM(table.Posts.Table).
		ORDER_BY(
			table.Posts.CreatedAt.DESC(), // Newest posts come first
			table.Posts.ID.DESC(),
		)

	var posts []model.Posts
	err := stmt.QueryContext(ctx, r.db, &posts)
	if err != nil {
		return nil, err
	}

	return posts, nil
}

func (r *PostRepository) GetPostByID(ctx context.Context, id int64) (*model.Posts, error) {
	stmt := table.Posts.
		SELECT(table.Posts.AllColumns).
		FROM(table.Posts.Table).
		WHERE(table.Posts.ID.EQ(postgres.Int64(id)))

	var post model.Posts
	err := stmt.QueryContext(ctx, r.db, &post)
	if err != nil {
		return nil, err
	}

	return &post, nil
}

func (r *PostRepository) CreatePost(ctx context.Context, p CreatePostParams) (*model.Posts, error) {
	stmt := table.Posts.
		INSERT(
			table.Posts.UserID,
			table.Posts.ImagePath,
			table.Posts.Caption,
			table.Posts.Location,
			table.Posts.CameraBody,
			table.Posts.Lens).
		MODEL(p).
		RETURNING(table.Posts.AllColumns)

	var post model.Posts
	err := stmt.QueryContext(ctx, r.db, &post)
	if err != nil {
		return nil, err
	}

	return &post, nil
}
