package storage

import (
	"bytes"
	"io"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestStoredFileFromS3(t *testing.T) {
	modified := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	f := storedFileFromS3(&s3.GetObjectOutput{
		Body:          io.NopCloser(bytes.NewReader(nil)),
		ContentType:   aws.String("image/webp"),
		ContentLength: aws.Int64(1234),
		ETag:          aws.String(`"abc"`),
		LastModified:  &modified,
	})
	if f.ContentType != "image/webp" || f.ContentLength != 1234 || f.ETag != `"abc"` || !f.LastModified.Equal(modified) {
		t.Errorf("got %+v", f)
	}

	// Missing metadata stays at the zero value, which the handler treats as unknown.
	f = storedFileFromS3(&s3.GetObjectOutput{Body: io.NopCloser(bytes.NewReader(nil))})
	if f.ContentType != "" || f.ContentLength != 0 || f.ETag != "" || !f.LastModified.IsZero() {
		t.Errorf("got %+v", f)
	}
}
