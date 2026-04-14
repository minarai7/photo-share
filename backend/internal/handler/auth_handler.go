package handler

import (
	"encoding/json"
	"net/http"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type SignupRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user := &model.Users{
		Username: req.Username,
		Email:    req.Email,
	}

	if err := h.authService.Signup(r.Context(), user); err != nil {
		http.Error(w, "failed to sign up", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"message":"signup ok"}`))
}
