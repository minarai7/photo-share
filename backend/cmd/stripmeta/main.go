// Command stripmeta removes metadata (EXIF including GPS, XMP, IPTC,
// comments, data after the image) from photos that are already in storage.
// It is the backfill for uploads stored before the upload path started
// stripping metadata; running it again is harmless (clean files are skipped).
//
// It reads the same storage settings as the server (STORAGE_DRIVER,
// UPLOAD_DIR, S3_BUCKET_NAME, AWS_REGION, from the environment or .env).
// Without -apply it only reports what it would change.
//
//	go run ./cmd/stripmeta           # dry run
//	go run ./cmd/stripmeta -apply    # rewrite the files
package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"backend/internal/config"
	"backend/internal/imagestrip"
	"backend/internal/storage"
)

// listingStorage is a Storage that can enumerate its files.
type listingStorage interface {
	storage.Storage
	List(ctx context.Context) ([]string, error)
}

// Uploads are capped at MAX_UPLOAD_BYTES (32 MiB by default); anything far
// bigger is not one of ours and is not loaded into memory.
const maxFileBytes = 64 << 20

type summary struct {
	clean, stripped, failed int
}

func main() {
	apply := flag.Bool("apply", false, "rewrite files (default: dry run, report only)")
	flag.Parse()

	cfg := config.Load()
	ctx := context.Background()
	st, err := storage.New(ctx, storage.Config{
		Driver:    cfg.StorageDriver,
		UploadDir: cfg.UploadDir,
		AWSRegion: cfg.AWSRegion,
		S3Bucket:  cfg.S3BucketName,
	})
	if err != nil {
		log.Fatalf("initialize storage: %v", err)
	}
	ls, ok := st.(listingStorage)
	if !ok {
		log.Fatalf("storage driver %q cannot list files", cfg.StorageDriver)
	}

	where := cfg.UploadDir
	if cfg.StorageDriver == "s3" {
		where = "s3://" + cfg.S3BucketName + "/uploads/"
	}
	mode := "DRY RUN (pass -apply to rewrite)"
	if *apply {
		mode = "APPLY"
	}
	fmt.Printf("%s: %s storage at %s\n", mode, cfg.StorageDriver, where)

	sum, err := run(ctx, ls, *apply, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
	if sum.failed > 0 {
		os.Exit(1)
	}
}

func run(ctx context.Context, st listingStorage, apply bool, out io.Writer) (summary, error) {
	names, err := st.List(ctx)
	if err != nil {
		return summary{}, fmt.Errorf("list stored files: %w", err)
	}

	var sum summary
	for _, name := range names {
		changed, before, after, err := stripOne(ctx, st, name, apply)
		switch {
		case err != nil:
			sum.failed++
			fmt.Fprintf(out, "FAILED     %s: %v\n", name, err)
		case !changed:
			sum.clean++
		default:
			sum.stripped++
			verb := "would strip"
			if apply {
				verb = "stripped   "
			}
			fmt.Fprintf(out, "%s %s (%d -> %d bytes)\n", verb, name, before, after)
		}
	}

	verb := "to strip"
	if apply {
		verb = "stripped"
	}
	fmt.Fprintf(out, "%d files: %d %s, %d already clean, %d failed\n",
		len(names), sum.stripped, verb, sum.clean, sum.failed)
	return sum, nil
}

// stripOne reports whether the file had metadata (and, with apply, was
// rewritten without it), plus its size before and after.
func stripOne(ctx context.Context, st listingStorage, name string, apply bool) (changed bool, before, after int, err error) {
	f, err := st.Open(ctx, name)
	if err != nil {
		return false, 0, 0, err
	}
	data, err := io.ReadAll(io.LimitReader(f.Body, maxFileBytes+1))
	// Close before saving: Windows cannot replace a file that is still open.
	f.Body.Close()
	if err != nil {
		return false, 0, 0, err
	}
	if len(data) > maxFileBytes {
		return false, 0, 0, fmt.Errorf("larger than %d bytes", maxFileBytes)
	}

	stripped, err := imagestrip.Strip(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		if errors.Is(err, imagestrip.ErrMalformed) || errors.Is(err, imagestrip.ErrUnsupported) {
			err = fmt.Errorf("%w; left unchanged, check it by hand", err)
		}
		return false, 0, 0, err
	}
	clean, err := io.ReadAll(stripped)
	if err != nil {
		return false, 0, 0, err
	}
	if bytes.Equal(clean, data) {
		return false, len(data), len(data), nil
	}

	if apply {
		contentType := f.ContentType
		if contentType == "" {
			contentType = http.DetectContentType(data)
		}
		if _, err := stripped.Seek(0, io.SeekStart); err != nil {
			return false, 0, 0, err
		}
		if err := st.Save(ctx, stripped, name, contentType); err != nil {
			return false, 0, 0, fmt.Errorf("save: %w", err)
		}
	}
	return true, len(data), len(clean), nil
}
