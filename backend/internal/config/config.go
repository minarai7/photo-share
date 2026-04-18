package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	DatabaseURL    string
	FrontendOrigin string
	JWTSecret      string
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func MustLoad() Config {
	err := godotenv.Load()
	if err != nil {
		log.Println(".env file not found, using system environment variables")
	}
	cfg := Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		FrontendOrigin: getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	return cfg
}
