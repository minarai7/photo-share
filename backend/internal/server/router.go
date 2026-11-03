// Package server owns the HTTP route table and the global middleware chain.
// main.go builds the dependencies and calls NewHandler; the tests in this
// package call NewHandler with in-memory stores, so they exercise the exact
// routes, auth wrapping, CORS and recovery that production uses.
package server

import (
	"encoding/json"
	"log"
	"net/http"

	"backend/internal/handler"
	"backend/internal/middleware"
	"backend/internal/service"

	"github.com/rs/cors"
)

type Deps struct {
	FrontendOrigin string
	MaxUploadBytes int64

	AuthService         *service.AuthService
	PostService         *service.PostService
	UploadService       *service.UploadService
	AIService           *service.AIService
	UserSettingsService *service.UserSettingsService
}

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

// NewMux returns the bare route table, without CORS/logging/recovery.
func NewMux(d Deps) *http.ServeMux {
	authHandler := handler.NewAuthHandler(d.AuthService)
	postHandler := handler.NewPostHandler(d.PostService)
	uploadHandler := handler.NewUploadHandler(d.UploadService, d.MaxUploadBytes)
	aiHandler := handler.NewAIHandler(d.AIService)
	userSettingsHandler := handler.NewUserSettingsHandler(d.UserSettingsService)

	authMiddleware := middleware.NewAuthMiddleware(d.AuthService)
	auth := func(h http.HandlerFunc) http.Handler {
		return authMiddleware.RequireAuth(h)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler)

	mux.HandleFunc("POST /auth/signup", authHandler.Signup)
	mux.HandleFunc("POST /auth/login", authHandler.Login)

	mux.HandleFunc("GET /users/", authHandler.GetUserByID)

	mux.HandleFunc("GET /posts", postHandler.ListPosts)
	mux.Handle("POST /posts", auth(postHandler.CreatePost))

	mux.HandleFunc("GET /posts/", postHandler.GetPostByID)
	mux.Handle("PUT /posts/", auth(postHandler.UpdatePost))
	mux.Handle("DELETE /posts/", auth(postHandler.DeletePost))

	mux.Handle("POST /uploads", auth(uploadHandler.UploadImage))
	mux.HandleFunc("GET /uploads/", uploadHandler.Get)

	mux.Handle("POST /ai/gear-link", auth(aiHandler.GearLink))

	mux.Handle("PUT /users/me/settings/language", auth(userSettingsHandler.UpdatePreferredLanguage))

	return mux
}

// NewHandler returns the full production handler:
// Recovery → Logging → CORS → mux.
func NewHandler(d Deps) http.Handler {
	return WrapMiddleware(NewMux(d), d.FrontendOrigin)
}

// WrapMiddleware applies the global middleware chain to any handler.
func WrapMiddleware(h http.Handler, frontendOrigin string) http.Handler {
	corsMiddleware := cors.New(cors.Options{
		AllowedOrigins:   []string{frontendOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})

	return middleware.Recovery(
		middleware.Logging(corsMiddleware.Handler(h)),
	)
}
