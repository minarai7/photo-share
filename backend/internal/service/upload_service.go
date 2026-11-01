// The DB stores public paths like /uploads/<filename>.

package service

import (
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

func (s *UploadService) SaveImage(ctx context.Context, file multipart.File, header *multipart.FileHeader) (string, error) {
	if file == nil || header == nil {
		return "", ErrFileRequired
	}

	if header.Size > s.maxUploadBytes {
		return "", ErrFileTooLarge
	}

	firstBytes := make([]byte, 512)
	n, err := file.Read(firstBytes)
	if err != nil && err != io.EOF {
		return "", err
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}

	contentType := http.DetectContentType(firstBytes[:n])

	ext, err := extensionFromContentType(contentType)
	if err != nil {
		return "", err
	}

	filename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), randomString(8), ext)

	err = s.storage.Save(ctx, file, filename, contentType)
	if err != nil {
		return "", err
	}

	return "/uploads/" + filename, nil
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
