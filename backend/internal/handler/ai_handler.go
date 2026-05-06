package handler

import (
	"backend/internal/httpx"
	"encoding/json"
	"net/http"
	"strings"
)

type AIHandler struct{}

func NewAIHandler() *AIHandler {
	return &AIHandler{}
}

func (h *AIHandler) GearLink(w http.ResponseWriter, r *http.Request) {
	var req gearLinkRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_json",
				Message: err.Error(),
			},
		})
	}

	req.Kind = strings.TrimSpace(req.Kind)
	req.Name = strings.TrimSpace(req.Name)

	if req.Kind != "camera" && req.Kind != "lens" {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "invalid_kind",
				Message: "Kind must be either camera or lens",
			},
		})
	}

	if req.Name == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "empty_name",
				Message: "Name is required",
			},
		})
	}

	response := gearLinkResponse{
		Kind:    req.Kind,
		Name:    req.Name,
		Summary: "This is likely a good product from Sony.",
		Suggestions: []gearLinkSuggestion{
			{
				Title:      "Sony Official page",
				URL:        "https://s.com",
				Reason:     "Seems like the official page.",
				Confidence: "medium",
			},
			{
				Title:      "Mapcamera Page",
				URL:        "https://d.com",
				Reason:     "Seems like a cheaper option.",
				Confidence: "high",
			},
		},
	}

	httpx.WriteJSON(w, http.StatusOK, response)
}
