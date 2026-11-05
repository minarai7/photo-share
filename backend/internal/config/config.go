package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv         string
	Port           string
	DatabaseURL    string
	FrontendOrigin string
	JWTSecret      string
	StorageDriver  string
	S3BucketName   string
	AWSRegion      string
	UploadDir      string
	MaxUploadBytes int64

	OpenRouterAPIKey   string
	OpenRouterBaseURL  string
	OpenRouterModel    string
	OpenRouterAppURL   string
	OpenRouterAppTitle string
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt64(key string, fallback int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	num, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return num
}

// MustLoad loads the server configuration and exits if it is unusable.
func MustLoad() Config {
	cfg := Load()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if cfg.StorageDriver == "s3" && cfg.S3BucketName == "" {
		log.Fatal("S3_BUCKET_NAME is required when STORAGE_DRIVER=s3")
	}
	return cfg
}

// Load reads .env (if present) and the environment without validating, for
// tools that need only part of the configuration (e.g. cmd/stripmeta).
func Load() Config {
	err := godotenv.Load()
	if err != nil {
		log.Println("No local .env file loaded; using environment variables")
	}
	return Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		FrontendOrigin: getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		StorageDriver:  getEnv("STORAGE_DRIVER", "local"),
		S3BucketName:   os.Getenv("S3_BUCKET_NAME"),
		AWSRegion:      getEnv("AWS_REGION", "ap-northeast-1"),
		UploadDir:      getEnv("UPLOAD_DIR", "storage/uploads"),
		// 32 MiB fits full-quality JPEGs from high-resolution cameras.
		// Keep in sync with MAX_UPLOAD_BYTES in frontend/src/config/upload.ts.
		MaxUploadBytes: getEnvInt64("MAX_UPLOAD_BYTES", 32*1024*1024),

		OpenRouterAPIKey:   os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterBaseURL:  getEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
		OpenRouterModel:    getEnv("OPENROUTER_MODEL", "mistralai/mistral-small-3.2-24b-instruct"),
		OpenRouterAppURL:   getEnv("OPENROUTER_APP_URL", "http://localhost:5173"),
		OpenRouterAppTitle: getEnv("OPENROUTER_APP_TITLE", "Photo Share Dev"),
	}
}
