package service

import (
	"backend/internal/dto"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrAIConfigMissing = errors.New("openrouter api key is not configured")

type AIConfig struct {
	APIKey   string
	BaseURL  string
	Model    string
	AppURL   string
	AppTitle string
}

type AIService struct {
	apiKey   string
	baseURL  string
	model    string
	appURL   string
	appTitle string
	client   *http.Client
}

func NewAIService(config AIConfig) *AIService {
	return &AIService{
		apiKey:   config.APIKey,
		baseURL:  config.BaseURL,
		model:    config.Model,
		appURL:   config.AppURL,
		appTitle: config.AppTitle,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (s *AIService) FindGearLinks(ctx context.Context, p dto.GearLinkRequest) (dto.GearLinkResponse, error) {
	if s.apiKey == "" {
		return dto.GearLinkResponse{}, ErrAIConfigMissing
	}

	requestBody := openRouterChatRequest{
		Model: s.model,
		Messages: []openRouterMessage{
			{
				Role:    "system",
				Content: gearLinkSystemPrompt(),
			},
			{
				Role:    "user",
				Content: buildGearLinkUserPrompt(p),
			},
		},
		Temperature:         0.1,
		MaxCompletionTokens: 800,
		ResponseFormat:      gearLinkResponseFormat(),
		Tools: []map[string]any{
			{
				"type": "openrouter:web_search",
				"parameters": map[string]any{
					"engine":              "auto",
					"max_results":         3,
					"max_total_results":   5,
					"search_context_size": "low",
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return dto.GearLinkResponse{}, err
	}

	endpoint := s.baseURL + "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return dto.GearLinkResponse{}, err
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	if s.appURL != "" {
		req.Header.Set("HTTP-Referer", s.appURL)
	}

	if s.appTitle != "" {
		req.Header.Set("X-OpenRouter-Title", s.appTitle)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return dto.GearLinkResponse{}, err
	}
	defer resp.Body.Close()

	responseBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return dto.GearLinkResponse{}, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return dto.GearLinkResponse{}, fmt.Errorf("openrouter returned unsuccessful status")
	}

	var openRouterResp openRouterChatResponse
	if err := json.Unmarshal(responseBytes, &openRouterResp); err != nil {
		return dto.GearLinkResponse{}, err
	}

	if len(openRouterResp.Choices) == 0 {
		return dto.GearLinkResponse{}, fmt.Errorf("openrouter returned no choices")
	}

	content := openRouterResp.Choices[0].Message.Content
	if content == "" {
		return dto.GearLinkResponse{}, fmt.Errorf("openrouter returned empty content")
	}

	log.Printf("AI raw content: %s", content)

	jsonContent, err := extractJSONContent(content)
	if err != nil {
		return dto.GearLinkResponse{}, fmt.Errorf("extract ai json content: %w; content was: %s", err, content)
	}

	var result dto.GearLinkResponse
	if err := json.Unmarshal([]byte(jsonContent), &result); err != nil {
		return dto.GearLinkResponse{}, err
	}

	result.Kind = p.Kind
	result.Name = p.Name
	result.Suggestions = filterValidSuggestions(result.Suggestions)
	if result.Suggestions == nil {
		result.Suggestions = []dto.GearLinkSuggestion{}
	}

	return result, nil
}

type openRouterChatRequest struct {
	Model               string              `json:"model"`
	Messages            []openRouterMessage `json:"messages"`
	Temperature         float64             `json:"temperature"`
	MaxCompletionTokens int                 `json:"max_completion_tokens"`
	ResponseFormat      map[string]any      `json:"response_format"`
	Tools               []map[string]any    `json:"tools,omitempty"`
}

type openRouterMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func gearLinkSystemPrompt() string {
	return `You are an AI assistant inside a photo-sharing portfolio app.

Your job is to find reliable camera or lens product/spec links.

You must return ONLY valid JSON.

Do not include:
- markdown
- bullet points
- headings
- explanations before the JSON
- explanations after the JSON
- code fences
- triple backticks
- Markdown escaping inside JSON strings

Important JSON string rules:
- Do not escape asterisks.
- Write T* as T*, not T\*.
- Write f/1.5 normally.
- Only use valid JSON escapes such as \", \\n, or \\uXXXX when necessary.

The first character of your response must be {
The last character of your response must be }

The JSON must match this exact shape:

{
  "kind": "camera",
  "name": "Sony A7 III",
  "summary": "Short summary here.",
  "suggestions": [
    {
      "title": "Page title here",
      "url": "https://example.com",
      "reason": "Reason here.",
      "confidence": "high"
    }
  ]
}

Rules:
- kind must be "camera" or "lens".
- confidence must be "high", "medium", or "low".
- suggestions must be an array.
- If no reliable links are found, return "suggestions": [].
- Prefer official manufacturer product pages.
- If no official page is available, use reliable product/spec pages.
- Do not invent URLs.
- Use web search to verify URLs before including them.`
}

func buildGearLinkUserPrompt(p dto.GearLinkRequest) string {
	return fmt.Sprintf(`Find up to 3 reliable product/spec links for this photography gear.

kind: %s
name: %s

Return ONLY valid JSON in this exact shape:

{
  "kind": %q,
  "name": %q,
  "summary": "Short factual summary of the gear.",
  "suggestions": [
    {
      "title": "Reliable page title",
      "url": "https://example.com",
      "reason": "Why this link is relevant.",
      "confidence": "high"
    }
  ]
}

Do not write "Here is".
Do not use markdown.
Do not use bullet points.
Do not wrap the JSON in code fences.`, p.Kind, p.Name, p.Kind, p.Name)
}

func gearLinkResponseFormat() map[string]any {
	return map[string]any{
		"type": "json_object",
	}
}

func filterValidSuggestions(suggestions []dto.GearLinkSuggestion) []dto.GearLinkSuggestion {
	validSuggestions := make([]dto.GearLinkSuggestion, 0, len(suggestions))

	for _, suggestion := range suggestions {
		parsedURL, err := url.ParseRequestURI(suggestion.URL)
		if err != nil {
			continue
		}

		if parsedURL.Scheme != "https" && parsedURL.Scheme != "http" {
			continue
		}

		if strings.TrimSpace(suggestion.Title) == "" {
			continue
		}

		validSuggestions = append(validSuggestions, suggestion)
	}

	return validSuggestions
}

func extractJSONContent(content string) (string, error) {
	content = strings.TrimSpace(content)

	if strings.HasPrefix(content, "```") {
		lines := strings.Split(content, "\n")

		if len(lines) >= 2 {
			lines = lines[1:]

			if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "```" {
				lines = lines[:len(lines)-1]
			}

			content = strings.TrimSpace(strings.Join(lines, "\n"))
		}
	}

	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")

	if start == -1 || end == -1 || end < start {
		return "", errors.New("ai response did not contain a json object")
	}

	return content[start : end+1], nil
}
