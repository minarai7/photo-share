// The DB stores public paths like /uploads/<filename>.

package service

import (
	"backend/internal/exifmeta"
	"backend/internal/imagestrip"
	"backend/internal/storage"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

var (
	ErrFileRequired    = errors.New("file is required")
	ErrFileTooLarge    = errors.New("file is too large")
	ErrInvalidFileType = errors.New("invalid file type")
	// ErrInvalidImage: the type is allowed but the file's structure is broken,
	// so its metadata cannot be removed and it is not stored.
	ErrInvalidImage = errors.New("invalid image")
)

type UploadService struct {
	storage        storage.Storage
	maxUploadBytes int64
}

func NewUploadService(storage storage.Storage, maxUploadBytes int64) *UploadService {
	return &UploadService{
		storage:        storage,
		maxUploadBytes: maxUploadBytes,
	}
}

// UploadedImage is a stored image plus the gear read from its EXIF data.
// CameraBody and Lens are empty when the photo does not record them.
type UploadedImage struct {
	ImagePath  string
	CameraBody string
	Lens       string
}

func (s *UploadService) SaveImage(ctx context.Context, file multipart.File, header *multipart.FileHeader) (*UploadedImage, error) {
	if file == nil || header == nil {
		return nil, ErrFileRequired
	}

	if header.Size > s.maxUploadBytes {
		return nil, ErrFileTooLarge
	}

	firstBytes := make([]byte, 512)
	n, err := file.Read(firstBytes)
	if err != nil && err != io.EOF {
		return nil, err
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	contentType := http.DetectContentType(firstBytes[:n])

	ext, err := extensionFromContentType(contentType)
	if err != nil {
		return nil, err
	}

	// Read the gear first: stripping removes it, along with GPS and every other
	// piece of metadata, before the file becomes publicly downloadable.
	gear := exifmeta.Read(file, header.Size)

	stripped, err := imagestrip.Strip(file, header.Size)
	if err != nil {
		if errors.Is(err, imagestrip.ErrMalformed) || errors.Is(err, imagestrip.ErrUnsupported) {
			return nil, ErrInvalidImage
		}
		return nil, err
	}

	filename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), randomString(8), ext)

	// stripped reads from file lazily, so large uploads are not copied into memory.
	err = s.storage.Save(ctx, stripped, filename, contentType)
	if err != nil {
		return nil, err
	}

	return &UploadedImage{
		ImagePath:  "/uploads/" + filename,
		CameraBody: gear.CameraBody,
		Lens:       gear.Lens,
	}, nil
}

func (s *UploadService) Get(
	ctx context.Context,
	filename string,
) (*storage.StoredFile, error) {
	return s.storage.Open(ctx, filename)
}

func extensionFromContentType(contentType string) (string, error) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", nil
	case "image/png":
		return ".png", nil
	case "image/webp":
		return ".webp", nil
	default:
		return "", ErrInvalidFileType
	}
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"

	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "fallback"
	}

	for i := range b {
		b[i] = letters[int(b[i])%len(letters)]
	}
	return string(b)
}
