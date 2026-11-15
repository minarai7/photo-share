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
// Images[0] is the cover and is also stored on the posts row, with the
// number of images. Tint is the post's page colour, nil when unknown.
type CreatePostParams struct {
	UserID     int64
	Images     []CreatePostImageParams
	Caption    string
	Location   *string
	CameraBody *string
	Lens       *string
	Tint       *string
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

// PostSort is the order of a list of posts.
type PostSort string

const (
	// SortNewest: created_at DESC, id DESC (the default).
	SortNewest PostSort = "newest"
	// SortOldest: created_at ASC, id ASC.
	SortOldest PostSort = "oldest"
	// SortMost: most images first (image_count DESC), then newest first.
	SortMost PostSort = "most"
)

// PhotosFilter keeps posts by their number of images.
type PhotosFilter string

const (
	PhotosAny    PhotosFilter = "any"    // every post (also the zero value "")
	PhotosSingle PhotosFilter = "single" // exactly one image
	PhotosSeries PhotosFilter = "series" // two or more
)

// PostFilter selects which posts a list or a count covers.
type PostFilter struct {
	// UserIDs, when non-empty, keeps only those users' posts.
	UserIDs []int64
	Photos  PhotosFilter
}

// PostCursor is the position after which a page of posts starts: the last
// post the client already has. ImageCount is used by SortMost only.
type PostCursor struct {
	CreatedAt  time.Time
	ID         int64
	ImageCount int
}

// ListPostsParams selects a page of posts.
type ListPostsParams struct {
	PostFilter
	// Sort is the order; "" means SortNewest.
	Sort PostSort
	// After, when set, keeps only posts after the cursor in Sort's order,
	// i.e. the page after the one that ended there.
	After *PostCursor
	// Limit caps the number of posts; 0 means no limit.
	Limit int
}

// filterConditions is PostFilter as SQL.
func filterConditions(f PostFilter) []postgres.BoolExpression {
	var conditions []postgres.BoolExpression
	if len(f.UserIDs) > 0 {
		ids := make([]postgres.Expression, len(f.UserIDs))
		for i, id := range f.UserIDs {
			ids[i] = postgres.Int64(id)
		}
		conditions = append(conditions, table.Posts.UserID.IN(ids...))
	}
	switch f.Photos {
	case PhotosSingle:
		conditions = append(conditions, table.Posts.ImageCount.EQ(postgres.Int(1)))
	case PhotosSeries:
		conditions = append(conditions, table.Posts.ImageCount.GT_EQ(postgres.Int(2)))
	}
	return conditions
}

// ListPosts returns a page of posts in p.Sort's order, with their cover and
// image count but without Images: one row per post, so LIMIT pages by post.
// Each order has an index (posts_created_at_id_idx, read backwards for
// oldest; posts_image_count_created_at_id_idx) and a keyset cursor on the
// same columns, so every page is an index range scan.
func (r *PostRepository) ListPosts(ctx context.Context, p ListPostsParams) ([]dto.PostResponse, error) {
	conditions := filterConditions(p.PostFilter)

	var orderBy []postgres.OrderByClause
	switch p.Sort {
	case SortOldest:
		orderBy = []postgres.OrderByClause{table.Posts.CreatedAt.ASC(), table.Posts.ID.ASC()}
		if c := p.After; c != nil {
			conditions = append(conditions,
				postgres.ROW(table.Posts.CreatedAt, table.Posts.ID).
					GT(postgres.ROW(postgres.TimestampzT(c.CreatedAt), postgres.Int64(c.ID))))
		}
	case SortMost:
		orderBy = []postgres.OrderByClause{table.Posts.ImageCount.DESC(), table.Posts.CreatedAt.DESC(), table.Posts.ID.DESC()}
		if c := p.After; c != nil {
			conditions = append(conditions,
				postgres.ROW(table.Posts.ImageCount, table.Posts.CreatedAt, table.Posts.ID).
					LT(postgres.ROW(postgres.Int(int64(c.ImageCount)), postgres.TimestampzT(c.CreatedAt), postgres.Int64(c.ID))))
		}
	default: // newest
		orderBy = []postgres.OrderByClause{table.Posts.CreatedAt.DESC(), table.Posts.ID.DESC()}
		if c := p.After; c != nil {
			conditions = append(conditions,
				postgres.ROW(table.Posts.CreatedAt, table.Posts.ID).
					LT(postgres.ROW(postgres.TimestampzT(c.CreatedAt), postgres.Int64(c.ID))))
		}
	}

	stmt := postgres.SELECT(
		table.Posts.ID.AS("post_response.id"),
		table.Posts.UserID.AS("post_response.user_id"),
		table.Users.Username.AS("post_response.username"),
		table.Posts.ImagePath.AS("post_response.image_path"),
		table.Posts.ThumbnailPath.AS("post_response.thumbnail_path"),
		table.Posts.ImageCount.AS("post_response.image_count"),
		table.Posts.Tint.AS("post_response.tint"),
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
	stmt = stmt.ORDER_BY(orderBy...)
	if p.Limit > 0 {
		stmt = stmt.LIMIT(int64(p.Limit))
	}

	posts := make([]dto.PostResponse, 0)
	if err := stmt.QueryContext(ctx, r.db, &posts); err != nil {
		return nil, err
	}
	return posts, nil
}

// postCount receives CountPosts' row. go-jet maps an alias onto a struct by
// its type name ("post_count.n"), so this can't be an anonymous struct.
type postCount struct{ N int64 }

// CountPosts returns how many posts match f.
func (r *PostRepository) CountPosts(ctx context.Context, f PostFilter) (int, error) {
	stmt := postgres.SELECT(postgres.COUNT(postgres.STAR).AS("post_count.n")).FROM(table.Posts)
	if conditions := filterConditions(f); len(conditions) > 0 {
		stmt = stmt.WHERE(postgres.AND(conditions...))
	}
	var count postCount
	if err := stmt.QueryContext(ctx, r.db, &count); err != nil {
		return 0, err
	}
	return int(count.N), nil
}

// UserWork counts the user's posts and the images in them. A user without
// posts (or without an account) has zeros.
func (r *PostRepository) UserWork(ctx context.Context, userID int64) (dto.UserWork, error) {
	stmt := postgres.SELECT(
		postgres.COUNT(postgres.STAR).AS("user_work.post_count"),
		postgres.COALESCE(postgres.SUM(table.Posts.ImageCount), postgres.Int(0)).AS("user_work.photo_count"),
	).FROM(table.Posts).
		WHERE(table.Posts.UserID.EQ(postgres.Int64(userID)))
	var work dto.UserWork
	if err := stmt.QueryContext(ctx, r.db, &work); err != nil {
		return dto.UserWork{}, err
	}
	return work, nil
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
		table.Posts.Tint.AS("post_response.tint"),
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
			table.Posts.Lens,
			table.Posts.ImageCount,
			table.Posts.Tint).
		MODEL(model.Posts{
			UserID:        p.UserID,
			ImagePath:     cover.ImagePath,
			ThumbnailPath: cover.ThumbnailPath,
			Caption:       p.Caption,
			Location:      p.Location,
			CameraBody:    p.CameraBody,
			Lens:          p.Lens,
			ImageCount:    int16(len(p.Images)),
			Tint:          p.Tint,
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

// PostMissingTint is a post without a page colour, for the tint backfill:
// its cover and the cover's thumbnail (nil when it has none).
type PostMissingTint struct {
	ID            int64
	ImagePath     string
	ThumbnailPath *string
}

// ListPostsMissingTint returns the posts whose tint is NULL, oldest first.
// Used by cmd/tints only, so it is not on service.PostStore.
func (r *PostRepository) ListPostsMissingTint(ctx context.Context) ([]PostMissingTint, error) {
	stmt := table.Posts.
		SELECT(
			table.Posts.ID.AS("post_missing_tint.id"),
			table.Posts.ImagePath.AS("post_missing_tint.image_path"),
			table.Posts.ThumbnailPath.AS("post_missing_tint.thumbnail_path"),
		).
		FROM(table.Posts).
		WHERE(table.Posts.Tint.IS_NULL()).
		ORDER_BY(table.Posts.ID.ASC())

	posts := make([]PostMissingTint, 0)
	if err := stmt.QueryContext(ctx, r.db, &posts); err != nil {
		return nil, err
	}
	return posts, nil
}

// SetPostTint records a post's page colour. It is not an edit by the user,
// so updated_at is left alone. Returns ErrorPostNotFound when no post has
// the ID (e.g. it was deleted meanwhile). Used by cmd/tints only.
func (r *PostRepository) SetPostTint(ctx context.Context, postID int64, tint string) error {
	stmt := table.Posts.
		UPDATE(table.Posts.Tint).
		SET(postgres.String(tint)).
		WHERE(table.Posts.ID.EQ(postgres.Int64(postID)))
	result, err := stmt.ExecContext(ctx, r.db)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrorPostNotFound
	}
	return nil
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
