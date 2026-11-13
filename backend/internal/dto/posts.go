package dto

import "time"

type PostResponse struct {
	ID       int64  `json:"id" sql:"primary_key"`
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	// ImagePath and ThumbnailPath are the cover, i.e. the first image. They
	// are what a feed card shows.
	ImagePath string `json:"image_path"`
	// ThumbnailPath is the small JPEG for grids; nil (omitted) when the post
	// has none, and clients then show image_path.
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
	// ImageCount is how many images the post has (at least 1).
	ImageCount int `json:"image_count"`
	// Images are all of the post's images in display order. Only a single
	// post (GET /posts/{id}, create, update) carries them; lists omit them,
	// since a card needs only the cover and the count.
	Images     []PostImageResponse `json:"images,omitempty"`
	Caption    string              `json:"caption"`
	Location   *string             `json:"location,omitempty"`
	CameraBody *string             `json:"camera_body,omitempty"`
	Lens       *string             `json:"lens,omitempty"`
	CreatedAt  time.Time           `json:"created_at"`
	UpdatedAt  time.Time           `json:"updated_at"`
}

// PostImageResponse is one image of a post. ID is the post_images row, used
// by go-jet to group joined rows; it is not part of the API.
type PostImageResponse struct {
	ID        int64  `json:"-" sql:"primary_key"`
	ImagePath string `json:"image_path"`
	// ThumbnailPath is nil (omitted) when the image has no thumbnail.
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
}
