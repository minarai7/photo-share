package server

import (
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// routeTable is the single place that declares, for every registered route,
// whether it requires a Bearer token. TestRouteInventory fails when router.go
// registers a pattern that is missing here, so adding an endpoint forces an
// explicit auth decision (and a matching entry in openapi/openapi.yaml).
var routeTable = []struct {
	pattern     string // exactly as registered in router.go
	examplePath string // concrete path to hit
	requireAuth bool
}{
	{"GET /health", "/health", false},
	{"POST /auth/signup", "/auth/signup", false},
	{"POST /auth/login", "/auth/login", false},
	{"GET /users/", "/users/1", false},
	{"GET /posts", "/posts", false},
	{"POST /posts", "/posts", true},
	{"GET /posts/", "/posts/1", false},
	{"PUT /posts/", "/posts/1", true},
	{"DELETE /posts/", "/posts/1", true},
	{"POST /uploads", "/uploads", true},
	{"GET /uploads/", "/uploads/x.jpg", false},
	{"POST /ai/gear-link", "/ai/gear-link", true},
	{"PUT /users/me/settings/language", "/users/me/settings/language", true},
}

func TestRouteInventory(t *testing.T) {
	src, err := os.ReadFile("router.go")
	if err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`mux\.Handle(?:Func)?\(\s*"([^"]+)"`)
	registered := map[string]bool{}
	for _, m := range re.FindAllSubmatch(src, -1) {
		registered[string(m[1])] = true
	}
	if len(registered) == 0 {
		t.Fatal("found no routes in router.go; did the registration style change? update this test's regexp")
	}

	declared := map[string]bool{}
	for _, r := range routeTable {
		declared[r.pattern] = true
	}

	var missing, stale []string
	for p := range registered {
		if !declared[p] {
			missing = append(missing, p)
		}
	}
	for p := range declared {
		if !registered[p] {
			stale = append(stale, p)
		}
	}
	sort.Strings(missing)
	sort.Strings(stale)
	if len(missing) > 0 {
		t.Errorf("routes registered in router.go but not declared in routeTable (decide requireAuth and add them): %v", missing)
	}
	if len(stale) > 0 {
		t.Errorf("routeTable lists routes that router.go no longer registers: %v", stale)
	}
}

func TestRouteAuth(t *testing.T) {
	app := newTestApp(t)

	for _, r := range routeTable {
		method, _, _ := strings.Cut(r.pattern, " ")

		t.Run(r.pattern, func(t *testing.T) {
			if r.requireAuth {
				for name, hdr := range map[string]string{
					"no header":    "",
					"basic scheme": "Basic dXNlcjpwYXNz",
					"bad token":    "Bearer not-a-jwt",
					"empty bearer": "Bearer ",
				} {
					headers := map[string]string{}
					if hdr != "" {
						headers["Authorization"] = hdr
					}
					rec := app.do(req{method: method, path: r.examplePath, header: headers})
					t.Run(name, func(t *testing.T) { expectError(t, rec, http.StatusUnauthorized, "unauthorized") })
				}
				return
			}
			rec := app.do(req{method: method, path: r.examplePath})
			if rec.Code == http.StatusUnauthorized {
				t.Fatalf("public route returned 401: %s", rec.Body.String())
			}
		})
	}
}

func TestHealth(t *testing.T) {
	app := newTestApp(t)
	rec := app.do(req{method: http.MethodGet, path: "/health"})
	expectStatus(t, rec, http.StatusOK)
	var body map[string]string
	decodeOne(t, rec, &body)
	if body["status"] != "ok" {
		t.Errorf("body = %v", body)
	}
}

func TestCORS(t *testing.T) {
	app := newTestApp(t)

	preflight := func(origin string) http.Header {
		rec := app.do(req{method: http.MethodOptions, path: "/posts", header: map[string]string{
			"Origin":                         origin,
			"Access-Control-Request-Method":  "POST",
			"Access-Control-Request-Headers": "authorization,content-type",
		}})
		return rec.Header()
	}

	h := preflight(testOrigin)
	if got := h.Get("Access-Control-Allow-Origin"); got != testOrigin {
		t.Errorf("allowed origin: Access-Control-Allow-Origin = %q, want %q", got, testOrigin)
	}

	h = preflight("https://evil.example")
	if got := h.Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("foreign origin was allowed: %q", got)
	}
}

func TestRecoveryTurnsPanicInto500(t *testing.T) {
	h := WrapMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}), testOrigin)

	app := &testApp{t: t, handler: h}
	rec := app.do(req{method: http.MethodGet, path: "/anything"})
	expectStatus(t, rec, http.StatusInternalServerError)
}
