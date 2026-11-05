package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"backend/internal/testutil/fixtures"
)

// ---------- auth ----------

func TestSignupAndLogin(t *testing.T) {
	app := newTestApp(t)

	rec := app.do(req{method: http.MethodPost, path: "/auth/signup", body: map[string]string{
		"username": "alice", "email": "alice@example.com", "password": "password123",
	}})
	expectStatus(t, rec, http.StatusCreated)
	assertAuthResponseShape(t, rec)

	rec = app.do(req{method: http.MethodPost, path: "/auth/login", body: map[string]string{
		"email": "alice@example.com", "password": "password123",
	}})
	expectStatus(t, rec, http.StatusOK)
	auth := assertAuthResponseShape(t, rec)

	// The token works against a protected route.
	rec = app.do(req{method: http.MethodPut, path: "/users/me/settings/language", body: map[string]string{"preferred_language": "ja"}, token: auth.Token})
	expectStatus(t, rec, http.StatusNoContent)
}

type authResponse struct {
	Token string         `json:"token"`
	User  map[string]any `json:"user"`
}

// assertAuthResponseShape pins the JSON the frontend's LoginResponse type relies on.
func assertAuthResponseShape(t *testing.T, rec *httptest.ResponseRecorder) authResponse {
	t.Helper()
	var resp authResponse
	decodeOne(t, rec, &resp)
	if resp.Token == "" {
		t.Error("token missing")
	}
	for _, k := range []string{"id", "username", "email", "preferred_language", "created_at"} {
		if _, ok := resp.User[k]; !ok {
			t.Errorf("user.%s missing from response: %v", k, resp.User)
		}
	}
	body := strings.ToLower(rec.Body.String())
	if strings.Contains(body, "password") || strings.Contains(body, "$2a$") {
		t.Errorf("response leaks password material: %s", rec.Body.String())
	}
	return resp
}

func TestSignupErrors(t *testing.T) {
	app := newTestApp(t)
	app.store.MustAddUser("taken", "taken@example.com")

	cases := []struct {
		name   string
		body   any
		status int
		code   string
	}{
		{"malformed json", `{"username":`, http.StatusBadRequest, "invalid_json"},
		{"unknown field", `{"username":"a","email":"a@b.c","password":"pw","admin":true}`, http.StatusBadRequest, "invalid_json"},
		{"missing fields", map[string]string{"username": "a"}, http.StatusBadRequest, "signup_failed"},
		{"password too long", map[string]string{"username": "a", "email": "a@b.c", "password": strings.Repeat("x", 73)}, http.StatusBadRequest, "signup_failed"},
		{"duplicate email", map[string]string{"username": "new", "email": "taken@example.com", "password": "pw"}, http.StatusConflict, "signup_failed"},
		{"duplicate username", map[string]string{"username": "taken", "email": "new@example.com", "password": "pw"}, http.StatusConflict, "signup_failed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			expectError(t, app.do(req{method: http.MethodPost, path: "/auth/signup", body: tc.body}), tc.status, tc.code)
		})
	}
}

func TestLoginErrors(t *testing.T) {
	app := newTestApp(t)
	app.do(req{method: http.MethodPost, path: "/auth/signup", body: map[string]string{
		"username": "bob", "email": "bob@example.com", "password": "password123",
	}})

	expectError(t, app.do(req{method: http.MethodPost, path: "/auth/login", body: `nope`}), http.StatusBadRequest, "invalid_json")
	expectError(t, app.do(req{method: http.MethodPost, path: "/auth/login", body: map[string]string{"email": "bob@example.com", "password": "wrong"}}), http.StatusUnauthorized, "invalid_credentials")
	expectError(t, app.do(req{method: http.MethodPost, path: "/auth/login", body: map[string]string{"email": "ghost@example.com", "password": "password123"}}), http.StatusUnauthorized, "invalid_credentials")
}

func TestGetUser(t *testing.T) {
	app := newTestApp(t)
	id, _ := app.userWithToken("carol")

	rec := app.do(req{method: http.MethodGet, path: fmt.Sprintf("/users/%d", id)})
	expectStatus(t, rec, http.StatusOK)
	var u map[string]any
	decodeOne(t, rec, &u)
	if u["username"] != "carol" {
		t.Errorf("username = %v", u["username"])
	}
	if _, ok := u["password_hash"]; ok {
		t.Error("password_hash exposed by GET /users/{id}")
	}

	expectError(t, app.do(req{method: http.MethodGet, path: "/users/abc"}), http.StatusBadRequest, "invalid_user_id")
	expectError(t, app.do(req{method: http.MethodGet, path: "/users/999"}), http.StatusNotFound, "user_not_found")
}

// ---------- posts ----------

func TestPostLifecycle(t *testing.T) {
	app := newTestApp(t)
	aliceID, alice := app.userWithToken("alice")
	_, mallory := app.userWithToken("mallory")

	// Upload, then create a post referencing the returned path.
	rec := app.upload(alice, "photo.jpg", fixtures.JPEG())
	expectStatus(t, rec, http.StatusCreated)
	var up struct {
		ImagePath string `json:"image_path"`
	}
	decodeOne(t, rec, &up)

	rec = app.do(req{method: http.MethodPost, path: "/posts", token: alice, body: map[string]any{
		"image_path": up.ImagePath, "caption": "first light", "location": "Nara",
	}})
	expectStatus(t, rec, http.StatusCreated)
	created := decodePost(t, rec)
	if created["user_id"] != float64(aliceID) || created["username"] != "alice" || created["location"] != "Nara" {
		t.Fatalf("unexpected created post: %v", created)
	}
	postPath := fmt.Sprintf("/posts/%v", created["id"])

	// Feed and detail are public.
	rec = app.do(req{method: http.MethodGet, path: "/posts"})
	expectStatus(t, rec, http.StatusOK)
	var feed []map[string]any
	decodeOne(t, rec, &feed)
	if len(feed) != 1 || feed[0]["id"] != created["id"] {
		t.Fatalf("feed = %v", feed)
	}
	expectStatus(t, app.do(req{method: http.MethodGet, path: postPath}), http.StatusOK)

	// Only the owner may edit or delete.
	expectError(t, app.do(req{method: http.MethodPut, path: postPath, token: mallory, body: map[string]any{"caption": "pwned"}}), http.StatusForbidden, "forbidden")
	expectError(t, app.do(req{method: http.MethodDelete, path: postPath, token: mallory}), http.StatusForbidden, "forbidden")

	rec = app.do(req{method: http.MethodPut, path: postPath, token: alice, body: map[string]any{"caption": "edited", "lens": "35mm"}})
	expectStatus(t, rec, http.StatusOK)
	updated := decodePost(t, rec)
	if updated["caption"] != "edited" || updated["lens"] != "35mm" {
		t.Errorf("update not reflected: %v", updated)
	}
	if _, ok := updated["location"]; ok {
		t.Errorf("omitted location should be cleared by PUT (full replace): %v", updated)
	}

	rec = app.do(req{method: http.MethodDelete, path: postPath, token: alice})
	expectStatus(t, rec, http.StatusNoContent)
	if rec.Body.Len() != 0 {
		t.Errorf("204 with a body: %q", rec.Body.String())
	}
	expectError(t, app.do(req{method: http.MethodGet, path: postPath}), http.StatusNotFound, "post_not_found")
}

// decodePost decodes a post and pins the snake_case keys the frontend's Post type uses.
func decodePost(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var p map[string]any
	decodeOne(t, rec, &p)
	for _, k := range []string{"id", "user_id", "username", "image_path", "caption", "created_at", "updated_at"} {
		if _, ok := p[k]; !ok {
			t.Errorf("post.%s missing: %v", k, p)
		}
	}
	return p
}

func TestListPostsEmptyIsArray(t *testing.T) {
	app := newTestApp(t)
	rec := app.do(req{method: http.MethodGet, path: "/posts"})
	expectStatus(t, rec, http.StatusOK)
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("empty feed = %s, want []", got)
	}
}

func TestPostErrors(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	expectError(t, app.do(req{method: http.MethodGet, path: "/posts/abc"}), http.StatusBadRequest, "invalid_post_id")
	expectError(t, app.do(req{method: http.MethodGet, path: "/posts/999"}), http.StatusNotFound, "post_not_found")
	expectError(t, app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: `{`}), http.StatusBadRequest, "invalid_json")
	expectError(t, app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{"caption": "no image"}}), http.StatusBadRequest, "create_post_failed")
	expectError(t, app.do(req{method: http.MethodPut, path: "/posts/abc", token: tok, body: map[string]any{}}), http.StatusBadRequest, "invalid_post_id")
	expectError(t, app.do(req{method: http.MethodPut, path: "/posts/999", token: tok, body: map[string]any{"caption": "x"}}), http.StatusNotFound, "post_not_found")
	expectError(t, app.do(req{method: http.MethodPut, path: "/posts/1", token: tok, body: `{`}), http.StatusBadRequest, "invalid_json")
	expectError(t, app.do(req{method: http.MethodDelete, path: "/posts/abc", token: tok}), http.StatusBadRequest, "invalid_post_id")
	expectError(t, app.do(req{method: http.MethodDelete, path: "/posts/999", token: tok}), http.StatusNotFound, "post_not_found")
}

// A token for a user that no longer exists (or never did) must not be able to create posts.
func TestCreatePostWithTokenForMissingUser(t *testing.T) {
	app := newTestApp(t)
	rec := app.do(req{method: http.MethodPost, path: "/posts", token: app.tokenFor(12345), body: map[string]any{"image_path": "/uploads/x.jpg"}})
	if rec.Code < 400 {
		t.Fatalf("status = %d, want an error", rec.Code)
	}
}

// ---------- uploads ----------

func TestUploadAndServe(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	data := fixtures.PNG()
	rec := app.upload(tok, "pic.png", data)
	expectStatus(t, rec, http.StatusCreated)
	var up struct {
		ImagePath string `json:"image_path"`
	}
	decodeOne(t, rec, &up)
	if !strings.HasPrefix(up.ImagePath, "/uploads/") || !strings.HasSuffix(up.ImagePath, ".png") {
		t.Fatalf("image_path = %q", up.ImagePath)
	}

	rec = app.do(req{method: http.MethodGet, path: up.ImagePath})
	expectStatus(t, rec, http.StatusOK)
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}
	if !bytes.Equal(rec.Body.Bytes(), data) {
		t.Error("served bytes differ from uploaded bytes")
	}
}

func TestUploadReturnsGearFromEXIF(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	data := fixtures.JPEGWithEXIF(fixtures.CameraTIFF("FUJIFILM", "X-T30 III", "XF35mmF1.4 R"))
	rec := app.upload(tok, "pic.jpg", data)
	expectStatus(t, rec, http.StatusCreated)
	var up map[string]any
	decodeOne(t, rec, &up)
	if up["camera_body"] != "FUJIFILM X-T30 III" || up["lens"] != "XF35mmF1.4 R" {
		t.Fatalf("response = %v", up)
	}

	// Without metadata the keys are absent rather than empty strings.
	rec = app.upload(tok, "plain.png", fixtures.PNG())
	expectStatus(t, rec, http.StatusCreated)
	up = nil
	decodeOne(t, rec, &up)
	for _, k := range []string{"camera_body", "lens"} {
		if _, ok := up[k]; ok {
			t.Errorf("%s present without EXIF: %v", k, up)
		}
	}
}

func TestUploadErrors(t *testing.T) {
	app := newTestApp(t, appOptions{maxUploadBytes: 64 << 10})
	_, tok := app.userWithToken("alice")

	expectError(t, app.upload(tok, "anim.gif", fixtures.GIF()), http.StatusBadRequest, "invalid_file_type")
	expectError(t, app.upload(tok, "evil.jpg", []byte("<html><script>alert(1)</script></html>")), http.StatusBadRequest, "invalid_file_type")

	// Over the file limit but within the body allowance: rejected by the service.
	big := append(fixtures.JPEG(), make([]byte, 128<<10)...)
	expectError(t, app.upload(tok, "big.jpg", big), http.StatusBadRequest, "file_too_large")

	// Past the body allowance too: MaxBytesReader trips while parsing the form,
	// and the client still gets file_too_large rather than a generic form error.
	huge := append(fixtures.JPEG(), make([]byte, 3<<20)...)
	expectError(t, app.upload(tok, "huge.jpg", huge), http.StatusBadRequest, "file_too_large")

	// Multipart form without the "image" field.
	hr := httptest.NewRequest(http.MethodPost, "/uploads", strings.NewReader("--x\r\nContent-Disposition: form-data; name=\"other\"\r\n\r\nv\r\n--x--\r\n"))
	hr.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	hr.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	app.handler.ServeHTTP(rec, hr)
	expectError(t, rec, http.StatusBadRequest, "image_required")

	// Not multipart at all.
	expectError(t, app.do(req{method: http.MethodPost, path: "/uploads", token: tok, body: map[string]string{"image": "x"}}), http.StatusBadRequest, "invalid_multipart_form")
}

// A file of exactly the limit must fit even though the request body is a bit
// larger (multipart boundaries + headers).
func TestUploadAtExactLimitSucceeds(t *testing.T) {
	const limit = 64 << 10
	app := newTestApp(t, appOptions{maxUploadBytes: limit})
	_, tok := app.userWithToken("alice")

	jpeg := fixtures.JPEG()
	exact := append(jpeg, make([]byte, limit-len(jpeg))...)
	expectStatus(t, app.upload(tok, "exact.jpg", exact), http.StatusCreated)

	over := append(exact, 0)
	expectError(t, app.upload(tok, "over.jpg", over), http.StatusBadRequest, "file_too_large")
}

// Files bigger than the in-memory threshold are spooled to a temp file by
// ParseMultipartForm; they must still be stored intact.
func TestUploadLargerThanMemoryThreshold(t *testing.T) {
	app := newTestApp(t, appOptions{maxUploadBytes: 32 << 20})
	_, tok := app.userWithToken("alice")

	data := append(fixtures.JPEG(), bytes.Repeat([]byte{0xAB}, 12<<20)...)
	rec := app.upload(tok, "large.jpg", data)
	expectStatus(t, rec, http.StatusCreated)
	var up struct {
		ImagePath string `json:"image_path"`
	}
	decodeOne(t, rec, &up)

	rec = app.do(req{method: http.MethodGet, path: up.ImagePath})
	expectStatus(t, rec, http.StatusOK)
	if !bytes.Equal(rec.Body.Bytes(), data) {
		t.Error("served bytes differ from uploaded bytes")
	}
}

func TestServeUploadCannotEscapeUploadDir(t *testing.T) {
	app := newTestApp(t)
	secret := filepath.Join(filepath.Dir(app.uploadDir), "secret.txt")
	if err := os.WriteFile(secret, []byte("TOP-SECRET"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(app.uploadDir, 0o755); err != nil {
		t.Fatal(err)
	}

	for _, p := range []string{
		"/uploads/../secret.txt",
		"/uploads/..%2fsecret.txt",
		"/uploads/%2e%2e%2fsecret.txt",
		"/uploads/..%5csecret.txt",
		"/uploads/",
		"/uploads/missing.jpg",
	} {
		t.Run(p, func(t *testing.T) {
			rec := app.do(req{method: http.MethodGet, path: p})
			if rec.Code == http.StatusOK || strings.Contains(rec.Body.String(), "TOP-SECRET") {
				t.Fatalf("status %d, body %q", rec.Code, rec.Body.String())
			}
		})
	}
}

// ---------- user settings ----------

func TestUpdatePreferredLanguage(t *testing.T) {
	app := newTestApp(t)
	id, tok := app.userWithToken("alice")

	expectStatus(t, app.do(req{method: http.MethodPut, path: "/users/me/settings/language", token: tok, body: map[string]string{"preferred_language": "ja"}}), http.StatusNoContent)

	rec := app.do(req{method: http.MethodGet, path: fmt.Sprintf("/users/%d", id)})
	var u map[string]any
	decodeOne(t, rec, &u)
	if u["preferred_language"] != "ja" {
		t.Errorf("preferred_language = %v, want ja", u["preferred_language"])
	}

	expectError(t, app.do(req{method: http.MethodPut, path: "/users/me/settings/language", token: tok, body: map[string]string{"preferred_language": "fr"}}), http.StatusBadRequest, "invalid_preferred_language")
	expectError(t, app.do(req{method: http.MethodPut, path: "/users/me/settings/language", token: tok, body: `{`}), http.StatusBadRequest, "invalid_json")
	expectError(t, app.do(req{method: http.MethodPut, path: "/users/me/settings/language", token: app.tokenFor(999), body: map[string]string{"preferred_language": "ja"}}), http.StatusNotFound, "user_not_found")
}

// ---------- AI ----------

func fakeAIUpstream(t *testing.T, status int, content string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": content}}},
		})
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestGearLink(t *testing.T) {
	t.Run("validation", func(t *testing.T) {
		app := newTestApp(t)
		_, tok := app.userWithToken("alice")
		post := func(body any) *httptest.ResponseRecorder {
			return app.do(req{method: http.MethodPost, path: "/ai/gear-link", token: tok, body: body})
		}
		expectError(t, post(`{not json`), http.StatusBadRequest, "invalid_json")
		expectError(t, post(map[string]string{"kind": "tripod", "name": "X"}), http.StatusBadRequest, "invalid_kind")
		expectError(t, post(map[string]string{"kind": "camera", "name": "   "}), http.StatusBadRequest, "empty_name")
	})

	t.Run("not configured", func(t *testing.T) {
		app := newTestApp(t)
		_, tok := app.userWithToken("alice")
		rec := app.do(req{method: http.MethodPost, path: "/ai/gear-link", token: tok, body: map[string]string{"kind": "camera", "name": "X100V"}})
		expectError(t, rec, http.StatusInternalServerError, "ai_config_missing")
	})

	t.Run("upstream failure is 502", func(t *testing.T) {
		app := newTestApp(t, appOptions{aiBaseURL: fakeAIUpstream(t, http.StatusForbidden, "")})
		_, tok := app.userWithToken("alice")
		rec := app.do(req{method: http.MethodPost, path: "/ai/gear-link", token: tok, body: map[string]string{"kind": "camera", "name": "X100V"}})
		expectError(t, rec, http.StatusBadGateway, "ai_request_failed")
	})

	t.Run("success", func(t *testing.T) {
		content := `{"summary":"Compact.","suggestions":[{"title":"Fujifilm","url":"https://fujifilm-x.com/x100v","reason":"official","confidence":"high"}]}`
		app := newTestApp(t, appOptions{aiBaseURL: fakeAIUpstream(t, http.StatusOK, content)})
		_, tok := app.userWithToken("alice")
		rec := app.do(req{method: http.MethodPost, path: "/ai/gear-link", token: tok, body: map[string]string{"kind": " camera ", "name": " X100V "}})
		expectStatus(t, rec, http.StatusOK)
		var got struct {
			Kind, Name, Summary string
			Suggestions         []map[string]string
		}
		decodeOne(t, rec, &got)
		if got.Kind != "camera" || got.Name != "X100V" || len(got.Suggestions) != 1 {
			t.Errorf("got %+v", got)
		}
	})
}

// ---------- error hygiene ----------

// When the database fails, clients must get a fixed generic message, never the
// driver error (which can include SQLSTATE codes, DB user and host).
func TestUnexpectedErrorsDoNotLeakInternals(t *testing.T) {
	const dbErr = `failed to connect to host=10.9.8.7 user=photoshare_admin database=photoshare: FATAL: password authentication failed (SQLSTATE 28P01)`
	leakMarkers := []string{"SQLSTATE", "photoshare_admin", "10.9.8.7", "FATAL"}

	app := newTestApp(t)
	_, tok := app.userWithToken("alice")
	app.store.MustAddPost(1, "/uploads/x.jpg", "x")
	app.store.Err = errors.New(dbErr)

	cases := []req{
		{method: http.MethodPost, path: "/auth/signup", body: map[string]string{"username": "z", "email": "z@z.z", "password": "pw"}},
		{method: http.MethodPost, path: "/auth/login", body: map[string]string{"email": "alice@example.com", "password": "pw"}},
		{method: http.MethodGet, path: "/users/1"},
		{method: http.MethodGet, path: "/posts"},
		{method: http.MethodGet, path: "/posts/1"},
		{method: http.MethodPost, path: "/posts", token: tok, body: map[string]string{"image_path": "/uploads/x.jpg"}},
		{method: http.MethodPut, path: "/posts/1", token: tok, body: map[string]string{"caption": "x"}},
		{method: http.MethodDelete, path: "/posts/1", token: tok},
		{method: http.MethodPut, path: "/users/me/settings/language", token: tok, body: map[string]string{"preferred_language": "ja"}},
	}
	for _, r := range cases {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			rec := app.do(r)
			if rec.Code != http.StatusInternalServerError {
				t.Errorf("status = %d, want 500", rec.Code)
			}
			for _, m := range leakMarkers {
				if strings.Contains(rec.Body.String(), m) {
					t.Fatalf("response leaks %q: %s", m, rec.Body.String())
				}
			}
			var env struct {
				Error *struct{ Code, Message string } `json:"error"`
			}
			decodeOne(t, rec, &env)
			if env.Error == nil || env.Error.Code == "" {
				t.Errorf("missing error envelope: %s", rec.Body.String())
			}
		})
	}
}
