package handler

import (
	"encoding/json"
	"net/http"

	"backend/internal/repository"
	"backend/internal/service"
)

type PostHandler struct {
	postService *service.PostService
}

func NewPostHandler(postService *service.PostService) *PostHandler {
	return &PostHandler{postService: postService}
}

type CreatePostRequest struct {
	ImagePath  string `json:"image_path"`
	Caption    string `json:"caption"`
	Location   string `json:"location"`
	CameraBody string `json:"camera_body"`
	Lens       string `json:"lens"`
}

func stringPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (h *PostHandler) CreatePost(w http.ResponseWriter, r *http.Request) {
	var req CreatePostRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	post := repository.CreatePostParams{
		ImagePath:  req.ImagePath,
		Caption:    req.Caption,
		Location:   req.Location,
		CameraBody: req.CameraBody,
		Lens:       req.Lens,
	}

	if _, err := h.postService.CreatePost(r.Context(), post); err != nil {
		http.Error(w, "failed to create post", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"message":"post created"}`))
}

func (h *PostHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	posts, err := h.postService.ListPosts(r.Context())
	if err != nil {
		http.Error(w, "failed to list posts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}
