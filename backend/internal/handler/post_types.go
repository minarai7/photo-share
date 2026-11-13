package handler

type CreatePostRequest struct {
	// Images are the post's images in display order; the first is the cover.
	Images []CreatePostImageRequest `json:"images,omitempty"`
	// ImagePath and ThumbnailPath are the single-image form used by clients
	// from before posts could have several images. Ignored when Images is set.
	ImagePath     string  `json:"image_path,omitempty"`
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
	Caption       string  `json:"caption"`
	Location      *string `json:"location,omitempty"`
	CameraBody    *string `json:"camera_body,omitempty"`
	Lens          *string `json:"lens,omitempty"`
}

type CreatePostImageRequest struct {
	ImagePath string `json:"image_path"`
	// ThumbnailPath is the thumbnail_path from the upload response, if any.
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
}

type UpdatePostRequest struct {
	Caption    string  `json:"caption"`
	Location   *string `json:"location,omitempty"`
	CameraBody *string `json:"camera_body,omitempty"`
	Lens       *string `json:"lens,omitempty"`
}
