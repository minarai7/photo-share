package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/httpx"
	"backend/internal/middleware"
	"backend/internal/service"
)

type UserSettingsHandler struct {
	userSettingsService *service.UserSettingsService
}

func NewUserSettingsHandler(userSettingsService *service.UserSettingsService) *UserSettingsHandler {
	return &UserSettingsHandler{userSettingsService: userSettingsService}
}

func (h *UserSettingsHandler) UpdatePreferredLanguage(w http.ResponseWriter, r *http.Request) {
	var req UpdatePreferredLanguageRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_json",
				Message: "request body is invalid",
			},
		})
		return
	}

	userID, err := middleware.GetUserID(r.Context())
	if err != nil {
		httpx.WriteJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "unauthorized",
				Message: err.Error(),
			},
		})
		return
	}

	err = h.userSettingsService.UpdatePreferredLanguage(
		r.Context(),
		service.UpdatePreferredLanguageParams{
			UserID:            userID,
			PreferredLanguage: req.PreferredLanguage,
		})

	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidPreferredLanguage):
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "invalid_preferred_language",
					Message: err.Error(),
				},
			})
			return
		case errors.Is(err, service.ErrUserNotFound):
			httpx.WriteJSON(w, http.StatusNotFound, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "user_not_found",
					Message: "user not found",
				},
			})
			return
		default:
			httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "internal_error",
					Message: "failed to update preferred language",
				},
			})
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
