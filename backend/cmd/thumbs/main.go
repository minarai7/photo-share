// Command thumbs makes the grid thumbnails (see internal/thumbnail) for post
// images stored before uploads started making them, and records each one in
// post_images.thumbnail_path (and, for a post's cover, posts.thumbnail_path).
// It only looks at images whose thumbnail_path is NULL, so running it again
// is harmless.
//
// It reads the same settings as the server: DATABASE_URL plus the storage
// ones (STORAGE_DRIVER, UPLOAD_DIR, S3_BUCKET_NAME, AWS_REGION), from the
// environment or .env. Without -apply it makes each thumbnail in memory to
// check that it can, but saves and updates nothing.
//
// It is meant to run on a PC, not on the 1 GB server task, so its size limits
// are far above the server's (thumbnail.ServerLimits): images that uploads
// skip as too large still get a thumbnail here. Lower them with -max-mb and
// -max-mp on a small machine.
//
//	go run ./cmd/thumbs           # dry run
//	go run ./cmd/thumbs -apply    # save thumbnails and update the images
package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"backend/internal/config"
	dbpkg "backend/internal/db"
	"backend/internal/repository"
	"backend/internal/service"
	"backend/internal/storage"
	"backend/internal/thumbnail"
)

// postSource is the part of repository.PostRepository the backfill needs.
type postSource interface {
	ListImagesMissingThumbnail(ctx context.Context) ([]repository.ImageMissingThumbnail, error)
	SetImageThumbnailPath(ctx context.Context, imageID int64, thumbnailPath string) error
}

// Uploads are capped at MAX_UPLOAD_BYTES (32 MiB by default); anything far
// bigger is not one of ours and is not loaded into memory.
const maxFileBytes = 64 << 20

const uploadsPrefix = "/uploads/"

type summary struct {
	made, skipped, failed int
}

type options struct {
	apply  bool
	limits thumbnail.Limits
}

// errSkip marks images that can't have a thumbnail by design (not a stored
// upload, animated, too large); they keep showing their original.
var errSkip = errors.New("skipped")

func main() {
	apply := flag.Bool("apply", false, "save thumbnails and update post images (default: dry run, report only)")
	maxMB := flag.Int64("max-mb", 2048, "skip images whose decode needs more than this many MiB (server: 512)")
	maxMP := flag.Int64("max-mp", 250, "skip images over this many megapixels (server: 100)")
	flag.Parse()
	opts := options{
		apply:  *apply,
		limits: thumbnail.Limits{MaxPixels: *maxMP * 1_000_000, MaxBytes: *maxMB << 20},
	}

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	ctx := context.Background()

	database, err := dbpkg.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer database.Close()

	st, err := storage.New(ctx, storage.Config{
		Driver:    cfg.StorageDriver,
		UploadDir: cfg.UploadDir,
		AWSRegion: cfg.AWSRegion,
		S3Bucket:  cfg.S3BucketName,
	})
	if err != nil {
		log.Fatalf("initialize storage: %v", err)
	}

	where := cfg.UploadDir
	if cfg.StorageDriver == "s3" {
		where = "s3://" + cfg.S3BucketName + "/uploads/"
	}
	mode := "DRY RUN (pass -apply to save)"
	if *apply {
		mode = "APPLY"
	}
	fmt.Printf("%s: %s storage at %s, limits %d MP / %d MiB\n", mode, cfg.StorageDriver, where, *maxMP, *maxMB)

	sum, err := run(ctx, repository.NewPostRepository(database), st, opts, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
	if sum.failed > 0 {
		os.Exit(1)
	}
}

func run(ctx context.Context, posts postSource, st storage.Storage, opts options, out io.Writer) (summary, error) {
	apply := opts.apply
	missing, err := posts.ListImagesMissingThumbnail(ctx)
	if err != nil {
		return summary{}, fmt.Errorf("list images without a thumbnail: %w", err)
	}

	var sum summary
	for _, p := range missing {
		// "post 12 image 2": images are numbered from 1, as shown to users.
		label := fmt.Sprintf("post %d image %d %s", p.PostID, p.Position+1, p.ImagePath)
		thumbPath, before, after, err := thumbOne(ctx, posts, st, p, opts)
		switch {
		case errors.Is(err, errSkip):
			sum.skipped++
			fmt.Fprintf(out, "skipped     %s: %v\n", label, err)
		case err != nil:
			sum.failed++
			fmt.Fprintf(out, "FAILED      %s: %v\n", label, err)
		default:
			sum.made++
			verb := "would make "
			if apply {
				verb = "made       "
			}
			fmt.Fprintf(out, "%s %s -> %s (%d -> %d bytes)\n", verb, label, thumbPath, before, after)
		}
	}

	verb := "to make"
	if apply {
		verb = "made"
	}
	fmt.Fprintf(out, "%d images without a thumbnail: %d %s, %d skipped, %d failed\n",
		len(missing), sum.made, verb, sum.skipped, sum.failed)
	return sum, nil
}

// thumbOne makes the thumbnail for one post image and, with apply, stores it
// and records it on the image. It returns the thumbnail's path and the sizes
// of the original and the thumbnail.
func thumbOne(ctx context.Context, posts postSource, st storage.Storage, p repository.ImageMissingThumbnail, opts options) (string, int, int, error) {
	name, ok := strings.CutPrefix(p.ImagePath, uploadsPrefix)
	if !ok || name == "" || strings.ContainsAny(name, `/\`) {
		return "", 0, 0, fmt.Errorf("%w: not a stored upload", errSkip)
	}

	f, err := st.Open(ctx, name)
	if err != nil {
		return "", 0, 0, fmt.Errorf("open: %w", err)
	}
	data, err := io.ReadAll(io.LimitReader(f.Body, maxFileBytes+1))
	f.Body.Close()
	if err != nil {
		return "", 0, 0, fmt.Errorf("read: %w", err)
	}
	if len(data) > maxFileBytes {
		return "", 0, 0, fmt.Errorf("%w: larger than %d bytes", errSkip, maxFileBytes)
	}

	thumb, err := thumbnail.MakeWithin(ctx, bytes.NewReader(data), int64(len(data)), opts.limits)
	if err != nil {
		if errors.Is(err, thumbnail.ErrTooLarge) || errors.Is(err, thumbnail.ErrAnimated) {
			err = fmt.Errorf("%w: %v", errSkip, err)
		}
		return "", 0, 0, err
	}

	thumbPath := service.ThumbnailPathFor(p.ImagePath)
	if opts.apply {
		thumbName := strings.TrimPrefix(thumbPath, uploadsPrefix)
		if err := st.Save(ctx, bytesFile{bytes.NewReader(thumb)}, thumbName, "image/jpeg"); err != nil {
			return "", 0, 0, fmt.Errorf("save %s: %w", thumbName, err)
		}
		if err := posts.SetImageThumbnailPath(ctx, p.ID, thumbPath); err != nil {
			if errors.Is(err, repository.ErrorPostImageNotFound) {
				// Deleted during the run. Storage has no Delete, so the file
				// stays, like the original of any deleted post.
				return "", 0, 0, fmt.Errorf("%w: post was deleted during the run (%s left in storage)", errSkip, thumbName)
			}
			return "", 0, 0, fmt.Errorf("update image: %w", err)
		}
	}
	return thumbPath, len(data), len(thumb), nil
}

// bytesFile is an in-memory multipart.File, which is what Storage.Save takes.
type bytesFile struct{ *bytes.Reader }

func (bytesFile) Close() error { return nil }
