package main

import (
	"context"
	"log"
	"net/http"

	"backend/internal/config"
	dbpkg "backend/internal/db"
	"backend/internal/repository"
	"backend/internal/server"
	"backend/internal/service"
	"backend/internal/storage"
)

func main() {
	cfg := config.MustLoad()

	database, err := dbpkg.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer database.Close()
	log.Println("database connection successful")

	fileStorage, err := storage.New(
		context.Background(),
		storage.Config{
			Driver:    cfg.StorageDriver,
			UploadDir: cfg.UploadDir,
			AWSRegion: cfg.AWSRegion,
			S3Bucket:  cfg.S3BucketName,
		},
	)
	if err != nil {
		log.Fatalf("initialize storage: %v", err)
	}

	userRepo := repository.NewUserRepository(database)
	postRepo := repository.NewPostRepository(database)

	h := server.NewHandler(server.Deps{
		FrontendOrigin: cfg.FrontendOrigin,
		MaxUploadBytes: cfg.MaxUploadBytes,

		AuthService:   service.NewAuthService(userRepo, cfg.JWTSecret),
		PostService:   service.NewPostService(postRepo),
		UploadService: service.NewUploadService(fileStorage, cfg.MaxUploadBytes),
		AIService: service.NewAIService(service.AIConfig{
			APIKey:   cfg.OpenRouterAPIKey,
			BaseURL:  cfg.OpenRouterBaseURL,
			Model:    cfg.OpenRouterModel,
			AppURL:   cfg.FrontendOrigin,
			AppTitle: cfg.OpenRouterAppTitle,
		}),
		UserSettingsService: service.NewUserSettingsService(userRepo),
	})

	addr := ":" + cfg.Port
	log.Println("server starting on", addr)
	if err := http.ListenAndServe(addr, h); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
