package handler

import (
	"backend/internal/dto"
	"backend/internal/httpx"
	"backend/internal/service"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

type AIHandler struct {
	aiService *service.AIService
}

func NewAIHandler(aiService *service.AIService) *AIHandler {
	return &AIHandler{
		aiService: aiService,
	}
}

func (h *AIHandler) GearLink(w http.ResponseWriter, r *http.Request) {
	var req dto.GearLinkRequest

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
		return
	}

	if req.Name == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "empty_name",
				Message: "Name is required",
			},
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()

	result, err := h.aiService.FindGearLinks(ctx, dto.GearLinkRequest{
		Kind: req.Kind,
		Name: req.Name,
	})

	if err != nil {
		if errors.Is(err, service.ErrAIConfigMissing) {
			httpx.WriteJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{
				Error: httpx.ErrorDetail{
					Code:    "ai_config_missing",
					Message: "AI service is not configured",
				},
			})
			return
		}

		log.Printf("Error: %v", err)
		httpx.WriteJSON(w, http.StatusBadGateway, httpx.ErrorResponse{
			Error: httpx.ErrorDetail{
				Code:    "ai_request_failed",
				Message: "Could not get AI gear suggestions",
			},
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}
