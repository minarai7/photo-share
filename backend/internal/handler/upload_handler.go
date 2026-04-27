package handler

import (
	"backend/internal/httpx"
	"backend/internal/service"
	"errors"
	"net/http"
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

	imagePath, err := h.uploadService.SaveImage(file, header)
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
