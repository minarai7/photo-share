package handler

import "time"

type CreatePostRequest struct {
	ImagePath  string  `json:"image_path"`
	Caption    string  `json:"caption"`
	Location   *string `json:"location,omitempty"`
	CameraBody *string `json:"camera_body,omitempty"`
	Lens       *string `json:"lens,omitempty"`
}

type Post struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	ImagePath  string    `json:"image_path"`
	Location   *string   `json:"location,omitempty"`
	CameraBody *string   `json:"camera_body,omitempty"`
	Lens       *string   `json:"lens,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
