package handler

import (
	"backend/internal/httpx"
	"backend/internal/service"
	"errors"
	"io"
	"net/http"
	"path"
	"strings"
)

type UploadHandler struct {
	uploadService  *service.UploadService
	maxUploadBytes int64
}

type UploadImageResponse struct {
	ImagePath string `json:"image_path"`
}

func NewUploadHandler(uploadService *service.UploadService, maxUploadBytes int64) *UploadHandler {
	return &UploadHandler{
		uploadService:  uploadService,
		maxUploadBytes: maxUploadBytes,
	}
}

func (h *UploadHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes)

	if err := r.ParseMultipartForm(h.maxUploadBytes); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_multipart_form",
				Message: "invalid upload form or file too large",
			},
		})
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "image_required",
				Message: "image file is required",
			},
		})
		return
	}
	defer file.Close()

	imagePath, err := h.uploadService.SaveImage(r.Context(), file, header)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrFileRequired):
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "image_required",
					Message: "image file is required",
				},
			})
			return

		case errors.Is(err, service.ErrFileTooLarge):
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "file_too_large",
					Message: "image exceeds max allowed size",
				},
			})
			return

		case errors.Is(err, service.ErrInvalidFileType):
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "invalid_file_type",
					Message: "only jpeg, png, and webp are allowed",
				},
			})
			return

		default:
			httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "upload_failed",
					Message: "failed to save uploaded image",
				},
			})
			return
		}
	}

	httpx.WriteJSON(w, http.StatusCreated, UploadImageResponse{
		ImagePath: imagePath,
	})
}

func (h *UploadHandler) Get(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(
		r.URL.Path,
		"/uploads/",
	)

	if filename == "" || filename != path.Base(filename) {
		http.NotFound(w, r)
		return
	}

	file, err := h.uploadService.Get(
		r.Context(),
		filename,
	)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Body.Close()

	if file.ContentType != "" {
		w.Header().Set(
			"Content-Type",
			file.ContentType,
		)
	}

	if _, err := io.Copy(w, file.Body); err != nil {
		return
	}
}
