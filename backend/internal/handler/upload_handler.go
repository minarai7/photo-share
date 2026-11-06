package handler

import (
	"backend/internal/httpx"
	"backend/internal/service"
	"errors"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
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

	hdr := w.Header()
	if file.ContentType != "" {
		hdr.Set("Content-Type", file.ContentType)
	}
	hdr.Set("Cache-Control", uploadCacheControl)
	if file.ETag != "" {
		hdr.Set("ETag", file.ETag)
	}

	// Local files: ServeContent sets Content-Length and Last-Modified and
	// answers If-None-Match / If-Modified-Since (304) and Range (206) itself.
	if rs, ok := file.Body.(io.ReadSeeker); ok {
		http.ServeContent(w, r, filename, file.LastModified, rs)
		return
	}

	// S3 bodies can't seek, so pass the metadata through and handle the
	// conditional request here. No Range support on this path.
	if !file.LastModified.IsZero() {
		hdr.Set("Last-Modified", file.LastModified.UTC().Format(http.TimeFormat))
	}
	if notModified(r, file.ETag, file.LastModified) {
		hdr.Del("Content-Type")
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if file.ContentLength > 0 {
		hdr.Set("Content-Length", strconv.FormatInt(file.ContentLength, 10))
	}
	if r.Method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, file.Body); err != nil {
		return
	}
}

// uploadCacheControl lets browsers keep an image forever: stored filenames are
// unique (<unixnano>_<random8><ext>) and never reused for different content.
// cmd/stripmeta -apply does rewrite files in place, so run any backfill before
// a deploy that turns this on, or clients keep the copies with metadata.
const uploadCacheControl = "public, max-age=31536000, immutable"

// notModified evaluates If-None-Match, or If-Modified-Since when that header
// is absent (RFC 9110 §13.2.2), for a GET/HEAD of a file with the given
// validators.
func notModified(r *http.Request, etag string, lastModified time.Time) bool {
	if inm := r.Header.Get("If-None-Match"); inm != "" {
		if etag == "" {
			return false
		}
		for candidate := range strings.SplitSeq(inm, ",") {
			candidate = strings.TrimSpace(candidate)
			if candidate == "*" || weakETag(candidate) == weakETag(etag) {
				return true
			}
		}
		return false
	}

	ims := r.Header.Get("If-Modified-Since")
	if ims == "" || lastModified.IsZero() {
		return false
	}
	t, err := http.ParseTime(ims)
	if err != nil {
		return false
	}
	return !lastModified.Truncate(time.Second).After(t)
}

// weakETag drops the W/ prefix: If-None-Match uses weak comparison.
func weakETag(tag string) string {
	return strings.TrimPrefix(tag, "W/")
}
