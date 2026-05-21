package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	DatabaseURL    string
	FrontendOrigin string
	JWTSecret      string
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

func MustLoad() Config {
	err := godotenv.Load()
	if err != nil {
		log.Println("No local .env file loaded; using environment variables")
	}
	cfg := Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		FrontendOrigin: getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		UploadDir:      getEnv("UPLOAD_DIR", "storage/uploads"),
		MaxUploadBytes: getEnvInt64("MAX_UPLOAD_BYTES", 5*1024*1024),

		OpenRouterAPIKey:   os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterBaseURL:  getEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
		OpenRouterModel:    getEnv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite"),
		OpenRouterAppURL:   getEnv("OPENROUTER_APP_URL", "http://localhost:5173"),
		OpenRouterAppTitle: getEnv("OPENROUTER_APP_TITLE", "Photo Share Dev"),
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	return cfg
}
