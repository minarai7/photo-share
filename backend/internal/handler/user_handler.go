package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"backend/internal/dto"
	"backend/internal/httpx"
	"backend/internal/service"
)

// UserHandler serves the public reads about people. Its responses never
// carry an email or settings: those are only in the signed-in user's own
// login/signup response.
type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// PublicUserResponse is what anyone may read about a person: GET /users/{id}.
type PublicUserResponse struct {
	ID         int64     `json:"id"`
	Username   string    `json:"username"`
	PostCount  int       `json:"post_count"`
	PhotoCount int       `json:"photo_count"`
	CreatedAt  time.Time `json:"created_at"`
}

func readUserID(r *http.Request) (int64, error) {
	idStr := strings.TrimPrefix(r.URL.Path, "/users/")
	return strconv.ParseInt(idStr, 10, 64)
}

// GetUserByID serves GET /users/{id}: the person hero's name and counts.
func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	id, err := readUserID(r)
	if err != nil {
		writeBadRequest(w, "invalid_user_id", "user id must be a number")
		return
	}

	profile, err := h.userService.GetProfile(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			httpx.WriteJSON(w, http.StatusNotFound, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "user_not_found",
					Message: "user not found",
				},
			})
			return
		}

		log.Printf("get user %d: %v", id, err)
		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "internal_error",
				Message: "failed to get user",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, PublicUserResponse{
		ID:         profile.User.ID,
		Username:   profile.User.Username,
		PostCount:  profile.Work.PostCount,
		PhotoCount: profile.Work.PhotoCount,
		CreatedAt:  profile.User.CreatedAt,
	})
}

// ListAuthors serves GET /users: everyone who has posted, by username, with
// their post count, for the feed's "By" filter.
func (h *UserHandler) ListAuthors(w http.ResponseWriter, r *http.Request) {
	authors, err := h.userService.ListAuthors(r.Context())
	if err != nil {
		log.Printf("list authors: %v", err)
		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "internal_error",
				Message: "failed to list people",
			},
		})
		return
	}
	if authors == nil {
		authors = []dto.Author{}
	}
	httpx.WriteJSON(w, http.StatusOK, authors)
}
