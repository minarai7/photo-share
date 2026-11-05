// Files are stored on S3 under uploads.

package storage

import (
	"context"
	"fmt"
	"mime/multipart"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Storage struct {
	client *s3.Client
	bucket string
}

func NewS3Storage(
	client *s3.Client,
	bucket string,
) *S3Storage {
	return &S3Storage{
		client: client,
		bucket: bucket,
	}
}

func (s *S3Storage) Save(
	ctx context.Context,
	file multipart.File,
	filename string,
	contentType string,
) error {
	key := path.Join("uploads", filename)

	_, err := s.client.PutObject(
		ctx,
		&s3.PutObjectInput{
			Bucket:      aws.String(s.bucket),
			Key:         aws.String(key),
			Body:        file,
			ContentType: aws.String(contentType),
		},
	)

	if err != nil {
		return fmt.Errorf("put object to S3: %w", err)
	}

	return nil
}

// List returns the names of all stored files (keys directly under uploads/).
func (s *S3Storage) List(ctx context.Context) ([]string, error) {
	var names []string
	pages := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String("uploads/"),
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list S3 objects: %w", err)
		}
		for _, obj := range page.Contents {
			name := strings.TrimPrefix(aws.ToString(obj.Key), "uploads/")
			if name != "" && !strings.Contains(name, "/") {
				names = append(names, name)
			}
		}
	}
	return names, nil
}

func (s *S3Storage) Open(
	ctx context.Context,
	filename string,
) (*StoredFile, error) {
	key := path.Join("uploads", filename)

	result, err := s.client.GetObject(
		ctx,
		&s3.GetObjectInput{
			Bucket: aws.String(s.bucket),
			Key:    aws.String(key),
		},
	)

	if err != nil {
		return nil, fmt.Errorf("get object from S3: %w", err)
	}

	contentType := ""
	if result.ContentType != nil {
		contentType = *result.ContentType
	}

	return &StoredFile{
		Body:        result.Body,
		ContentType: contentType,
	}, nil
}
