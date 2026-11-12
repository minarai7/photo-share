package handler

type CreatePostRequest struct {
	ImagePath string `json:"image_path"`
	// ThumbnailPath is the thumbnail_path from the upload response, if any.
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
	Caption       string  `json:"caption"`
	Location      *string `json:"location,omitempty"`
	CameraBody    *string `json:"camera_body,omitempty"`
	Lens          *string `json:"lens,omitempty"`
}

type UpdatePostRequest struct {
	Caption    string  `json:"caption"`
	Location   *string `json:"location,omitempty"`
	CameraBody *string `json:"camera_body,omitempty"`
	Lens       *string `json:"lens,omitempty"`
}
