// The DB stores public paths like /uploads/<filename>.

package service

import (
	"backend/internal/exifmeta"
	"backend/internal/imagestrip"
	"backend/internal/storage"
	"backend/internal/thumbnail"
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"path"
	"strings"
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
// CameraBody and Lens are empty when the photo does not record them;
// ThumbnailPath is empty when no thumbnail could be made.
type UploadedImage struct {
	ImagePath     string
	ThumbnailPath string
	CameraBody    string
	Lens          string
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

	imagePath := uploadsPrefix + filename
	return &UploadedImage{
		ImagePath:     imagePath,
		ThumbnailPath: s.saveThumbnail(ctx, file, header.Size, imagePath),
		CameraBody:    gear.CameraBody,
		Lens:          gear.Lens,
	}, nil
}

// saveThumbnail stores the grid thumbnail for the image just saved at
// imagePath and returns its public path. It is best-effort: on any failure it
// logs and returns "", the upload still succeeds and the grid shows the original.
func (s *UploadService) saveThumbnail(ctx context.Context, src io.ReaderAt, size int64, imagePath string) string {
	thumbPath := ThumbnailPathFor(imagePath)
	data, err := thumbnail.Make(ctx, src, size)
	if err == nil {
		err = s.storage.Save(ctx, bytesFile{bytes.NewReader(data)}, strings.TrimPrefix(thumbPath, uploadsPrefix), "image/jpeg")
	}
	if err != nil {
		log.Printf("upload %s: no thumbnail: %v", imagePath, err)
		return ""
	}
	return thumbPath
}

const uploadsPrefix = "/uploads/"

// ThumbnailPathFor is the public path of the thumbnail belonging to the
// stored image at imagePath: /uploads/1730_abc12345.png has
// /uploads/1730_abc12345_w800.jpg.
func ThumbnailPathFor(imagePath string) string {
	return strings.TrimSuffix(imagePath, path.Ext(imagePath)) + thumbnail.Suffix
}

// bytesFile is an in-memory multipart.File, which is what Storage.Save takes.
type bytesFile struct{ *bytes.Reader }

func (bytesFile) Close() error { return nil }

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
