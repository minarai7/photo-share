package service

import (
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // thumbnails are JPEGs
	"io"
	"strings"

	"backend/internal/storage"
	"backend/internal/tint"
)

// StorageTints reads a stored thumbnail and computes its tint.
type StorageTints struct {
	Storage storage.Storage
}

// maxThumbnailBytes bounds what TintFor reads: a thumbnail is at most
// 800×1600 at quality 80, far below this.
const maxThumbnailBytes = 4 << 20

var errNotAThumbnail = errors.New("not a stored thumbnail")

func (s StorageTints) TintFor(ctx context.Context, thumbnailPath string) (string, error) {
	name, ok := strings.CutPrefix(thumbnailPath, uploadsPrefix)
	if !ok || name == "" || strings.ContainsAny(name, `/\`) {
		return "", errNotAThumbnail
	}
	f, err := s.Storage.Open(ctx, name)
	if err != nil {
		return "", fmt.Errorf("open: %w", err)
	}
	defer f.Body.Close()
	img, _, err := image.Decode(io.LimitReader(f.Body, maxThumbnailBytes))
	if err != nil {
		return "", fmt.Errorf("decode: %w", err)
	}
	return tint.FromImage(img), nil
}
