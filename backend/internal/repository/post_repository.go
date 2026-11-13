package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	model "backend/internal/db/gen/photoshare/public/model"
	table "backend/internal/db/gen/photoshare/public/table"
	"backend/internal/dto"

	"github.com/go-jet/jet/v2/postgres"
)

var (
	ErrorPostNotFound      = errors.New("post not found")
	ErrorPostImageNotFound = errors.New("post image not found")
	// ErrorNoImages: a post needs at least one image (its cover).
	ErrorNoImages = errors.New("post has no images")
)

type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {
	return &PostRepository{db: db}
}

// CreatePostParams creates a post with its images in display order.
// Images[0] is the cover and is also stored on the posts row.
type CreatePostParams struct {
	UserID     int64
	Images     []CreatePostImageParams
	Caption    string
	Location   *string
	CameraBody *string
	Lens       *string
}

type CreatePostImageParams struct {
	ImagePath     string
	ThumbnailPath *string
}

type UpdatePostParams struct {
	ID         int64
	UserID     int64
	Caption    string
	Location   *string
	CameraBody *string
	Lens       *string
}

// PostCursor is the position after which a page of posts starts: the
// created_at and id of the last post the client already has.
type PostCursor struct {
	CreatedAt time.Time
	ID        int64
}

// ListPostsParams selects a page of posts, newest first.
type ListPostsParams struct {
	// UserID, when set, keeps only that user's posts.
	UserID *int64
	// Before, when set, keeps only posts older than the cursor (by
	// created_at, then id), i.e. the page after the one that ended there.
	Before *PostCursor
	// Limit caps the number of posts; 0 means no limit.
	Limit int
}

// ListPosts returns posts newest first (created_at DESC, id DESC) with their
// cover and image count but without Images: one row per post, so LIMIT pages
// by post. The order and the cursor match the posts_*_created_at_id indexes.
func (r *PostRepository) ListPosts(ctx context.Context, p ListPostsParams) ([]dto.PostResponse, error) {
	imageCount := postgres.IntExp(
		postgres.SELECT(postgres.COUNT(postgres.STAR)).
			FROM(table.PostImages).
			WHERE(table.PostImages.PostID.EQ(table.Posts.ID)),
	)

	var conditions []postgres.BoolExpression
	if p.UserID != nil {
		conditions = append(conditions, table.Posts.UserID.EQ(postgres.Int64(*p.UserID)))
	}
	if p.Before != nil {
		conditions = append(conditions,
			postgres.ROW(table.Posts.CreatedAt, table.Posts.ID).
				LT(postgres.ROW(postgres.TimestampzT(p.Before.CreatedAt), postgres.Int64(p.Before.ID))),
		)
	}

	stmt := postgres.SELECT(
		table.Posts.ID.AS("post_response.id"),
		table.Posts.UserID.AS("post_response.user_id"),
		table.Users.Username.AS("post_response.username"),
		table.Posts.ImagePath.AS("post_response.image_path"),
		table.Posts.ThumbnailPath.AS("post_response.thumbnail_path"),
		imageCount.AS("post_response.image_count"),
		table.Posts.Caption.AS("post_response.caption"),
		table.Posts.Location.AS("post_response.location"),
		table.Posts.CameraBody.AS("post_response.camera_body"),
		table.Posts.Lens.AS("post_response.lens"),
		table.Posts.CreatedAt.AS("post_response.created_at"),
		table.Posts.UpdatedAt.AS("post_response.updated_at"),
	).FROM(
		table.Posts.INNER_JOIN(table.Users, table.Posts.UserID.EQ(table.Users.ID)),
	)
	if len(conditions) > 0 {
		stmt = stmt.WHERE(postgres.AND(conditions...))
	}
	stmt = stmt.ORDER_BY(
		table.Posts.CreatedAt.DESC(), // Newest posts come first
		table.Posts.ID.DESC(),
	)
	if p.Limit > 0 {
		stmt = stmt.LIMIT(int64(p.Limit))
	}

	posts := make([]dto.PostResponse, 0)
	if err := stmt.QueryContext(ctx, r.db, &posts); err != nil {
		return nil, err
	}
	return posts, nil
}

// GetPostByID returns one post with all its images. go-jet groups the joined
// rows into one dto.PostResponse (by the primary_key tags), with Images in
// row order. LEFT JOIN: a post written by an older backend may have no image
// rows. ImageCount is left for the caller (the service sets it from Images).
func (r *PostRepository) GetPostByID(ctx context.Context, id int64) (*dto.PostResponse, error) {
	stmt := postgres.SELECT(
		table.Posts.ID.AS("post_response.id"),
		table.Posts.UserID.AS("post_response.user_id"),
		table.Users.Username.AS("post_response.username"),
		table.Posts.ImagePath.AS("post_response.image_path"),
		table.Posts.ThumbnailPath.AS("post_response.thumbnail_path"),
		table.Posts.Caption.AS("post_response.caption"),
		table.Posts.Location.AS("post_response.location"),
		table.Posts.CameraBody.AS("post_response.camera_body"),
		table.Posts.Lens.AS("post_response.lens"),
		table.Posts.CreatedAt.AS("post_response.created_at"),
		table.Posts.UpdatedAt.AS("post_response.updated_at"),
		table.PostImages.ID.AS("post_image_response.id"),
		table.PostImages.ImagePath.AS("post_image_response.image_path"),
		table.PostImages.ThumbnailPath.AS("post_image_response.thumbnail_path"),
	).FROM(
		table.Posts.
			INNER_JOIN(table.Users, table.Posts.UserID.EQ(table.Users.ID)).
			LEFT_JOIN(table.PostImages, table.PostImages.PostID.EQ(table.Posts.ID)),
	).
		WHERE(table.Posts.ID.EQ(postgres.Int64(id))).
		ORDER_BY(table.PostImages.Position.ASC())

	var post dto.PostResponse
	err := stmt.QueryContext(ctx, r.db, &post)
	if err != nil {
		return nil, err
	}

	return &post, nil
}

// CreatePost inserts the post and its images in one transaction and returns
// the new post's ID. It returns ErrorNoImages when p.Images is empty.
func (r *PostRepository) CreatePost(ctx context.Context, p CreatePostParams) (id int64, err error) {
	if len(p.Images) == 0 {
		return 0, ErrorNoImages
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	cover := p.Images[0]
	postStmt := table.Posts.
		INSERT(
			table.Posts.UserID,
			table.Posts.ImagePath,
			table.Posts.ThumbnailPath,
			table.Posts.Caption,
			table.Posts.Location,
			table.Posts.CameraBody,
			table.Posts.Lens).
		MODEL(model.Posts{
			UserID:        p.UserID,
			ImagePath:     cover.ImagePath,
			ThumbnailPath: cover.ThumbnailPath,
			Caption:       p.Caption,
			Location:      p.Location,
			CameraBody:    p.CameraBody,
			Lens:          p.Lens,
		}).
		RETURNING(table.Posts.ID)

	var post model.Posts
	if err = postStmt.QueryContext(ctx, tx, &post); err != nil {
		return 0, err
	}

	images := make([]model.PostImages, len(p.Images))
	for i, img := range p.Images {
		images[i] = model.PostImages{
			PostID:        post.ID,
			Position:      int16(i),
			ImagePath:     img.ImagePath,
			ThumbnailPath: img.ThumbnailPath,
		}
	}
	imagesStmt := table.PostImages.
		INSERT(
			table.PostImages.PostID,
			table.PostImages.Position,
			table.PostImages.ImagePath,
			table.PostImages.ThumbnailPath).
		MODELS(images)
	if _, err = imagesStmt.ExecContext(ctx, tx); err != nil {
		return 0, fmt.Errorf("insert post images: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return post.ID, nil
}

func (r *PostRepository) UpdatePost(ctx context.Context, p UpdatePostParams) error {
	stmt := table.Posts.
		UPDATE(
			table.Posts.Caption,
			table.Posts.Location,
			table.Posts.CameraBody,
			table.Posts.Lens,
			table.Posts.UpdatedAt,
		).
		MODEL(model.Posts{
			Caption:    p.Caption,
			Location:   p.Location,
			CameraBody: p.CameraBody,
			Lens:       p.Lens,
			UpdatedAt:  time.Now(),
		}).
		WHERE(
			table.Posts.ID.EQ(postgres.Int64(p.ID)).
				AND(table.Posts.UserID.EQ(postgres.Int64(p.UserID))),
		)

	result, err := stmt.ExecContext(ctx, r.db)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrorPostNotFound
	}

	return nil
}

// ImageMissingThumbnail is a stored post image without a thumbnail, for the
// thumbnail backfill. ID is the post_images row.
type ImageMissingThumbnail struct {
	ID        int64
	PostID    int64
	Position  int16
	ImagePath string
}

// ListImagesMissingThumbnail returns the post images whose thumbnail_path is
// NULL, oldest post first, then in display order. Used by cmd/thumbs only, so
// it is not on service.PostStore.
func (r *PostRepository) ListImagesMissingThumbnail(ctx context.Context) ([]ImageMissingThumbnail, error) {
	stmt := table.PostImages.
		SELECT(
			table.PostImages.ID.AS("image_missing_thumbnail.id"),
			table.PostImages.PostID.AS("image_missing_thumbnail.post_id"),
			table.PostImages.Position.AS("image_missing_thumbnail.position"),
			table.PostImages.ImagePath.AS("image_missing_thumbnail.image_path"),
		).
		FROM(table.PostImages).
		WHERE(table.PostImages.ThumbnailPath.IS_NULL()).
		ORDER_BY(table.PostImages.PostID.ASC(), table.PostImages.Position.ASC())

	images := make([]ImageMissingThumbnail, 0)
	if err := stmt.QueryContext(ctx, r.db, &images); err != nil {
		return nil, err
	}
	return images, nil
}

// SetImageThumbnailPath records the thumbnail of the post image with the given
// ID. For the cover (position 0) it also updates posts.thumbnail_path, in the
// same transaction. It is not an edit by the user, so updated_at is left
// alone. Returns ErrorPostImageNotFound when no image matches (e.g. its post
// was deleted meanwhile). Used by cmd/thumbs only.
func (r *PostRepository) SetImageThumbnailPath(ctx context.Context, imageID int64, thumbnailPath string) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	imageStmt := table.PostImages.
		UPDATE(table.PostImages.ThumbnailPath).
		SET(postgres.String(thumbnailPath)).
		WHERE(table.PostImages.ID.EQ(postgres.Int64(imageID))).
		RETURNING(table.PostImages.PostID, table.PostImages.Position)

	var updated []model.PostImages
	if err = imageStmt.QueryContext(ctx, tx, &updated); err != nil {
		return err
	}
	if len(updated) == 0 {
		return ErrorPostImageNotFound
	}

	if updated[0].Position == 0 {
		coverStmt := table.Posts.
			UPDATE(table.Posts.ThumbnailPath).
			SET(postgres.String(thumbnailPath)).
			WHERE(table.Posts.ID.EQ(postgres.Int64(updated[0].PostID)))
		if _, err = coverStmt.ExecContext(ctx, tx); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *PostRepository) DeletePostByID(ctx context.Context, id int64) error {
	stmt := table.Posts.
		DELETE().
		WHERE(table.Posts.ID.EQ(postgres.Int64(id)))

	result, err := stmt.ExecContext(ctx, r.db)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrorPostNotFound
	}

	return nil
}
