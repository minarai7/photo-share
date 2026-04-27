package main

import (
	"encoding/json"
	"log"
	"net/http"

	"backend/internal/config"
	dbpkg "backend/internal/db"
	"backend/internal/handler"
	"backend/internal/middleware"
	"backend/internal/repository"
	"backend/internal/service"

	"github.com/rs/cors"
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]string{
		"status": "ok",
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Println("failed to write response:", err)
	}
}

/*
func panicHandler(w http.ResponseWriter, r *http.Request) {
	panic("test panic")
}
*/

func main() {
	cfg := config.MustLoad()

	database, err := dbpkg.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer database.Close()
	log.Println("database connection successful")

	userRepo := repository.NewUserRepository(database)
	postRepo := repository.NewPostRepository(database)

	authService := service.NewAuthService(userRepo, cfg.JWTSecret)
	postService := service.NewPostService(postRepo)

	authHandler := handler.NewAuthHandler(authService)
	postHandler := handler.NewPostHandler(postService)

	uploadService := service.NewUploadService(cfg.UploadDir, cfg.MaxUploadBytes)
	uploadHandler := handler.NewUploadHandler(uploadService, cfg.MaxUploadBytes)

	/*
		ctx := context.Background()

		userRepo := repository.NewUserRepository(database)
		users, err := userRepo.ListUsers(ctx)
		if err != nil {
			log.Fatalf("list users failed: %v", err)
		}
		log.Printf("users query worked, found %d users", len(users))

		postRepo := repository.NewPostRepository(database)
		created, err := postRepo.CreatePost(ctx, repository.CreatePostParams{
			UserID:     1,
			ImagePath:  "/demo/test.jpg",
			Caption:    "first test post",
			Location:   "Tokyo",
			CameraBody: "Sony A7C",
			Lens:       "FE 40mm F2.5 G",
		})
		if err != nil {
			log.Fatalf("create post failed: %v", err)
		}
		log.Printf("post insert worked, new post id=%d", created.ID)
	*/

	authMiddleware := middleware.NewAuthMiddleware(authService)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler)
	// mux.HandleFunc("/panic", panicHandler)

	mux.HandleFunc("POST /auth/signup", authHandler.Signup)
	mux.HandleFunc("POST /auth/login", authHandler.Login)

	mux.HandleFunc("GET /posts", postHandler.ListPosts)
	mux.Handle("POST /posts", authMiddleware.RequireAuth(http.HandlerFunc(postHandler.CreatePost)))

	mux.HandleFunc("GET /posts/", postHandler.GetPostByID)
	mux.Handle("PUT /posts/", authMiddleware.RequireAuth(http.HandlerFunc(postHandler.UpdatePost)))
	mux.Handle("DELETE /posts/", authMiddleware.RequireAuth(http.HandlerFunc(postHandler.DeletePost)))

	mux.Handle("POST /uploads", authMiddleware.RequireAuth(http.HandlerFunc(uploadHandler.UploadImage)))

	fileServer := http.FileServer(http.Dir(cfg.UploadDir))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", fileServer))

	corsMiddleware := cors.New(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})

	handlerWithCORS := corsMiddleware.Handler(mux)

	loggedMux := middleware.Recovery(
		middleware.Logging(handlerWithCORS),
	)

	addr := ":" + cfg.Port
	log.Println("server starting on", addr)
	if err := http.ListenAndServe(addr, loggedMux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
