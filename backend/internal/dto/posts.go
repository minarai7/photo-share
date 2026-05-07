package dto

import "time"

type PostResponse struct {
	ID         int64     `json:"id" sql:"primary_key"`
	UserID     int64     `json:"user_id"`
	Username   string    `json:"username"`
	ImagePath  string    `json:"image_path"`
	Caption    string    `json:"caption"`
	Location   *string   `json:"location,omitempty"`
	CameraBody *string   `json:"camera_body,omitempty"`
	Lens       *string   `json:"lens,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
