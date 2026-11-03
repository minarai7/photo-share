package service

// Internal test package: exercises unexported helpers (extractJSONContent,
// filterValidSuggestions) and FindGearLinks against a fake OpenRouter server.
// No real network calls or API keys are involved.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/dto"
)

func TestExtractJSONContent(t *testing.T) {
	cases := []struct {
		name, in, want string
		wantErr        bool
	}{
		{"plain object", `{"a":1}`, `{"a":1}`, false},
		{"surrounding whitespace", "\n  {\"a\":1}  \n", `{"a":1}`, false},
		{"json code fence", "```json\n{\"a\":1}\n```", `{"a":1}`, false},
		{"bare code fence", "```\n{\"a\":1}\n```", `{"a":1}`, false},
		{"chatty preamble", `Here is the JSON: {"a":{"b":2}} hope this helps`, `{"a":{"b":2}}`, false},
		{"no object", "sorry, I can't help", "", true},
		{"reversed braces", "} oops {", "", true},
		{"empty", "", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := extractJSONContent(tc.in)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFilterValidSuggestions(t *testing.T) {
	in := []dto.GearLinkSuggestion{
		{Title: "Official", URL: "https://sony.com/a7"},
		{Title: "HTTP ok", URL: "http://example.com/x"},
		{Title: "Script", URL: "javascript:alert(1)"},
		{Title: "Relative", URL: "/products/a7"},
		{Title: "FTP", URL: "ftp://example.com/file"},
		{Title: "   ", URL: "https://example.com/no-title"},
		{Title: "Garbage", URL: "not a url"},
	}
	got := filterValidSuggestions(in)
	if len(got) != 2 || got[0].Title != "Official" || got[1].Title != "HTTP ok" {
		t.Fatalf("got %+v, want only the https and http suggestions", got)
	}
	if filterValidSuggestions(nil) == nil {
		t.Error("must return a non-nil slice so JSON encodes [] not null")
	}
}

func fakeOpenRouter(t *testing.T, status int, content string, inspect func(*http.Request, openRouterChatRequest)) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		var body openRouterChatRequest
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &body); err != nil {
			t.Errorf("request body is not JSON: %v", err)
		}
		if inspect != nil {
			inspect(r, body)
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": content}}},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestFindGearLinks_Success(t *testing.T) {
	content := "```json\n" + `{
		"kind": "lens", "name": "model-rewrote-this", "summary": "A fast prime.",
		"suggestions": [
			{"title": "Official", "url": "https://example.com/lens", "reason": "maker", "confidence": "high"},
			{"title": "Bad", "url": "javascript:alert(1)", "reason": "", "confidence": "low"}
		]
	}` + "\n```"

	srv := fakeOpenRouter(t, http.StatusOK, content, func(r *http.Request, body openRouterChatRequest) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q", got)
		}
		if got := r.Header.Get("HTTP-Referer"); got != "http://app.test" {
			t.Errorf("HTTP-Referer = %q", got)
		}
		if body.Model != "test/model" {
			t.Errorf("model = %q", body.Model)
		}
		if len(body.Messages) != 2 || body.Messages[0].Role != "system" || body.Messages[1].Role != "user" {
			t.Errorf("unexpected messages: %+v", body.Messages)
		}
	})

	svc := NewAIService(AIConfig{APIKey: "test-key", BaseURL: srv.URL, Model: "test/model", AppURL: "http://app.test", AppTitle: "Test"})
	got, err := svc.FindGearLinks(context.Background(), dto.GearLinkRequest{Kind: "lens", Name: "XF 23mm F1.4"})
	if err != nil {
		t.Fatalf("FindGearLinks: %v", err)
	}
	// kind/name echo the request, not whatever the model wrote.
	if got.Kind != "lens" || got.Name != "XF 23mm F1.4" {
		t.Errorf("kind/name = %q/%q, want request values", got.Kind, got.Name)
	}
	if got.Summary != "A fast prime." {
		t.Errorf("summary = %q", got.Summary)
	}
	if len(got.Suggestions) != 1 || got.Suggestions[0].URL != "https://example.com/lens" {
		t.Errorf("unsafe suggestion not filtered: %+v", got.Suggestions)
	}
}

func TestFindGearLinks_NullSuggestionsBecomeEmptyArray(t *testing.T) {
	srv := fakeOpenRouter(t, http.StatusOK, `{"summary":"x","suggestions":null}`, nil)
	svc := NewAIService(AIConfig{APIKey: "k", BaseURL: srv.URL})
	got, err := svc.FindGearLinks(context.Background(), dto.GearLinkRequest{Kind: "camera", Name: "X"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Suggestions == nil {
		t.Fatal("suggestions must be [] not null")
	}
}

func TestFindGearLinks_Failures(t *testing.T) {
	t.Run("missing api key never calls upstream", func(t *testing.T) {
		called := false
		srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
		defer srv.Close()
		svc := NewAIService(AIConfig{APIKey: "", BaseURL: srv.URL})
		_, err := svc.FindGearLinks(context.Background(), dto.GearLinkRequest{Kind: "camera", Name: "X"})
		if !errors.Is(err, ErrAIConfigMissing) {
			t.Errorf("got %v, want ErrAIConfigMissing", err)
		}
		if called {
			t.Error("upstream was called without an API key")
		}
	})

	cases := []struct {
		name    string
		status  int
		content string
	}{
		{"upstream 403", http.StatusForbidden, `{"summary":"x"}`},
		{"upstream 500", http.StatusInternalServerError, `{"summary":"x"}`},
		{"empty content", http.StatusOK, ""},
		{"prose instead of json", http.StatusOK, "I could not find anything."},
		{"malformed json", http.StatusOK, `{"summary": "x",}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := fakeOpenRouter(t, tc.status, tc.content, nil)
			svc := NewAIService(AIConfig{APIKey: "k", BaseURL: srv.URL})
			if _, err := svc.FindGearLinks(context.Background(), dto.GearLinkRequest{Kind: "camera", Name: "X"}); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
