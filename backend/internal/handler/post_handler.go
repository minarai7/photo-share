package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/httpx"
	"backend/internal/middleware"
	"backend/internal/service"
)

type PostHandler struct {
	postService *service.PostService
}

func NewPostHandler(postService *service.PostService) *PostHandler {
	return &PostHandler{postService: postService}
}

func toPostResponse(post *model.Posts) PostResponse {
	return PostResponse{
		ID:         post.ID,
		UserID:     post.UserID,
		ImagePath:  post.ImagePath,
		Caption:    post.Caption,
		Location:   post.Location,
		CameraBody: post.CameraBody,
		Lens:       post.Lens,
		CreatedAt:  post.CreatedAt,
		UpdatedAt:  post.UpdatedAt,
	}
}

func (h *PostHandler) GetPostByID(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/posts/")

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_post_id",
				Message: "post id must be a number",
			},
		})
		return
	}

	post, err := h.postService.GetPostByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrPostNotFound) {
			httpx.WriteJSON(w, http.StatusNotFound, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "post_not_found",
					Message: "post not found",
				},
			})
			return
		}

		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "internal_error",
				Message: "failed to get post",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, toPostResponse(post))
}

func (h *PostHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	posts, err := h.postService.ListPosts(r.Context())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "list_posts_failed",
				Message: "failed to list posts",
			},
		})
		return
	}

	resp := make([]PostResponse, 0, len(posts))
	for _, post := range posts {
		resp = append(resp, toPostResponse(&post))
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *PostHandler) CreatePost(w http.ResponseWriter, r *http.Request) {
	var req CreatePostRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_json",
				Message: "request body is invalid",
			},
		})
		return
	}

	userID, err := middleware.GetUserID(r.Context())
	if err != nil {
		httpx.WriteJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "unauthorized",
				Message: err.Error(),
			},
		})
		return
	}

	post := service.CreatePostParams{
		UserID:     userID,
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

	httpx.WriteJSON(w, http.StatusCreated, toPostResponse(resp))
}
