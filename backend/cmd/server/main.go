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
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
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

	authService := service.NewAuthService(userRepo)
	postService := service.NewPostService(postRepo)

	authHandler := handler.NewAuthHandler(authService)
	postHandler := handler.NewPostHandler(postService)

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

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	// mux.HandleFunc("/panic", panicHandler)
	mux.HandleFunc("POST /auth/signup", authHandler.Signup)
	mux.HandleFunc("POST /posts", postHandler.CreatePost)
	mux.HandleFunc("GET /posts", postHandler.ListPosts)

	loggedMux := middleware.Recovery(
		middleware.Logging(mux),
	)

	addr := ":" + cfg.Port
	log.Println("server starting on", addr)
	if err := http.ListenAndServe(addr, loggedMux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
