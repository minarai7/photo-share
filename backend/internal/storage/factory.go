package storage

import (
	"context"
	"fmt"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Config struct {
	Driver    string
	UploadDir string
	AWSRegion string
	S3Bucket  string
}

func New(ctx context.Context, cfg Config) (Storage, error) {
	switch cfg.Driver {
	case "local":
		if cfg.UploadDir == "" {
			return nil, fmt.Errorf("upload directory is required for local storage")
		}
		return NewLocalStorage(cfg.UploadDir), nil

	case "s3":
		if cfg.S3Bucket == "" {
			return nil, fmt.Errorf("S3 bucket is required for S3 storage")
		}

		if cfg.AWSRegion == "" {
			return nil, fmt.Errorf("AWS region is required for S3 storage")
		}

		awsCfg, err := awsconfig.LoadDefaultConfig(
			ctx,
			awsconfig.WithRegion(cfg.AWSRegion),
		)
		if err != nil {
			return nil, fmt.Errorf("load AWS config: %w", err)
		}

		client := s3.NewFromConfig(awsCfg)

		return NewS3Storage(
			client,
			cfg.S3Bucket,
		), nil

	default:
		return nil, fmt.Errorf(
			"unsupported storage driver: %q",
			cfg.Driver,
		)
	}
}
