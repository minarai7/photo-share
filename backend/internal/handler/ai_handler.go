package handler

import (
	"backend/internal/dto"
	"backend/internal/httpx"
	"backend/internal/service"
	"encoding/json"
	"net/http"
	"strings"
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
	/*
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
	*/

	result := dto.GearLinkResponse{
		Kind:    "camera",
		Name:    "Sony A7 III",
		Summary: "The Sony A7 III is a full-frame mirrorless camera with a 24.2MP back-illuminated Exmor R CMOS sensor, offering 10 fps continuous shooting and 4K video recording.",
		Suggestions: []dto.GearLinkSuggestion{
			dto.GearLinkSuggestion{
				Title:      "ILCE-7M3 Specifications | Sony USA",
				URL:        "https://www.sony.com/electronics/support/e-mount-body-ilce-7-series/ilce-7m3/specifications",
				Reason:     "This is the official Sony product specifications page, providing detailed technical information about the camera.",
				Confidence: "high"},
			dto.GearLinkSuggestion{Title: "Sony Alpha 7 III - Full-frame Interchangeable Lens Camera 24.2MP, 10FPS, 4K/30p |ILCE7M3",
				URL:        "https://electronics.sony.com/imaging/interchangeable-lens-cameras/full-frame/p/ilce7m3-b",
				Reason:     "This is the official Sony product page for the camera body only, offering an overview, features, and purchase options.",
				Confidence: "high"},
			dto.GearLinkSuggestion{Title: "Sony Alpha 7 III - Full-frame Interchangeable Lens Camera \u0026 Lens Kit 24.2MP, 10FPS, 4K/30p |ILCE7M3K", URL: "https://electronics.sony.com/c/p/ilce7m3k-b", Reason: "This is the official Sony product page for the camera kit including the 28-70mm lens, providing product details and purchase information.", Confidence: "high"},
		},
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}
