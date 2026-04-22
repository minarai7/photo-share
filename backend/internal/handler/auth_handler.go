package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/httpx"
	"backend/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func toUserResponse(user *model.Users) UserResponse {
	return UserResponse{
		ID:        user.ID,
		Username:  user.Username,
		Email:     user.Email,
		CreatedAt: user.CreatedAt,
	}
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
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
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "signup_failed",
					Message: err.Error(),
				},
			})
			return

		case errors.Is(err, service.ErrEmailAlreadyExists),
			errors.Is(err, service.ErrUsernameAlreadyExists):
			httpx.WriteJSON(w, http.StatusConflict, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "signup_failed",
					Message: err.Error(),
				},
			})
			return

		default:
			httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "signup_failed",
					Message: err.Error(),
				},
			})
			return
		}
	}

	resp, err := h.authService.IssueAuth(user)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "internal_error",
				Message: "failed to create auth token",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, LoginResponse{
		Token: resp.Token,
		User:  toUserResponse(user),
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
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
			httpx.WriteJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "invalid_credentials",
					Message: "invalid login or password",
				},
			})
			return
		}

		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "internal_error",
				Message: "login failed",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, LoginResponse{
		Token: result.Token,
		User:  toUserResponse(result.User),
	})

}
