package server

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"backend/internal/exifmeta"
	"backend/internal/repository"
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

// GET /users/{id} is public: name and counts for the person hero, and
// nothing private (no email, password hash or settings).
func TestGetUser(t *testing.T) {
	app := newTestApp(t)
	id, tok := app.userWithToken("carol")
	app.store.MustAddPost(id, "/uploads/c1.jpg", "")
	expectStatus(t, app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{
		"images": []map[string]string{{"image_path": "/uploads/c2.jpg"}, {"image_path": "/uploads/c3.jpg"}},
	}}), http.StatusCreated)

	rec := app.do(req{method: http.MethodGet, path: fmt.Sprintf("/users/%d", id)})
	expectStatus(t, rec, http.StatusOK)
	var u map[string]any
	decodeOne(t, rec, &u)
	want := map[string]any{"id": float64(id), "username": "carol", "post_count": float64(2), "photo_count": float64(3)}
	for k, v := range want {
		if u[k] != v {
			t.Errorf("%s = %v, want %v", k, u[k], v)
		}
	}
	for k := range u {
		if _, ok := want[k]; !ok && k != "created_at" {
			t.Errorf("GET /users/{id} exposes %q: %v", k, u)
		}
	}

	expectError(t, app.do(req{method: http.MethodGet, path: "/users/abc"}), http.StatusBadRequest, "invalid_user_id")
	expectError(t, app.do(req{method: http.MethodGet, path: "/users/999"}), http.StatusNotFound, "user_not_found")
}

func TestListAuthors(t *testing.T) {
	app := newTestApp(t)

	rec := app.do(req{method: http.MethodGet, path: "/users"})
	expectStatus(t, rec, http.StatusOK)
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("no authors: body = %s, want []", got)
	}

	zoe, _ := app.userWithToken("zoe")
	amy, _ := app.userWithToken("amy")
	app.userWithToken("lurker")
	app.store.MustAddPost(zoe, "/uploads/z1.jpg", "")
	app.store.MustAddPost(zoe, "/uploads/z2.jpg", "")
	app.store.MustAddPost(amy, "/uploads/a1.jpg", "")

	rec = app.do(req{method: http.MethodGet, path: "/users"})
	expectStatus(t, rec, http.StatusOK)
	var authors []map[string]any
	decodeOne(t, rec, &authors)
	want := []map[string]any{
		{"id": float64(amy), "username": "amy", "post_count": float64(1)},
		{"id": float64(zoe), "username": "zoe", "post_count": float64(2)},
	}
	if fmt.Sprint(authors) != fmt.Sprint(want) {
		t.Errorf("authors = %v, want %v (exactly these keys: no email)", authors, want)
	}
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
	for _, k := range []string{"id", "user_id", "username", "image_path", "images", "caption", "created_at", "updated_at"} {
		if _, ok := p[k]; !ok {
			t.Errorf("post.%s missing: %v", k, p)
		}
	}
	return p
}

// postImages returns a decoded post's images as {image_path, thumbnail_path}
// maps, failing unless every one has exactly the keys the frontend expects.
func postImages(t *testing.T, p map[string]any) []map[string]any {
	t.Helper()
	raw, ok := p["images"].([]any)
	if !ok {
		t.Fatalf("images is %T, want an array: %v", p["images"], p)
	}
	out := make([]map[string]any, len(raw))
	for i, r := range raw {
		img, ok := r.(map[string]any)
		if !ok {
			t.Fatalf("images[%d] is %T", i, r)
		}
		for k := range img {
			if k != "image_path" && k != "thumbnail_path" {
				t.Errorf("images[%d] has unexpected key %q: %v", i, k, img)
			}
		}
		out[i] = img
	}
	return out
}

func TestCreatePostWithMultipleImages(t *testing.T) {
	app := newTestApp(t)
	_, alice := app.userWithToken("alice")

	type uploaded struct {
		ImagePath     string `json:"image_path"`
		ThumbnailPath string `json:"thumbnail_path"`
	}
	var ups []uploaded
	for i, data := range [][]byte{
		fixtures.EncodePNG(fixtures.Gradient(1200, 900)),
		fixtures.JPEG(),
		fixtures.EncodePNG(fixtures.Gradient(900, 1200)),
	} {
		rec := app.upload(alice, fmt.Sprintf("p%d.png", i), data)
		expectStatus(t, rec, http.StatusCreated)
		var up uploaded
		decodeOne(t, rec, &up)
		ups = append(ups, up)
	}

	images := []map[string]any{}
	for _, up := range ups {
		img := map[string]any{"image_path": up.ImagePath}
		if up.ThumbnailPath != "" {
			img["thumbnail_path"] = up.ThumbnailPath
		}
		images = append(images, img)
	}
	rec := app.do(req{method: http.MethodPost, path: "/posts", token: alice, body: map[string]any{
		"images": images, "caption": "three",
	}})
	expectStatus(t, rec, http.StatusCreated)
	created := decodePost(t, rec)

	check := func(where string, p map[string]any) {
		t.Helper()
		got := postImages(t, p)
		if len(got) != 3 {
			t.Fatalf("%s: %d images, want 3: %v", where, len(got), p)
		}
		for i, up := range ups {
			if got[i]["image_path"] != up.ImagePath {
				t.Errorf("%s: images[%d] = %v, want %s (order kept)", where, i, got[i]["image_path"], up.ImagePath)
			}
			if up.ThumbnailPath != "" && got[i]["thumbnail_path"] != up.ThumbnailPath {
				t.Errorf("%s: images[%d].thumbnail_path = %v, want %s", where, i, got[i]["thumbnail_path"], up.ThumbnailPath)
			}
		}
		// The top-level fields are the cover, for clients that predate images.
		if p["image_path"] != ups[0].ImagePath || p["thumbnail_path"] != ups[0].ThumbnailPath {
			t.Errorf("%s: cover = %v / %v, want the first image", where, p["image_path"], p["thumbnail_path"])
		}
	}
	check("create", created)

	rec = app.do(req{method: http.MethodGet, path: fmt.Sprintf("/posts/%v", created["id"])})
	expectStatus(t, rec, http.StatusOK)
	check("detail", decodePost(t, rec))

	// The feed carries the cover and the count, not the images.
	rec = app.do(req{method: http.MethodGet, path: "/posts"})
	var feed []map[string]any
	decodeOne(t, rec, &feed)
	if len(feed) != 1 {
		t.Fatalf("feed has %d posts, want 1", len(feed))
	}
	if _, ok := feed[0]["images"]; ok {
		t.Errorf("feed post has images: %v", feed[0])
	}
	if feed[0]["image_count"] != float64(3) || feed[0]["image_path"] != ups[0].ImagePath {
		t.Errorf("feed post = %v, want image_count 3 and the first image as cover", feed[0])
	}
	if created["image_count"] != float64(3) {
		t.Errorf("created post image_count = %v, want 3", created["image_count"])
	}

	// Editing the text keeps the images.
	rec = app.do(req{method: http.MethodPut, path: fmt.Sprintf("/posts/%v", created["id"]), token: alice, body: map[string]any{"caption": "edited"}})
	expectStatus(t, rec, http.StatusOK)
	check("update", decodePost(t, rec))
}

func TestListPostsPaginationAndUserFilter(t *testing.T) {
	app := newTestApp(t)
	aliceID, alice := app.userWithToken("alice")
	bobID, bob := app.userWithToken("bob")

	var created []map[string]any
	for i, tok := range []string{alice, bob, alice, alice, bob} {
		rec := app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{
			"images": []map[string]string{{"image_path": fmt.Sprintf("/uploads/%d.jpg", i)}}, "caption": fmt.Sprint(i),
		}})
		expectStatus(t, rec, http.StatusCreated)
		created = append(created, decodePost(t, rec))
	}

	list := func(query string) []map[string]any {
		t.Helper()
		rec := app.do(req{method: http.MethodGet, path: "/posts" + query})
		expectStatus(t, rec, http.StatusOK)
		var posts []map[string]any
		decodeOne(t, rec, &posts)
		return posts
	}

	// Without parameters: every post, as before pagination existed.
	all := list("")
	if len(all) != 5 {
		t.Fatalf("GET /posts returned %d posts, want 5", len(all))
	}

	// Page through with the cursor built from the last post of each page,
	// exactly as the frontend does (created_at is sent back as received).
	var walked []any
	query := "?limit=2"
	for range 10 {
		page := list(query)
		for _, p := range page {
			walked = append(walked, p["id"])
		}
		if len(page) < 2 {
			break
		}
		last := page[len(page)-1]
		query = fmt.Sprintf("?limit=2&before_created_at=%s&before_id=%v", url.QueryEscape(last["created_at"].(string)), last["id"])
	}
	if len(walked) != 5 {
		t.Fatalf("pages visited %v, want all 5 posts once", walked)
	}
	for i, p := range all {
		if walked[i] != p["id"] {
			t.Fatalf("page order %v differs from the full list", walked)
		}
	}

	for _, tc := range []struct {
		userID int64
		want   int
	}{{aliceID, 3}, {bobID, 2}, {999, 0}} {
		posts := list(fmt.Sprintf("?user_id=%d", tc.userID))
		if len(posts) != tc.want {
			t.Errorf("user %d: %d posts, want %d", tc.userID, len(posts), tc.want)
		}
		for _, p := range posts {
			if p["user_id"] != float64(tc.userID) {
				t.Errorf("user %d's list has post of user %v", tc.userID, p["user_id"])
			}
		}
	}
	if got := list(fmt.Sprintf("?user_id=%d&limit=1", aliceID)); len(got) != 1 || got[0]["id"] != created[3]["id"] {
		t.Errorf("alice's first page = %v, want her newest post", got)
	}
}

// sort, user_ids and photos reach the query, each sort pages with its own
// cursor sent back as received, and /posts/count counts the same filters.
func TestListPostsSortFilterAndCount(t *testing.T) {
	app := newTestApp(t)
	aliceID, alice := app.userWithToken("alice")
	bobID, bob := app.userWithToken("bob")
	carolID, carol := app.userWithToken("carol")

	n := 0
	create := func(tok string, images int) any {
		t.Helper()
		var imgs []map[string]string
		for range images {
			n++
			imgs = append(imgs, map[string]string{"image_path": fmt.Sprintf("/uploads/%d.jpg", n)})
		}
		rec := app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{"images": imgs}})
		expectStatus(t, rec, http.StatusCreated)
		return decodePost(t, rec)["id"]
	}
	a1 := create(alice, 1)
	b3 := create(bob, 3)
	c2 := create(carol, 2)
	a3 := create(alice, 3)

	list := func(query string) []map[string]any {
		t.Helper()
		rec := app.do(req{method: http.MethodGet, path: "/posts" + query})
		expectStatus(t, rec, http.StatusOK)
		var posts []map[string]any
		decodeOne(t, rec, &posts)
		return posts
	}
	idsOf := func(posts []map[string]any) []any {
		out := []any{}
		for _, p := range posts {
			out = append(out, p["id"])
		}
		return out
	}
	count := func(query string) float64 {
		t.Helper()
		rec := app.do(req{method: http.MethodGet, path: "/posts/count" + query})
		expectStatus(t, rec, http.StatusOK)
		var body map[string]any
		decodeOne(t, rec, &body)
		if len(body) != 1 {
			t.Errorf("count body = %v, want only count", body)
		}
		return body["count"].(float64)
	}

	for _, tc := range []struct {
		query string
		want  []any
	}{
		{"", []any{a3, c2, b3, a1}},
		{"?sort=newest", []any{a3, c2, b3, a1}},
		{"?sort=oldest", []any{a1, b3, c2, a3}},
		{"?sort=most", []any{a3, b3, c2, a1}},
		{fmt.Sprintf("?user_ids=%d,%d", aliceID, carolID), []any{a3, c2, a1}},
		{fmt.Sprintf("?user_ids=%d&user_id=%d", bobID, carolID), []any{c2, b3}},
		{fmt.Sprintf("?user_id=%d", bobID), []any{b3}},
		{"?photos=single", []any{a1}},
		{"?photos=series&sort=oldest", []any{b3, c2, a3}},
		{"?photos=any", []any{a3, c2, b3, a1}},
		{fmt.Sprintf("?photos=series&user_ids=%d", aliceID), []any{a3}},
	} {
		if got := idsOf(list(tc.query)); fmt.Sprint(got) != fmt.Sprint(tc.want) {
			t.Errorf("GET /posts%s = %v, want %v", tc.query, got, tc.want)
		}
		if got := count(tc.query); got != float64(len(tc.want)) {
			t.Errorf("GET /posts/count%s = %v, want %d", tc.query, got, len(tc.want))
		}
	}

	// Walk each sort a page at a time, building the cursor from the last
	// post like the frontend does.
	for sortName, want := range map[string][]any{
		"newest": {a3, c2, b3, a1},
		"oldest": {a1, b3, c2, a3},
		"most":   {a3, b3, c2, a1},
	} {
		var walked []any
		query := "?limit=1&sort=" + sortName
		for range 10 {
			page := list(query)
			walked = append(walked, idsOf(page)...)
			if len(page) < 1 {
				break
			}
			last := page[0]
			query = fmt.Sprintf("?limit=1&sort=%s&before_created_at=%s&before_id=%v&before_image_count=%v",
				sortName, url.QueryEscape(last["created_at"].(string)), last["id"], last["image_count"])
		}
		if fmt.Sprint(walked) != fmt.Sprint(want) {
			t.Errorf("sort=%s pages = %v, want %v", sortName, walked, want)
		}
	}
}

func TestListPostsBadQuery(t *testing.T) {
	app := newTestApp(t)
	for _, tc := range []struct {
		query, code string
	}{
		{"?sort=popular", "invalid_sort"},
		{"?photos=many", "invalid_photos_filter"},
		{"?user_ids=1,x", "invalid_user_id"},
		{"?user_ids=1,,2", "invalid_user_id"},
		{"?user_ids=-4", "invalid_user_id"},
		{"?sort=most&before_created_at=2026-01-01T00:00:00Z&before_id=5", "invalid_pagination"},
		{"?sort=most&before_created_at=2026-01-01T00:00:00Z&before_id=5&before_image_count=x", "invalid_pagination"},
		{"?limit=0", "invalid_pagination"},
		{"?limit=-3", "invalid_pagination"},
		{"?limit=abc", "invalid_pagination"},
		{"?limit=101", "invalid_pagination"},
		{"?before_id=5", "invalid_pagination"},
		{"?before_created_at=2026-01-01T00:00:00Z", "invalid_pagination"},
		{"?before_created_at=yesterday&before_id=5", "invalid_pagination"},
		{"?before_created_at=2026-01-01T00:00:00Z&before_id=0", "invalid_pagination"},
		{"?user_id=abc", "invalid_user_id"},
		{"?user_id=0", "invalid_user_id"},
	} {
		t.Run(tc.query, func(t *testing.T) {
			expectError(t, app.do(req{method: http.MethodGet, path: "/posts" + tc.query}), http.StatusBadRequest, tc.code)
		})
	}
}

// JSON is gzipped for clients that ask for it; images and bodyless
// responses are left alone.
func TestGzipJSON(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")
	for i := range 3 {
		app.store.MustAddPost(1, fmt.Sprintf("/uploads/%d.jpg", i), strings.Repeat("caption ", 20))
	}

	get := func(path, acceptEncoding string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if acceptEncoding != "" {
			r.Header.Set("Accept-Encoding", acceptEncoding)
		}
		rec := httptest.NewRecorder()
		app.handler.ServeHTTP(rec, r)
		return rec
	}

	plain := get("/posts", "")
	expectStatus(t, plain, http.StatusOK)
	if ce := plain.Header().Get("Content-Encoding"); ce != "" {
		t.Errorf("Content-Encoding %q without Accept-Encoding", ce)
	}
	if !strings.Contains(strings.Join(plain.Header().Values("Vary"), ","), "Accept-Encoding") {
		t.Errorf("Vary = %q, want Accept-Encoding", plain.Header().Values("Vary"))
	}

	for _, ae := range []string{"gzip", "gzip, deflate, br, zstd", "br;q=1.0, gzip;q=0.8", "*"} {
		rec := get("/posts", ae)
		if ce := rec.Header().Get("Content-Encoding"); ce != "gzip" {
			t.Fatalf("Accept-Encoding %q: Content-Encoding = %q, want gzip", ae, ce)
		}
		zr, err := gzip.NewReader(rec.Body)
		if err != nil {
			t.Fatalf("%q: not gzip: %v", ae, err)
		}
		body, err := io.ReadAll(zr)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(body, plain.Body.Bytes()) {
			t.Errorf("%q: decompressed body differs from the plain one", ae)
		}
	}
	if ce := get("/posts", "gzip;q=0, identity").Header().Get("Content-Encoding"); ce != "" {
		t.Errorf("gzip;q=0: Content-Encoding = %q, want none", ce)
	}

	// Errors are JSON too.
	if ce := get("/posts/999", "gzip").Header().Get("Content-Encoding"); ce != "gzip" {
		t.Errorf("404 JSON: Content-Encoding = %q, want gzip", ce)
	}

	// Images are already compressed and must keep Content-Length and ranges.
	rec := app.upload(tok, "pic.png", fixtures.PNG())
	var up struct {
		ImagePath string `json:"image_path"`
	}
	decodeOne(t, rec, &up)
	img := get(up.ImagePath, "gzip")
	expectStatus(t, img, http.StatusOK)
	if ce := img.Header().Get("Content-Encoding"); ce != "" || img.Header().Get("Content-Length") == "" {
		t.Errorf("image: Content-Encoding %q, Content-Length %q; want none and set", ce, img.Header().Get("Content-Length"))
	}

	// 204 has no body to compress.
	r := httptest.NewRequest(http.MethodDelete, "/posts/1", nil)
	r.Header.Set("Authorization", "Bearer "+tok)
	r.Header.Set("Accept-Encoding", "gzip")
	del := httptest.NewRecorder()
	app.handler.ServeHTTP(del, r)
	expectStatus(t, del, http.StatusNoContent)
	if del.Header().Get("Content-Encoding") != "" || del.Body.Len() != 0 {
		t.Errorf("204: Content-Encoding %q, body %d bytes", del.Header().Get("Content-Encoding"), del.Body.Len())
	}
}

// The frontend deployed before multi-image posts sends image_path only; its
// posts get a one-element images array.
func TestCreatePostLegacyBodyHasImages(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	rec := app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{"image_path": "/uploads/a.jpg"}})
	expectStatus(t, rec, http.StatusCreated)
	got := postImages(t, decodePost(t, rec))
	if len(got) != 1 || got[0]["image_path"] != "/uploads/a.jpg" {
		t.Errorf("images = %v", got)
	}
}

func TestCreatePostImageErrors(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")
	images := func(paths ...string) []map[string]any {
		out := []map[string]any{}
		for _, p := range paths {
			out = append(out, map[string]any{"image_path": p})
		}
		return out
	}
	var eleven []string
	for i := range 11 {
		eleven = append(eleven, fmt.Sprintf("/uploads/%d.jpg", i))
	}

	cases := []struct {
		name string
		body map[string]any
		code string
	}{
		{"too many", map[string]any{"images": images(eleven...)}, "too_many_images"},
		{"duplicate", map[string]any{"images": images("/uploads/a.jpg", "/uploads/a.jpg")}, "duplicate_image"},
		{"blank path", map[string]any{"images": images("/uploads/a.jpg", "")}, "create_post_failed"},
		{"foreign thumbnail on image 2", map[string]any{"images": []map[string]any{
			{"image_path": "/uploads/a.jpg"},
			{"image_path": "/uploads/b.jpg", "thumbnail_path": "/uploads/a_w800.jpg"},
		}}, "invalid_thumbnail_path"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			expectError(t, app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: tc.body}), http.StatusBadRequest, tc.code)
		})
	}
	if posts, _ := app.store.Posts().ListPosts(t.Context(), repository.ListPostsParams{}); len(posts) != 0 {
		t.Errorf("a post was created: %v", posts)
	}
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

func TestUploadMakesThumbnailForPosts(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	rec := app.upload(tok, "wide.png", fixtures.EncodePNG(fixtures.Gradient(1600, 1000)))
	expectStatus(t, rec, http.StatusCreated)
	var up struct {
		ImagePath     string `json:"image_path"`
		ThumbnailPath string `json:"thumbnail_path"`
	}
	decodeOne(t, rec, &up)
	if want := strings.TrimSuffix(up.ImagePath, ".png") + "_w800.jpg"; up.ThumbnailPath != want {
		t.Fatalf("thumbnail_path = %q, want %q", up.ThumbnailPath, want)
	}

	// The thumbnail is served like any upload: a JPEG, cacheable forever.
	rec = app.do(req{method: http.MethodGet, path: up.ThumbnailPath})
	expectStatus(t, rec, http.StatusOK)
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("Cache-Control = %q", cc)
	}
	img, err := jpeg.Decode(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatalf("served thumbnail does not decode: %v", err)
	}
	if b := img.Bounds(); b.Dx() != 800 || b.Dy() != 500 {
		t.Errorf("thumbnail is %dx%d, want 800x500", b.Dx(), b.Dy())
	}

	// The post records it, and the feed and detail return it.
	rec = app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{
		"image_path": up.ImagePath, "thumbnail_path": up.ThumbnailPath, "caption": "wide",
	}})
	expectStatus(t, rec, http.StatusCreated)
	created := decodePost(t, rec)
	if created["thumbnail_path"] != up.ThumbnailPath {
		t.Errorf("created post thumbnail_path = %v", created["thumbnail_path"])
	}
	rec = app.do(req{method: http.MethodGet, path: "/posts"})
	var feed []map[string]any
	decodeOne(t, rec, &feed)
	if len(feed) != 1 || feed[0]["thumbnail_path"] != up.ThumbnailPath {
		t.Errorf("feed = %v", feed)
	}

	// The server computes the page tint from the stored thumbnail; it is
	// pale, and the same in the create response, the feed and the detail.
	tint, _ := created["tint"].(string)
	if len(tint) != 7 || tint[0] != '#' || tint < "#c0c0c0" {
		t.Errorf("created post tint = %v, want a pale #rrggbb", created["tint"])
	}
	if feed[0]["tint"] != tint {
		t.Errorf("feed tint = %v, want %s", feed[0]["tint"], tint)
	}
	rec = app.do(req{method: http.MethodGet, path: fmt.Sprintf("/posts/%v", created["id"])})
	if detail := decodePost(t, rec); detail["tint"] != tint {
		t.Errorf("detail tint = %v, want %s", detail["tint"], tint)
	}
}

// A client can't choose a post's tint: the field is ignored, and a post
// whose cover has no thumbnail has no tint.
func TestCreatePostIgnoresClientTint(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")
	rec := app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{
		"image_path": "/uploads/x.jpg", "tint": "#000000",
	}})
	expectStatus(t, rec, http.StatusCreated)
	if p := decodePost(t, rec); p["tint"] != nil {
		t.Errorf("tint = %v, want none (no thumbnail, and the client's value is ignored)", p["tint"])
	}
}

func TestUploadWithoutThumbnailOmitsTheKey(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	rec := app.upload(tok, "anim.webp", fixtures.AnimatedWebP())
	expectStatus(t, rec, http.StatusCreated)
	var up map[string]any
	decodeOne(t, rec, &up)
	if _, ok := up["thumbnail_path"]; ok {
		t.Errorf("thumbnail_path present without a thumbnail: %v", up)
	}

	// A post without one omits the key too, so clients fall back to image_path.
	rec = app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{"image_path": up["image_path"]}})
	expectStatus(t, rec, http.StatusCreated)
	if p := decodePost(t, rec); p["thumbnail_path"] != nil {
		t.Errorf("thumbnail_path = %v, want absent", p["thumbnail_path"])
	}
}

func TestCreatePostRejectsForeignThumbnail(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	for _, thumb := range []string{"/uploads/someone-else_w800.jpg", "/uploads/1730_abc12345.jpg", "https://evil.example/x.jpg"} {
		t.Run(thumb, func(t *testing.T) {
			rec := app.do(req{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{
				"image_path": "/uploads/1730_abc12345.jpg", "thumbnail_path": thumb,
			}})
			expectError(t, rec, http.StatusBadRequest, "invalid_thumbnail_path")
		})
	}
	if posts, _ := app.store.Posts().ListPosts(t.Context(), repository.ListPostsParams{}); len(posts) != 0 {
		t.Errorf("a post was created: %v", posts)
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

	// Sniffs as JPEG, but breaks off before any image data: its metadata can't
	// be stripped safely, so it is refused rather than stored as is.
	expectError(t, app.upload(tok, "cut.jpg", fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", ""))[:40]), http.StatusBadRequest, "invalid_image")

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
// ParseMultipartForm, and metadata stripping reads from that file lazily.
// The image must still be stored intact, minus its metadata.
func TestUploadLargerThanMemoryThreshold(t *testing.T) {
	app := newTestApp(t, appOptions{maxUploadBytes: 32 << 20})
	_, tok := app.userWithToken("alice")

	// ~12 MiB of ICC profile segments, which are kept (64 KiB max each).
	jpeg := fixtures.JPEG()
	data := append([]byte{}, jpeg[:2]...)
	for i := 0; len(data) < 12<<20; i++ {
		payload := append([]byte("ICC_PROFILE\x00"), bytes.Repeat([]byte{byte(i)}, 60000)...)
		data = append(data, 0xFF, 0xE2, byte((len(payload)+2)>>8), byte(len(payload)+2))
		data = append(data, payload...)
	}
	data = append(data, jpeg[2:]...)

	// The upload is the same file with an EXIF segment, which must not be stored.
	exif := append([]byte("Exif\x00\x00"), fixtures.CameraTIFF("SONY", "ILCE-7C", "")...)
	upload := append([]byte{}, data[:2]...)
	upload = append(upload, 0xFF, 0xE1, byte((len(exif)+2)>>8), byte(len(exif)+2))
	upload = append(upload, exif...)
	upload = append(upload, data[2:]...)

	rec := app.upload(tok, "large.jpg", upload)
	expectStatus(t, rec, http.StatusCreated)
	var up struct {
		ImagePath  string `json:"image_path"`
		CameraBody string `json:"camera_body"`
	}
	decodeOne(t, rec, &up)
	if up.CameraBody != "SONY ILCE-7C" {
		t.Errorf("camera_body = %q", up.CameraBody)
	}

	rec = app.do(req{method: http.MethodGet, path: up.ImagePath})
	expectStatus(t, rec, http.StatusOK)
	if !bytes.Equal(rec.Body.Bytes(), data) {
		t.Errorf("served %d bytes, want the %d-byte image without its EXIF segment", rec.Body.Len(), len(data))
	}
}

// The public GET /uploads must never hand out location or other metadata,
// while the upload response still reports the gear it read before stripping.
func TestServedUploadHasNoMetadata(t *testing.T) {
	app := newTestApp(t)
	_, tok := app.userWithToken("alice")

	const gps = "GPS 35.6586N 139.7454E"
	tiff := fixtures.TIFF(binary.LittleEndian,
		map[uint16]any{fixtures.TagMake: "Apple", fixtures.TagModel: "iPhone 15 Pro", fixtures.TagImageDescription: gps, fixtures.TagOrientation: uint16(6)},
		map[uint16]any{fixtures.TagLensModel: "iPhone 15 Pro back camera"},
	)
	for name, data := range map[string][]byte{
		"photo.jpg":  fixtures.JPEGWithEXIF(tiff),
		"photo.png":  fixtures.PNGWithEXIF(tiff),
		"photo.webp": fixtures.WebPWithEXIF(tiff),
	} {
		t.Run(name, func(t *testing.T) {
			rec := app.upload(tok, name, data)
			expectStatus(t, rec, http.StatusCreated)
			var up struct {
				ImagePath  string `json:"image_path"`
				CameraBody string `json:"camera_body"`
				Lens       string `json:"lens"`
			}
			decodeOne(t, rec, &up)
			if up.CameraBody != "Apple iPhone 15 Pro" || up.Lens != "iPhone 15 Pro back camera" {
				t.Errorf("gear = %q / %q", up.CameraBody, up.Lens)
			}

			rec = app.do(req{method: http.MethodGet, path: up.ImagePath})
			expectStatus(t, rec, http.StatusOK)
			served := rec.Body.Bytes()
			for _, s := range []string{gps, "iPhone", "Apple"} {
				if bytes.Contains(served, []byte(s)) {
					t.Errorf("served file still contains %q", s)
				}
			}
			// Orientation is the one value kept, so the photo still displays upright.
			if o := exifmeta.Orientation(bytes.NewReader(served), int64(len(served))); o != 6 {
				t.Errorf("served orientation = %d, want 6", o)
			}
		})
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

	// The setting is private: it comes back with the next login, not from GET /users/{id}.
	u, err := app.store.Users().GetByID(context.Background(), id)
	if err != nil || u.PreferredLanguage != "ja" {
		t.Errorf("preferred_language = %v (%v), want ja", u, err)
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
		{method: http.MethodGet, path: "/users"},
		{method: http.MethodGet, path: "/posts"},
		{method: http.MethodGet, path: "/posts?sort=most&photos=series&user_ids=1,2&limit=5"},
		{method: http.MethodGet, path: "/posts/count"},
		{method: http.MethodGet, path: "/posts/count?user_ids=1&photos=single"},
		{method: http.MethodGet, path: "/posts/1"},
		{method: http.MethodPost, path: "/posts", token: tok, body: map[string]string{"image_path": "/uploads/x.jpg"}},
		{method: http.MethodPost, path: "/posts", token: tok, body: map[string]any{"images": []map[string]string{{"image_path": "/uploads/y.jpg"}, {"image_path": "/uploads/z.jpg"}}}},
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
