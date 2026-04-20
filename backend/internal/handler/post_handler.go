package handler

import (
	"encoding/json"
	"net/http"

	"backend/internal/httpx"
	"backend/internal/repository"
	"backend/internal/service"
)

type PostHandler struct {
	postService *service.PostService
}

func NewPostHandler(postService *service.PostService) *PostHandler {
	return &PostHandler{postService: postService}
}

func stringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (h *PostHandler) CreatePost(w http.ResponseWriter, r *http.Request) {
	var req CreatePostRequest

	// LATER: FIX {"error":"internal server error"} SOMEWHERE AROUND HERE

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_json",
				Message: "request body is invalid",
			},
		})
		return
	}

	currentUserID := int64(1)

	post := repository.CreatePostParams{
		UserID:     currentUserID,
		ImagePath:  req.ImagePath,
		Caption:    req.Caption,
		Location:   req.Location,
		CameraBody: req.CameraBody,
		Lens:       req.Lens,
	}

	resp, err := h.postService.CreatePost(r.Context(), post)
	if err != nil {
		_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "create_post_failed",
				Message: err.Error(),
			},
		})
		return
	}

	_ = httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *PostHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	posts, err := h.postService.ListPosts(r.Context())
	if err != nil {
		_ = httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "list_posts_failed",
				Message: err.Error(),
			},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}
