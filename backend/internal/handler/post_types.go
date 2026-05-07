package handler

type CreatePostRequest struct {
	ImagePath  string  `json:"image_path"`
	Caption    string  `json:"caption"`
	Location   *string `json:"location,omitempty"`
	CameraBody *string `json:"camera_body,omitempty"`
	Lens       *string `json:"lens,omitempty"`
}

type UpdatePostRequest struct {
	Caption    string  `json:"caption"`
	Location   *string `json:"location,omitempty"`
	CameraBody *string `json:"camera_body,omitempty"`
	Lens       *string `json:"lens,omitempty"`
}
