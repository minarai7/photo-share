package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

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

func readPostID(r *http.Request) (int64, error) {
	idStr := strings.TrimPrefix(r.URL.Path, "/posts/")
	return strconv.ParseInt(idStr, 10, 64)
}

func (h *PostHandler) GetPostByID(w http.ResponseWriter, r *http.Request) {
	id, err := readPostID(r)
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

	httpx.WriteJSON(w, http.StatusOK, post)
}

// ListPosts serves GET /posts. Query parameters, all optional:
//   - user_id: only that user's posts
//   - limit: page size (1..service.MaxPageSize); without it, every post
//   - before_created_at (RFC 3339) + before_id: the last post of the
//     previous page; the response starts after it
func (h *PostHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	params, code, msg := parseListPostsQuery(r)
	if code != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{Code: code, Message: msg},
		})
		return
	}

	posts, err := h.postService.ListPosts(r.Context(), params)
	if err != nil {
		if errors.Is(err, service.ErrInvalidPagination) {
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{Code: "invalid_pagination", Message: err.Error()},
			})
			return
		}
		log.Printf("list posts: %v", err)
		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "list_posts_failed",
				Message: "failed to list posts",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, posts)
}

// parseListPostsQuery reads GET /posts's query. On bad input it returns an
// error code and message for a 400 instead of params.
func parseListPostsQuery(r *http.Request) (params service.ListPostsParams, code, msg string) {
	q := r.URL.Query()

	if v := q.Get("user_id"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil || id <= 0 {
			return params, "invalid_user_id", "user_id must be a positive number"
		}
		params.UserID = &id
	}

	invalid := service.ErrInvalidPagination.Error()
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return params, "invalid_pagination", invalid
		}
		params.Limit = n
	}

	createdAt, id := q.Get("before_created_at"), q.Get("before_id")
	if createdAt != "" || id != "" {
		at, err := time.Parse(time.RFC3339Nano, createdAt)
		if err != nil {
			return params, "invalid_pagination", invalid
		}
		postID, err := strconv.ParseInt(id, 10, 64)
		if err != nil {
			return params, "invalid_pagination", invalid
		}
		params.Before = &service.PostCursor{CreatedAt: at, ID: postID}
	}

	return params, "", ""
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

	images := make([]service.CreatePostImage, len(req.Images))
	for i, img := range req.Images {
		images[i] = service.CreatePostImage{ImagePath: img.ImagePath, ThumbnailPath: img.ThumbnailPath}
	}

	post := service.CreatePostParams{
		UserID:        userID,
		Images:        images,
		ImagePath:     req.ImagePath,
		ThumbnailPath: req.ThumbnailPath,
		Caption:       req.Caption,
		Location:      req.Location,
		CameraBody:    req.CameraBody,
		Lens:          req.Lens,
	}

	resp, err := h.postService.CreatePost(r.Context(), post)
	if err != nil {
		if errors.Is(err, service.ErrInvalidThumbnailPath) {
			_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "invalid_thumbnail_path",
					Message: "thumbnail_path must be the thumbnail of image_path",
				},
			})
			return
		}
		if errors.Is(err, service.ErrTooManyImages) {
			_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "too_many_images",
					Message: err.Error(),
				},
			})
			return
		}
		if errors.Is(err, service.ErrDuplicateImage) {
			_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "duplicate_image",
					Message: err.Error(),
				},
			})
			return
		}
		if errors.Is(err, service.ErrUserRequired) || errors.Is(err, service.ErrImagePathRequired) {
			_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "create_post_failed",
					Message: err.Error(),
				},
			})
			return
		}

		// Raw DB errors stay in the server log; clients get a generic message.
		log.Printf("create post: %v", err)
		_ = httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "create_post_failed",
				Message: "failed to create post",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *PostHandler) UpdatePost(w http.ResponseWriter, r *http.Request) {
	postID, err := readPostID(r)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_post_id",
				Message: "post id must be a number",
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

	var req UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_json",
				Message: "request body is invalid",
			},
		})
		return
	}

	updatedPost, err := h.postService.UpdatePost(r.Context(), service.UpdatePostParams{
		PostID:     postID,
		UserID:     userID,
		Caption:    req.Caption,
		Location:   req.Location,
		CameraBody: req.CameraBody,
		Lens:       req.Lens,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPostNotFound):
			httpx.WriteJSON(w, http.StatusNotFound, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "post_not_found",
					Message: "post not found",
				},
			})
		case errors.Is(err, service.ErrForbidden):
			httpx.WriteJSON(w, http.StatusForbidden, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "forbidden",
					Message: "you cannot edit this post",
				},
			})
		default:
			httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "internal_error",
					Message: "failed to update post",
				},
			})
		}
		return
	}

	httpx.WriteJSON(w, http.StatusOK, updatedPost)
}

func (h *PostHandler) DeletePost(w http.ResponseWriter, r *http.Request) {
	postID, err := readPostID(r)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_post_id",
				Message: "post id must be a number",
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

	err = h.postService.DeletePost(r.Context(), service.DeletePostParams{
		PostID: postID,
		UserID: userID,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPostNotFound):
			httpx.WriteJSON(w, http.StatusNotFound, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "post_not_found",
					Message: "post not found",
				},
			})
		case errors.Is(err, service.ErrForbidden):
			httpx.WriteJSON(w, http.StatusForbidden, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "forbidden",
					Message: "you cannot edit this post",
				},
			})
		default:
			httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "internal_error",
					Message: "failed to update post",
				},
			})
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
