package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"backend/internal/service"
	"backend/internal/storage"
	"backend/internal/testutil/memstore"
)

// testApp is the real route table + middleware wired to in-memory stores,
// local disk storage in a temp dir, and (optionally) a fake OpenRouter.
type testApp struct {
	t         *testing.T
	handler   http.Handler
	store     *memstore.Store
	auth      *service.AuthService
	uploadDir string
}

const testOrigin = "http://frontend.test"

type appOptions struct {
	maxUploadBytes int64
	aiBaseURL      string          // empty → AI not configured
	storage        storage.Storage // nil → LocalStorage in a temp dir
}

func newTestApp(t *testing.T, opts ...appOptions) *testApp {
	t.Helper()
	o := appOptions{maxUploadBytes: 1 << 20}
	if len(opts) > 0 {
		if opts[0].maxUploadBytes != 0 {
			o.maxUploadBytes = opts[0].maxUploadBytes
		}
		o.aiBaseURL = opts[0].aiBaseURL
		o.storage = opts[0].storage
	}

	store := memstore.New()
	uploadDir := filepath.Join(t.TempDir(), "uploads")
	if o.storage == nil {
		o.storage = storage.NewLocalStorage(uploadDir)
	}
	auth := service.NewAuthService(store.Users(), "test-secret")

	aiKey := ""
	if o.aiBaseURL != "" {
		aiKey = "test-key"
	}

	h := NewHandler(Deps{
		FrontendOrigin:      testOrigin,
		MaxUploadBytes:      o.maxUploadBytes,
		AuthService:         auth,
		PostService:         service.NewPostService(store.Posts()),
		UploadService:       service.NewUploadService(o.storage, o.maxUploadBytes),
		AIService:           service.NewAIService(service.AIConfig{APIKey: aiKey, BaseURL: o.aiBaseURL, Model: "test/model"}),
		UserSettingsService: service.NewUserSettingsService(store.Users()),
	})

	return &testApp{t: t, handler: h, store: store, auth: auth, uploadDir: uploadDir}
}

type req struct {
	method string
	path   string
	body   any // string → sent raw; anything else → JSON-encoded; nil → no body
	token  string
	header map[string]string
}

func (a *testApp) do(r req) *httptest.ResponseRecorder {
	a.t.Helper()
	var body io.Reader
	switch b := r.body.(type) {
	case nil:
	case string:
		body = strings.NewReader(b)
	case []byte:
		body = bytes.NewReader(b)
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			a.t.Fatal(err)
		}
		body = bytes.NewReader(raw)
	}
	hr := httptest.NewRequest(r.method, r.path, body)
	if r.body != nil {
		if _, isBytes := r.body.([]byte); !isBytes {
			hr.Header.Set("Content-Type", "application/json")
		}
	}
	if r.token != "" {
		hr.Header.Set("Authorization", "Bearer "+r.token)
	}
	for k, v := range r.header {
		hr.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, hr)
	return rec
}

func (a *testApp) tokenFor(userID int64) string {
	a.t.Helper()
	tok, err := a.auth.GenerateToken(userID)
	if err != nil {
		a.t.Fatal(err)
	}
	return tok
}

// userWithToken inserts a user straight into the store and returns its id + JWT.
func (a *testApp) userWithToken(name string) (int64, string) {
	u := a.store.MustAddUser(name, name+"@example.com")
	return u.ID, a.tokenFor(u.ID)
}

func (a *testApp) upload(token string, filename string, data []byte) *httptest.ResponseRecorder {
	a.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("image", filename)
	if err != nil {
		a.t.Fatal(err)
	}
	_, _ = fw.Write(data)
	_ = mw.Close()

	hr := httptest.NewRequest(http.MethodPost, "/uploads", &buf)
	hr.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		hr.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, hr)
	return rec
}

// decodeOne decodes the body into v and fails if the body holds anything but
// exactly one JSON value (catches handlers that write two responses).
func decodeOne(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(rec.Body.Bytes()))
	if err := dec.Decode(v); err != nil {
		t.Fatalf("response is not JSON (%v): %s", err, rec.Body.String())
	}
	var extra json.RawMessage
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		t.Fatalf("response contains more than one JSON value: %s", rec.Body.String())
	}
}

// expectError asserts status + the standard {"error":{"code","message"}} envelope.
func expectError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, status, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var env struct {
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	decodeOne(t, rec, &env)
	if env.Error == nil {
		t.Fatalf("missing error envelope: %s", rec.Body.String())
	}
	if env.Error.Code != code {
		t.Errorf("error.code = %q, want %q", env.Error.Code, code)
	}
	if env.Error.Message == "" {
		t.Error("error.message is empty")
	}
}

func expectStatus(t *testing.T, rec *httptest.ResponseRecorder, status int) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, status, rec.Body.String())
	}
}
