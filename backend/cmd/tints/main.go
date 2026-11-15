// Command tints computes the page colour (see internal/tint) of posts created
// before the server started computing it, and records it in posts.tint. It
// only looks at posts whose tint is NULL, so running it again is harmless.
//
// The colour comes from the cover's grid thumbnail, like the server does at
// create. A cover without a thumbnail is read in full and scaled down first
// (with the same limits as cmd/thumbs), so run cmd/thumbs -apply before this
// to keep the work small.
//
// It reads the same settings as the server: DATABASE_URL plus the storage
// ones (STORAGE_DRIVER, UPLOAD_DIR, S3_BUCKET_NAME, AWS_REGION), from the
// environment or .env. Without -apply it computes each tint and reports it,
// but updates nothing.
//
//	go run ./cmd/tints           # dry run
//	go run ./cmd/tints -apply    # record the tints
package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	"io"
	"log"
	"os"
	"strings"

	"backend/internal/config"
	dbpkg "backend/internal/db"
	"backend/internal/repository"
	"backend/internal/storage"
	"backend/internal/thumbnail"
	"backend/internal/tint"
)

// postSource is the part of repository.PostRepository the backfill needs.
type postSource interface {
	ListPostsMissingTint(ctx context.Context) ([]repository.PostMissingTint, error)
	SetPostTint(ctx context.Context, postID int64, tint string) error
}

// Uploads are capped at MAX_UPLOAD_BYTES (32 MiB by default); anything far
// bigger is not one of ours and is not loaded into memory.
const maxFileBytes = 64 << 20

const uploadsPrefix = "/uploads/"

type summary struct {
	tinted, skipped, failed int
}

type options struct {
	apply  bool
	limits thumbnail.Limits
}

// errSkip marks posts that can't have a tint by design (not a stored upload,
// animated, too large); clients show them on the default page colour.
var errSkip = errors.New("skipped")

func main() {
	apply := flag.Bool("apply", false, "record the tints (default: dry run, report only)")
	maxMB := flag.Int64("max-mb", 2048, "skip covers without a thumbnail whose decode needs more than this many MiB")
	maxMP := flag.Int64("max-mp", 250, "skip covers without a thumbnail over this many megapixels")
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

	mode := "DRY RUN (pass -apply to save)"
	if *apply {
		mode = "APPLY"
	}
	fmt.Printf("%s: %s storage\n", mode, cfg.StorageDriver)

	sum, err := run(ctx, repository.NewPostRepository(database), st, opts, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
	if sum.failed > 0 {
		os.Exit(1)
	}
}

func run(ctx context.Context, posts postSource, st storage.Storage, opts options, out io.Writer) (summary, error) {
	missing, err := posts.ListPostsMissingTint(ctx)
	if err != nil {
		return summary{}, fmt.Errorf("list posts without a tint: %w", err)
	}

	var sum summary
	for _, p := range missing {
		label := fmt.Sprintf("post %d %s", p.ID, p.ImagePath)
		t, err := tintOne(ctx, posts, st, p, opts)
		switch {
		case errors.Is(err, errSkip):
			sum.skipped++
			fmt.Fprintf(out, "skipped     %s: %v\n", label, err)
		case err != nil:
			sum.failed++
			fmt.Fprintf(out, "FAILED      %s: %v\n", label, err)
		default:
			sum.tinted++
			verb := "would tint "
			if opts.apply {
				verb = "tinted     "
			}
			fmt.Fprintf(out, "%s %s -> %s\n", verb, label, t)
		}
	}

	verb := "to tint"
	if opts.apply {
		verb = "tinted"
	}
	fmt.Fprintf(out, "%d posts without a tint: %d %s, %d skipped, %d failed\n",
		len(missing), sum.tinted, verb, sum.skipped, sum.failed)
	return sum, nil
}

// tintOne computes one post's tint and, with apply, records it.
func tintOne(ctx context.Context, posts postSource, st storage.Storage, p repository.PostMissingTint, opts options) (string, error) {
	var img image.Image
	var err error
	if p.ThumbnailPath != nil {
		img, err = decodeStored(ctx, st, *p.ThumbnailPath, nil)
	} else {
		img, err = decodeStored(ctx, st, p.ImagePath, &opts.limits)
	}
	if err != nil {
		return "", err
	}
	t := tint.FromImage(img)

	if opts.apply {
		if err := posts.SetPostTint(ctx, p.ID, t); err != nil {
			if errors.Is(err, repository.ErrorPostNotFound) {
				return "", fmt.Errorf("%w: post was deleted during the run", errSkip)
			}
			return "", fmt.Errorf("update post: %w", err)
		}
	}
	return t, nil
}

// decodeStored reads the stored upload at the public path and decodes it.
// With limits (an original), it is first scaled down like a thumbnail, which
// applies the EXIF orientation and refuses decompression bombs.
func decodeStored(ctx context.Context, st storage.Storage, publicPath string, limits *thumbnail.Limits) (image.Image, error) {
	name, ok := strings.CutPrefix(publicPath, uploadsPrefix)
	if !ok || name == "" || strings.ContainsAny(name, `/\`) {
		return nil, fmt.Errorf("%w: not a stored upload", errSkip)
	}
	f, err := st.Open(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	data, err := io.ReadAll(io.LimitReader(f.Body, maxFileBytes+1))
	f.Body.Close()
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	if len(data) > maxFileBytes {
		return nil, fmt.Errorf("%w: larger than %d bytes", errSkip, maxFileBytes)
	}

	if limits != nil {
		small, err := thumbnail.MakeWithin(ctx, bytes.NewReader(data), int64(len(data)), *limits)
		if err != nil {
			if errors.Is(err, thumbnail.ErrTooLarge) || errors.Is(err, thumbnail.ErrAnimated) {
				err = fmt.Errorf("%w: %v", errSkip, err)
			}
			return nil, err
		}
		data = small
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return img, nil
}
