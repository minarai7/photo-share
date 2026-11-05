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

// UploadImageResponse carries the camera and lens read from the photo's EXIF
// data (omitted when absent) so the client can fill in fields the user left blank.
type UploadImageResponse struct {
	ImagePath  string `json:"image_path"`
	CameraBody string `json:"camera_body,omitempty"`
	Lens       string `json:"lens,omitempty"`
}

func NewUploadHandler(uploadService *service.UploadService, maxUploadBytes int64) *UploadHandler {
	return &UploadHandler{
		uploadService:  uploadService,
		maxUploadBytes: maxUploadBytes,
	}
}

const (
	// multipartOverhead is allowed on top of maxUploadBytes for the multipart
	// boundaries and part headers, so a file of exactly the limit still fits.
	// The file size itself is enforced by UploadService.
	multipartOverhead = 1 << 20

	// uploadMemoryBytes caps how much of an upload is held in RAM; anything
	// larger is spooled to a temp file (the Fargate task only has 0.5 GB).
	uploadMemoryBytes = 8 << 20
)

func (h *UploadHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes+multipartOverhead)

	if err := r.ParseMultipartForm(min(h.maxUploadBytes, uploadMemoryBytes)); err != nil {
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			writeFileTooLarge(w)
			return
		}
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

	uploaded, err := h.uploadService.SaveImage(r.Context(), file, header)
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
			writeFileTooLarge(w)
			return

		case errors.Is(err, service.ErrInvalidFileType):
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "invalid_file_type",
					Message: "only jpeg, png, and webp are allowed",
				},
			})
			return

		case errors.Is(err, service.ErrInvalidImage):
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "invalid_image",
					Message: "image file is damaged or incomplete",
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
		ImagePath:  uploaded.ImagePath,
		CameraBody: uploaded.CameraBody,
		Lens:       uploaded.Lens,
	})
}

func writeFileTooLarge(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
		Error: httpx.ErrorDetail{
			Code:    "file_too_large",
			Message: "image exceeds max allowed size",
		},
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
