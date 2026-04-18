package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ErrorResponse{
			Error: ErrorDetail{
				Code:    "invalid_method",
				Message: "method is not post",
			},
		})
		return
	}

	var req SignupRequest

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ErrorResponse{
			Error: ErrorDetail{
				Code:    "invalid_json",
				Message: "request body is invalid",
			},
		})
		return
	}

	user, err := h.authService.Signup(r.Context(), service.SignupParams{
		Username: req.Username,
		Email:    req.Email,
		Password: req.Password,
	})

	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidSignupInput),
			errors.Is(err, service.ErrPasswordTooLong):
			writeJSON(w, http.StatusBadRequest, ErrorResponse{
				Error: ErrorDetail{
					Code:    "signup_failed",
					Message: err.Error(),
				},
			})
			return

		case errors.Is(err, service.ErrEmailAlreadyExists),
			errors.Is(err, service.ErrUsernameAlreadyExists):
			writeJSON(w, http.StatusConflict, ErrorResponse{
				Error: ErrorDetail{
					Code:    "signup_failed",
					Message: err.Error(),
				},
			})
			return

		default:
			writeJSON(w, http.StatusInternalServerError, ErrorResponse{
				Error: ErrorDetail{
					Code:    "signup_failed",
					Message: err.Error(),
				},
			})
			return
		}
	}

	resp, err := h.authService.IssueAuth(*user)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, ErrorResponse{
			Error: ErrorDetail{
				Code:    "internal_error",
				Message: "failed to create auth token",
			},
		})
		return
	}

	writeJSON(w, http.StatusCreated, LoginResponse{
		Token: resp.Token,
		User: User{
			ID:        user.ID,
			Username:  user.Username,
			Email:     user.Email,
			CreatedAt: user.CreatedAt,
		},
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, ErrorResponse{
			Error: ErrorDetail{
				Code:    "invalid_method",
				Message: "method is not post",
			},
		})
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, ErrorResponse{
			Error: ErrorDetail{
				Code:    "invalid_json",
				Message: "Request body is invalid",
			},
		})
		return
	}

	result, err := h.authService.Login(r.Context(), service.LoginParams{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			writeJSON(w, http.StatusUnauthorized, ErrorResponse{
				Error: ErrorDetail{
					Code:    "invalid_credentials",
					Message: "invalid login or password",
				},
			})
			return
		}

		writeJSON(w, http.StatusInternalServerError, ErrorResponse{
			Error: ErrorDetail{
				Code:    "internal_error",
				Message: "login failed",
			},
		})
		return
	}

	writeJSON(w, http.StatusOK, LoginResponse{
		Token: result.Token,
		User: User{
			ID:        result.User.ID,
			Username:  result.User.Username,
			Email:     result.User.Email,
			CreatedAt: result.User.CreatedAt,
		},
	})

}
