package middleware

import (
	"backend/internal/httpx"
	"backend/internal/service"
	"context"
	"net/http"
	"strings"
)

type contextKey string

const UserIDContextKey contextKey = "UserID"

type AuthMiddleware struct {
	authService *service.AuthService
}

func NewAuthMiddleware(authService *service.AuthService) *AuthMiddleware {
	return &AuthMiddleware{authService: authService}
}

func (m *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			httpx.WriteJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "unauthorized",
					Message: "missing authorization header",
				},
			})
			return
		}

		const prefix = "Bearer "
		if !strings.HasPrefix(authHeader, prefix) {
			httpx.WriteJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "unauthorized",
					Message: "authorization header must use Bearer token",
				},
			})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, prefix)
		userID, err := m.authService.ParseToken(tokenString)
		if err != nil {
			httpx.WriteJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "unauthorized",
					Message: "invalid or expired token",
				},
			})
			return
		}

		ctx := context.WithValue(r.Context(), UserIDContextKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
