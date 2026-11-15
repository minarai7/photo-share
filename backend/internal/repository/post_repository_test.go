package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	"backend/internal/dto"
	"backend/internal/repository"
	"backend/internal/testutil/testdb"

	"github.com/go-jet/jet/v2/qrm"
)

func strPtr(s string) *string { return &s }

// img is a single-image post's Images; thumb is its optional thumbnail.
func img(imagePath string, thumb ...string) []repository.CreatePostImageParams {
	p := repository.CreatePostImageParams{ImagePath: imagePath}
	if len(thumb) > 0 {
		p.ThumbnailPath = strPtr(thumb[0])
	}
	return []repository.CreatePostImageParams{p}
}

// imgs is a post's Images without thumbnails, in order.
func imgs(paths ...string) []repository.CreatePostImageParams {
	out := make([]repository.CreatePostImageParams, len(paths))
	for i, p := range paths {
		out[i] = repository.CreatePostImageParams{ImagePath: p}
	}
	return out
}

func imagePaths(p dto.PostResponse) []string {
	out := []string{}
	for _, i := range p.Images {
		out = append(out, i.ImagePath)
	}
	return out
}

func seedUser(t *testing.T, db *sql.DB, name string) int64 {
	t.Helper()
	u, err := repository.NewUserRepository(db).Create(context.Background(), repository.CreateUserParams{
		Username: name, Email: name + "@example.com", PasswordHash: "h",
	})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

// GetPostByID / ListPosts hydrate dto.PostResponse through column aliases
// ("post_response.xxx"). A wrong alias silently yields zero values, so check
// every field — including username, which comes from the users join.
func TestPostRepository_CreateAndGetHydratesEveryField(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	uid := seedUser(t, db, "alice")

	id, err := repo.CreatePost(ctx, repository.CreatePostParams{
		UserID: uid, Images: img("/uploads/a.jpg"), Caption: "dawn",
		Location: strPtr("Kyoto"), CameraBody: strPtr("X100V"), Lens: strPtr("23mm"),
	})
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}
	if id == 0 {
		t.Fatal("CreatePost returned id 0")
	}

	p, err := repo.GetPostByID(ctx, id)
	if err != nil {
		t.Fatalf("GetPostByID: %v", err)
	}
	if p.ID != id || p.UserID != uid || p.Username != "alice" || p.ImagePath != "/uploads/a.jpg" || p.Caption != "dawn" {
		t.Errorf("scalar fields not hydrated: %+v", p)
	}
	if p.Location == nil || *p.Location != "Kyoto" || p.CameraBody == nil || *p.CameraBody != "X100V" || p.Lens == nil || *p.Lens != "23mm" {
		t.Errorf("optional fields not hydrated: %+v", p)
	}
	if p.CreatedAt.IsZero() || p.UpdatedAt.IsZero() {
		t.Errorf("timestamps not hydrated: created=%v updated=%v", p.CreatedAt, p.UpdatedAt)
	}

	t.Run("nil optionals stay nil", func(t *testing.T) {
		id2, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, Images: img("/uploads/b.jpg")})
		if err != nil {
			t.Fatal(err)
		}
		p2, _ := repo.GetPostByID(ctx, id2)
		if p2.Location != nil || p2.CameraBody != nil || p2.Lens != nil || p2.ThumbnailPath != nil {
			t.Errorf("expected nil optionals, got %+v", p2)
		}
		if p2.Caption != "" {
			t.Errorf("caption default = %q, want empty", p2.Caption)
		}
	})
}

// thumbnail_path goes through the same alias hydration, in both SELECTs.
func TestPostRepository_ThumbnailPathHydration(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	uid := seedUser(t, db, "alice")

	withThumb, err := repo.CreatePost(ctx, repository.CreatePostParams{
		UserID: uid, Images: img("/uploads/a.png", "/uploads/a_w800.jpg"),
	})
	if err != nil {
		t.Fatal(err)
	}
	without, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, Images: img("/uploads/b.png")})
	if err != nil {
		t.Fatal(err)
	}

	check := func(where string, got map[int64]*string) {
		t.Helper()
		if p := got[withThumb]; p == nil || *p != "/uploads/a_w800.jpg" {
			t.Errorf("%s: set thumbnail_path = %v, want /uploads/a_w800.jpg", where, p)
		}
		if p := got[without]; p != nil {
			t.Errorf("%s: NULL thumbnail_path = %q, want nil", where, *p)
		}
	}

	byID := map[int64]*string{}
	for _, id := range []int64{withThumb, without} {
		p, err := repo.GetPostByID(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		byID[id] = p.ThumbnailPath
	}
	check("GetPostByID", byID)

	list, err := repo.ListPosts(ctx, repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	fromList := map[int64]*string{}
	for _, p := range list {
		fromList[p.ID] = p.ThumbnailPath
	}
	check("ListPosts", fromList)
}

func TestPostRepository_ThumbnailBackfillMethods(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()

	empty, err := repo.ListImagesMissingThumbnail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if empty == nil || len(empty) != 0 {
		t.Fatalf("empty = %#v, want non-nil empty slice", empty)
	}

	uid := seedUser(t, db, "alice")
	first, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, Images: imgs("/uploads/1.jpg", "/uploads/1b.jpg")})
	if _, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, Images: img("/uploads/2.jpg", "/uploads/2_w800.jpg")}); err != nil {
		t.Fatal(err)
	}
	last, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, Images: img("/uploads/3.png")})

	missing, err := repo.ListImagesMissingThumbnail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	type row struct {
		PostID   int64
		Position int16
		Path     string
	}
	var got []row
	for _, m := range missing {
		if m.ID == 0 {
			t.Errorf("image id not hydrated: %+v", m)
		}
		got = append(got, row{m.PostID, m.Position, m.ImagePath})
	}
	want := []row{{first, 0, "/uploads/1.jpg"}, {first, 1, "/uploads/1b.jpg"}, {last, 0, "/uploads/3.png"}}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] {
		t.Fatalf("missing = %+v, want %+v (post order, then position)", got, want)
	}
	cover, second := missing[0].ID, missing[1].ID

	before, _ := repo.GetPostByID(ctx, first)

	// A later image: only that image changes, not the post's cover.
	if err := repo.SetImageThumbnailPath(ctx, second, "/uploads/1b_w800.jpg"); err != nil {
		t.Fatalf("SetImageThumbnailPath(second): %v", err)
	}
	p, _ := repo.GetPostByID(ctx, first)
	if p.ThumbnailPath != nil || p.Images[1].ThumbnailPath == nil || *p.Images[1].ThumbnailPath != "/uploads/1b_w800.jpg" {
		t.Errorf("after second: cover=%v images[1]=%v", p.ThumbnailPath, p.Images[1].ThumbnailPath)
	}

	// The cover: the image and the post's cover column both change.
	if err := repo.SetImageThumbnailPath(ctx, cover, "/uploads/1_w800.jpg"); err != nil {
		t.Fatalf("SetImageThumbnailPath(cover): %v", err)
	}
	after, _ := repo.GetPostByID(ctx, first)
	if after.ThumbnailPath == nil || *after.ThumbnailPath != "/uploads/1_w800.jpg" ||
		after.Images[0].ThumbnailPath == nil || *after.Images[0].ThumbnailPath != "/uploads/1_w800.jpg" {
		t.Errorf("cover thumbnail: post=%v image=%v", after.ThumbnailPath, after.Images[0].ThumbnailPath)
	}
	if !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Errorf("updated_at changed (%v -> %v): the backfill is not a user edit", before.UpdatedAt, after.UpdatedAt)
	}
	if missing, _ = repo.ListImagesMissingThumbnail(ctx); len(missing) != 1 || missing[0].PostID != last {
		t.Errorf("after set, missing = %+v, want only post %d", missing, last)
	}

	if err := repo.SetImageThumbnailPath(ctx, 99999, "/uploads/x_w800.jpg"); !errors.Is(err, repository.ErrorPostImageNotFound) {
		t.Errorf("missing image err = %v, want ErrorPostImageNotFound", err)
	}
}

// Images come back in the order they were given, from both reads, and the
// join with post_images must not repeat a post once per image.
func TestPostRepository_MultipleImages(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")

	three := imgs("/uploads/c.jpg", "/uploads/a.jpg", "/uploads/b.jpg")
	three[1].ThumbnailPath = strPtr("/uploads/a_w800.jpg")
	multi, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: three, Caption: "three"})
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}
	single, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/s.jpg")})
	other, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: imgs("/uploads/o1.jpg", "/uploads/o2.jpg")})

	p, err := repo.GetPostByID(ctx, multi)
	if err != nil {
		t.Fatal(err)
	}
	if got := imagePaths(*p); len(got) != 3 || got[0] != "/uploads/c.jpg" || got[1] != "/uploads/a.jpg" || got[2] != "/uploads/b.jpg" {
		t.Errorf("GetPostByID images = %v, want c, a, b", got)
	}
	if p.ImagePath != "/uploads/c.jpg" || p.ThumbnailPath != nil {
		t.Errorf("cover = %q / %v, want the first image", p.ImagePath, p.ThumbnailPath)
	}
	if p.Images[1].ThumbnailPath == nil || *p.Images[1].ThumbnailPath != "/uploads/a_w800.jpg" || p.Images[0].ThumbnailPath != nil {
		t.Errorf("image thumbnails not hydrated: %+v", p.Images)
	}
	if p.Caption != "three" || p.Username != "alice" {
		t.Errorf("post fields: %+v", p)
	}

	list, err := repo.ListPosts(ctx, repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 {
		t.Fatalf("ListPosts returned %d posts, want 3 (one per post, not per image)", len(list))
	}
	byID := map[int64]dto.PostResponse{}
	for _, p := range list {
		byID[p.ID] = p
	}
	// Lists carry the count and the cover, not the images.
	for id, want := range map[int64]int{multi: 3, single: 1, other: 2} {
		if got := byID[id].ImageCount; got != want {
			t.Errorf("post %d image_count = %d in ListPosts, want %d", id, got, want)
		}
		if byID[id].Images != nil {
			t.Errorf("post %d has Images in ListPosts: %v", id, byID[id].Images)
		}
	}
	if byID[multi].ImagePath != "/uploads/c.jpg" {
		t.Errorf("ListPosts cover = %q, want the first image", byID[multi].ImagePath)
	}
}

// Walking the feed page by page with the keyset cursor must visit every post
// once, in feed order, including posts that share a created_at (the cursor
// then falls back to id).
func TestPostRepository_ListPostsPagination(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")
	bob := seedUser(t, db, "bob")

	base := time.Date(2026, 1, 1, 12, 0, 0, 123456000, time.UTC) // µs precision, like the column
	var all []int64
	for i := range 7 {
		owner := alice
		if i%3 == 1 {
			owner = bob
		}
		id, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: owner, Images: img(fmt.Sprintf("/uploads/%d.jpg", i))})
		if err != nil {
			t.Fatal(err)
		}
		// Pairs of posts share a timestamp: 0,0,1,1,2,2,3 hours.
		if _, err := db.Exec(`UPDATE posts SET created_at=$1 WHERE id=$2`, base.Add(time.Duration(i/2)*time.Hour), id); err != nil {
			t.Fatal(err)
		}
		all = append(all, id)
	}

	full, err := repo.ListPosts(ctx, repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	want := ids(full)
	if len(want) != len(all) {
		t.Fatalf("full list has %d posts, want %d", len(want), len(all))
	}

	walk := func(userID *int64, limit int) []int64 {
		t.Helper()
		var got []int64
		var cursor *repository.PostCursor
		var filter repository.PostFilter
		if userID != nil {
			filter.UserIDs = []int64{*userID}
		}
		for range 20 {
			page, err := repo.ListPosts(ctx, repository.ListPostsParams{PostFilter: filter, After: cursor, Limit: limit})
			if err != nil {
				t.Fatal(err)
			}
			if len(page) > limit {
				t.Fatalf("page of %d posts, limit %d", len(page), limit)
			}
			got = append(got, ids(page)...)
			if len(page) < limit {
				return got
			}
			last := page[len(page)-1]
			cursor = &repository.PostCursor{CreatedAt: last.CreatedAt, ID: last.ID}
		}
		t.Fatal("pagination did not end")
		return nil
	}

	for _, limit := range []int{1, 2, 3, 7, 50} {
		if got := walk(nil, limit); !slices.Equal(got, want) {
			t.Errorf("limit %d: pages = %v, want %v", limit, got, want)
		}
	}

	var bobs []int64
	for _, p := range full {
		if p.UserID == bob {
			bobs = append(bobs, p.ID)
		}
	}
	if got := walk(&bob, 1); !slices.Equal(got, bobs) {
		t.Errorf("bob's pages = %v, want %v", got, bobs)
	}
	if got, _ := repo.ListPosts(ctx, repository.ListPostsParams{PostFilter: repository.PostFilter{UserIDs: []int64{99999}}}); got == nil || len(got) != 0 {
		t.Errorf("unknown user = %#v, want non-nil empty slice", got)
	}
}

// Every sort, with and without filters, pages through its posts with its
// keyset cursor without skipping or repeating one, in the same order as the
// unpaged list. The posts share timestamps and image counts, so each
// cursor's tie-breakers are exercised.
func TestPostRepository_EverySortPagesWithoutGapsOrRepeats(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")
	bob := seedUser(t, db, "bob")
	carol := seedUser(t, db, "carol")
	owners := []int64{alice, bob, carol}

	base := time.Date(2026, 3, 1, 9, 0, 0, 654321000, time.UTC)
	type post struct {
		id     int64
		owner  int64
		at     time.Time
		images int
	}
	var all []post
	for i := range 13 {
		images := []int{1, 3, 2, 1, 3}[i%5]
		paths := make([]string, images)
		for j := range paths {
			paths[j] = fmt.Sprintf("/uploads/%d_%d.jpg", i, j)
		}
		owner := owners[i%3]
		id, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: owner, Images: imgs(paths...)})
		if err != nil {
			t.Fatal(err)
		}
		at := base.Add(time.Duration(i/3) * time.Hour) // triples share a timestamp
		if _, err := db.Exec(`UPDATE posts SET created_at=$1 WHERE id=$2`, at, id); err != nil {
			t.Fatal(err)
		}
		all = append(all, post{id, owner, at, images})
	}

	// want sorts the expected posts in Go, independently of the SQL.
	want := func(sortBy repository.PostSort, keep func(post) bool) []int64 {
		var out []post
		for _, p := range all {
			if keep(p) {
				out = append(out, p)
			}
		}
		newer := func(a, b post) bool {
			if !a.at.Equal(b.at) {
				return a.at.After(b.at)
			}
			return a.id > b.id
		}
		slices.SortFunc(out, func(a, b post) int {
			var first bool
			switch sortBy {
			case repository.SortOldest:
				first = newer(b, a)
			case repository.SortMost:
				first = a.images > b.images || (a.images == b.images && newer(a, b))
			default:
				first = newer(a, b)
			}
			if first {
				return -1
			}
			return 1
		})
		ids := make([]int64, len(out))
		for i, p := range out {
			ids[i] = p.id
		}
		return ids
	}

	filters := map[string]struct {
		filter repository.PostFilter
		keep   func(post) bool
	}{
		"all":            {repository.PostFilter{}, func(post) bool { return true }},
		"alice and bob":  {repository.PostFilter{UserIDs: []int64{alice, bob}}, func(p post) bool { return p.owner != carol }},
		"single":         {repository.PostFilter{Photos: repository.PhotosSingle}, func(p post) bool { return p.images == 1 }},
		"series":         {repository.PostFilter{Photos: repository.PhotosSeries}, func(p post) bool { return p.images >= 2 }},
		"carol's series": {repository.PostFilter{UserIDs: []int64{carol}, Photos: repository.PhotosSeries}, func(p post) bool { return p.owner == carol && p.images >= 2 }},
	}

	for _, sortBy := range []repository.PostSort{repository.SortNewest, repository.SortOldest, repository.SortMost} {
		for name, f := range filters {
			expected := want(sortBy, f.keep)

			full, err := repo.ListPosts(ctx, repository.ListPostsParams{PostFilter: f.filter, Sort: sortBy})
			if err != nil {
				t.Fatal(err)
			}
			if got := ids(full); !slices.Equal(got, expected) {
				t.Errorf("%s / %s: unpaged = %v, want %v", sortBy, name, got, expected)
			}
			n, err := repo.CountPosts(ctx, f.filter)
			if err != nil {
				t.Fatal(err)
			}
			if n != len(expected) {
				t.Errorf("%s: CountPosts = %d, want %d", name, n, len(expected))
			}

			for _, limit := range []int{1, 2, 4} {
				var got []int64
				var cursor *repository.PostCursor
				for range 30 {
					page, err := repo.ListPosts(ctx, repository.ListPostsParams{PostFilter: f.filter, Sort: sortBy, After: cursor, Limit: limit})
					if err != nil {
						t.Fatal(err)
					}
					got = append(got, ids(page)...)
					if len(page) < limit {
						break
					}
					last := page[len(page)-1]
					cursor = &repository.PostCursor{CreatedAt: last.CreatedAt, ID: last.ID, ImageCount: last.ImageCount}
				}
				if !slices.Equal(got, expected) {
					t.Errorf("%s / %s / limit %d: pages = %v, want %v", sortBy, name, limit, got, expected)
				}
			}
		}
	}
}

func TestPostRepository_UserWorkAndAuthors(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	users := repository.NewUserRepository(db)
	ctx := context.Background()

	if authors, err := users.ListAuthors(ctx); err != nil || authors == nil || len(authors) != 0 {
		t.Fatalf("no posts: authors = %#v, %v; want a non-nil empty slice", authors, err)
	}

	zoe := seedUser(t, db, "zoe")
	amy := seedUser(t, db, "amy")
	seedUser(t, db, "lurker")
	for _, p := range []repository.CreatePostParams{
		{UserID: zoe, Images: img("/uploads/z1.jpg")},
		{UserID: zoe, Images: imgs("/uploads/z2.jpg", "/uploads/z3.jpg", "/uploads/z4.jpg")},
		{UserID: amy, Images: imgs("/uploads/a1.jpg", "/uploads/a2.jpg")},
	} {
		if _, err := repo.CreatePost(ctx, p); err != nil {
			t.Fatal(err)
		}
	}

	for id, want := range map[int64]dto.UserWork{zoe: {PostCount: 2, PhotoCount: 4}, amy: {PostCount: 1, PhotoCount: 2}, 99999: {}} {
		got, err := repo.UserWork(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("UserWork(%d) = %+v, want %+v", id, got, want)
		}
	}

	authors, err := users.ListAuthors(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := []dto.Author{{ID: amy, Username: "amy", PostCount: 1}, {ID: zoe, Username: "zoe", PostCount: 2}}
	if !slices.Equal(authors, want) {
		t.Errorf("authors = %+v, want %+v (by username, without the user who never posted)", authors, want)
	}
}

// image_count is stored on create, and tint is stored, hydrated by both
// reads and refused by the database unless it is a lowercase #rrggbb.
func TestPostRepository_ImageCountAndTint(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")

	tinted, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: imgs("/uploads/a.jpg", "/uploads/b.jpg"), Tint: strPtr("#eeddcc")})
	if err != nil {
		t.Fatal(err)
	}
	plain, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/c.jpg")})
	if err != nil {
		t.Fatal(err)
	}

	var stored int
	if err := db.QueryRow(`SELECT image_count FROM posts WHERE id=$1`, tinted).Scan(&stored); err != nil || stored != 2 {
		t.Errorf("stored image_count = %d (%v), want 2", stored, err)
	}
	p, _ := repo.GetPostByID(ctx, tinted)
	if p.Tint == nil || *p.Tint != "#eeddcc" {
		t.Errorf("GetPostByID tint = %v", p.Tint)
	}
	list, _ := repo.ListPosts(ctx, repository.ListPostsParams{})
	byID := map[int64]dto.PostResponse{}
	for _, p := range list {
		byID[p.ID] = p
	}
	if tp := byID[tinted].Tint; tp == nil || *tp != "#eeddcc" {
		t.Errorf("ListPosts tint = %v", tp)
	}
	if byID[plain].Tint != nil {
		t.Errorf("untinted post has tint %q", *byID[plain].Tint)
	}

	for _, bad := range []string{"#EEDDCC", "red", "#abc", "#eeddcc; DROP"} {
		if _, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/bad.jpg"), Tint: strPtr(bad)}); err == nil {
			t.Errorf("tint %q accepted by the database", bad)
		}
	}
}

func TestPostRepository_TintBackfillMethods(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")

	first, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/1.jpg", "/uploads/1_w800.jpg")})
	_, _ = repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/2.jpg"), Tint: strPtr("#ffffff")})
	third, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/3.png")})

	missing, err := repo.ListPostsMissingTint(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(missing) != 2 || missing[0].ID != first || missing[1].ID != third {
		t.Fatalf("missing = %+v, want posts %d and %d", missing, first, third)
	}
	if missing[0].ImagePath != "/uploads/1.jpg" || missing[0].ThumbnailPath == nil || *missing[0].ThumbnailPath != "/uploads/1_w800.jpg" || missing[1].ThumbnailPath != nil {
		t.Errorf("missing not hydrated: %+v / %+v", missing[0], missing[1])
	}

	before, _ := repo.GetPostByID(ctx, first)
	if err := repo.SetPostTint(ctx, first, "#e0e8f0"); err != nil {
		t.Fatal(err)
	}
	after, _ := repo.GetPostByID(ctx, first)
	if after.Tint == nil || *after.Tint != "#e0e8f0" {
		t.Errorf("tint = %v", after.Tint)
	}
	if !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Error("SetPostTint bumped updated_at: the backfill is not a user edit")
	}
	if missing, _ = repo.ListPostsMissingTint(ctx); len(missing) != 1 || missing[0].ID != third {
		t.Errorf("after set, missing = %+v", missing)
	}
	if err := repo.SetPostTint(ctx, 99999, "#ffffff"); !errors.Is(err, repository.ErrorPostNotFound) {
		t.Errorf("missing post: %v, want ErrorPostNotFound", err)
	}
}

// The migration counts each existing post's images; a post without image
// rows (from before post_images) counts as 1.
func TestImageCountMigrationBackfill(t *testing.T) {
	const before = "20261115000000" // the last migration before image_count
	db := testdb.Open(t)
	t.Cleanup(func() {
		if err := testdb.ResetSchema(db); err != nil {
			t.Errorf("reset: %v", err)
		}
		if err := testdb.MigrateUp(db); err != nil {
			t.Errorf("re-migrate: %v", err)
		}
	})
	if err := testdb.ResetSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := testdb.MigrateUpTo(db, before); err != nil {
		t.Fatalf("up to %s: %v", before, err)
	}
	alice := seedUser(t, db, "alice")
	var three, legacy int64
	if err := db.QueryRow(`INSERT INTO posts (user_id, image_path) VALUES ($1, '/uploads/a.jpg') RETURNING id`, alice).Scan(&three); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO post_images (post_id, position, image_path) VALUES ($1, 0, '/uploads/a.jpg'), ($1, 1, '/uploads/b.jpg'), ($1, 2, '/uploads/c.jpg')`, three); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`INSERT INTO posts (user_id, image_path) VALUES ($1, '/uploads/l.jpg') RETURNING id`, alice).Scan(&legacy); err != nil {
		t.Fatal(err)
	}
	if err := testdb.MigrateUpAfter(db, before); err != nil {
		t.Fatalf("up after %s: %v", before, err)
	}
	for id, want := range map[int64]int{three: 3, legacy: 1} {
		var got int
		if err := db.QueryRow(`SELECT image_count FROM posts WHERE id=$1`, id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("post %d image_count = %d, want %d", id, got, want)
		}
	}
}

func TestPostListIndexesExist(t *testing.T) {
	db := testdb.Open(t)
	for _, name := range []string{"posts_created_at_id_idx", "posts_user_id_created_at_id_idx", "posts_image_count_created_at_id_idx"} {
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, name).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("index %s missing", name)
		}
	}
}

func ids(posts []dto.PostResponse) []int64 {
	out := make([]int64, len(posts))
	for i, p := range posts {
		out[i] = p.ID
	}
	return out
}

func TestPostRepository_CreateNeedsImagesAndIsAtomic(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")

	if _, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice}); !errors.Is(err, repository.ErrorNoImages) {
		t.Errorf("no images err = %v, want ErrorNoImages", err)
	}

	// Make the image insert fail after the post insert succeeded: the post
	// must be rolled back with it.
	if _, err := db.Exec(`ALTER TABLE post_images ADD CONSTRAINT test_no_bad CHECK (image_path <> '/uploads/bad.jpg')`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`ALTER TABLE post_images DROP CONSTRAINT IF EXISTS test_no_bad`) })

	if _, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: imgs("/uploads/ok.jpg", "/uploads/bad.jpg")}); err == nil {
		t.Fatal("CreatePost succeeded despite the failing image insert")
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM posts`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("%d posts left after a failed create, want 0 (no rollback)", n)
	}
}

// A post written by a backend from before post_images (no image rows) is
// still readable; the service then uses its cover as its only image.
func TestPostRepository_PostWithoutImageRows(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")

	var id int64
	if err := db.QueryRow(`INSERT INTO posts (user_id, image_path) VALUES ($1, '/uploads/legacy.jpg') RETURNING id`, alice).Scan(&id); err != nil {
		t.Fatal(err)
	}
	p, err := repo.GetPostByID(ctx, id)
	if err != nil {
		t.Fatalf("GetPostByID: %v", err)
	}
	if p.ImagePath != "/uploads/legacy.jpg" || len(p.Images) != 0 {
		t.Errorf("legacy post = cover %q, images %+v; want the cover and no images", p.ImagePath, p.Images)
	}
	list, err := repo.ListPosts(ctx, repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ImageCount != 1 || list[0].ImagePath != "/uploads/legacy.jpg" {
		t.Errorf("ListPosts = %+v, want the post with image_count 1 (the column's default)", list)
	}
}

// The migration gives every post that existed before it one image row: its cover.
func TestPostImagesMigrationBackfill(t *testing.T) {
	const before = "20261112000000" // the last migration before post_images
	db := testdb.Open(t)
	// Other tests share this database: leave it fully migrated.
	t.Cleanup(func() {
		if err := testdb.ResetSchema(db); err != nil {
			t.Errorf("reset: %v", err)
		}
		if err := testdb.MigrateUp(db); err != nil {
			t.Errorf("re-migrate: %v", err)
		}
	})

	if err := testdb.ResetSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := testdb.MigrateUpTo(db, before); err != nil {
		t.Fatalf("up to %s: %v", before, err)
	}
	alice := seedUser(t, db, "alice")
	if _, err := db.Exec(`INSERT INTO posts (user_id, image_path, thumbnail_path) VALUES ($1, '/uploads/a.png', '/uploads/a_w800.jpg'), ($1, '/uploads/b.jpg', NULL)`, alice); err != nil {
		t.Fatal(err)
	}
	if err := testdb.MigrateUpAfter(db, before); err != nil {
		t.Fatalf("up after %s: %v", before, err)
	}

	p := repository.NewPostRepository(db)
	list, err := p.ListPosts(context.Background(), repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("%d posts, want 2", len(list))
	}
	for _, summary := range list {
		if summary.ImageCount != 1 {
			t.Errorf("post %d image_count = %d, want 1", summary.ID, summary.ImageCount)
		}
		post, err := p.GetPostByID(context.Background(), summary.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(post.Images) != 1 || post.Images[0].ImagePath != post.ImagePath {
			t.Errorf("post %d images = %+v, want just its cover %q", post.ID, post.Images, post.ImagePath)
		}
		if (post.ThumbnailPath == nil) != (post.Images[0].ThumbnailPath == nil) {
			t.Errorf("post %d thumbnail not copied: %v vs %v", post.ID, post.ThumbnailPath, post.Images[0].ThumbnailPath)
		}
	}
}

func TestPostRepository_GetMissingIsErrNoRows(t *testing.T) {
	db := testdb.Open(t)
	_, err := repository.NewPostRepository(db).GetPostByID(context.Background(), 99999)
	if !errors.Is(err, qrm.ErrNoRows) {
		t.Fatalf("err = %v, want qrm.ErrNoRows (services map this to ErrPostNotFound)", err)
	}
}

func TestPostRepository_CreateForMissingUserFails(t *testing.T) {
	db := testdb.Open(t)
	_, err := repository.NewPostRepository(db).CreatePost(context.Background(), repository.CreatePostParams{UserID: 99999, Images: img("/uploads/x.jpg")})
	if err == nil {
		t.Fatal("foreign key not enforced")
	}
}

func TestPostRepository_ListOrderAndJoin(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()

	empty, err := repo.ListPosts(ctx, repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if empty == nil || len(empty) != 0 {
		t.Fatalf("empty list = %#v, want non-nil empty slice (JSON [] not null)", empty)
	}

	alice := seedUser(t, db, "alice")
	bob := seedUser(t, db, "bob")
	old, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/1.jpg")})
	tieLow, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: bob, Images: img("/uploads/2.jpg")})
	tieHigh, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/3.jpg")})

	// Pin timestamps so ordering is deterministic: created_at DESC, then id DESC.
	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for id, ts := range map[int64]time.Time{old: base, tieLow: base.Add(time.Hour), tieHigh: base.Add(time.Hour)} {
		if _, err := db.Exec(`UPDATE posts SET created_at=$1 WHERE id=$2`, ts, id); err != nil {
			t.Fatal(err)
		}
	}

	posts, err := repo.ListPosts(ctx, repository.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	got := []int64{}
	for _, p := range posts {
		got = append(got, p.ID)
	}
	want := []int64{tieHigh, tieLow, old}
	if len(got) != 3 || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] {
		t.Fatalf("order = %v, want %v", got, want)
	}
	if posts[1].Username != "bob" || posts[0].Username != "alice" {
		t.Errorf("usernames from join: %q, %q", posts[0].Username, posts[1].Username)
	}
}

func TestPostRepository_Update(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")
	bob := seedUser(t, db, "bob")
	id, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/a.jpg"), Caption: "v1", Location: strPtr("Kyoto")})
	before, _ := repo.GetPostByID(ctx, id)

	if err := repo.UpdatePost(ctx, repository.UpdatePostParams{ID: id, UserID: alice, Caption: "v2", Lens: strPtr("50mm")}); err != nil {
		t.Fatalf("UpdatePost: %v", err)
	}
	after, _ := repo.GetPostByID(ctx, id)
	if after.Caption != "v2" || after.Lens == nil || *after.Lens != "50mm" {
		t.Errorf("not updated: %+v", after)
	}
	if after.Location != nil {
		t.Errorf("location should be cleared (full replace), got %q", *after.Location)
	}
	if !after.UpdatedAt.After(before.UpdatedAt) {
		t.Errorf("updated_at not bumped: before %v after %v", before.UpdatedAt, after.UpdatedAt)
	}
	if !after.CreatedAt.Equal(before.CreatedAt) || after.ImagePath != before.ImagePath {
		t.Error("update touched created_at or image_path")
	}

	// memstore and services rely on ErrorPostNotFound for 0 affected rows.
	if err := repo.UpdatePost(ctx, repository.UpdatePostParams{ID: id, UserID: bob, Caption: "hijack"}); !errors.Is(err, repository.ErrorPostNotFound) {
		t.Errorf("wrong owner err = %v, want ErrorPostNotFound", err)
	}
	if err := repo.UpdatePost(ctx, repository.UpdatePostParams{ID: 99999, UserID: alice}); !errors.Is(err, repository.ErrorPostNotFound) {
		t.Errorf("missing post err = %v, want ErrorPostNotFound", err)
	}
}

func TestPostRepository_DeleteAndCascade(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()
	alice := seedUser(t, db, "alice")
	id, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: imgs("/uploads/a.jpg", "/uploads/a2.jpg")})

	if err := repo.DeletePostByID(ctx, id); err != nil {
		t.Fatalf("DeletePostByID: %v", err)
	}
	var left int
	if err := db.QueryRow(`SELECT count(*) FROM post_images WHERE post_id=$1`, id).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("%d image rows left after deleting the post", left)
	}
	if _, err := repo.GetPostByID(ctx, id); !errors.Is(err, qrm.ErrNoRows) {
		t.Errorf("post still readable after delete: %v", err)
	}
	if err := repo.DeletePostByID(ctx, id); !errors.Is(err, repository.ErrorPostNotFound) {
		t.Errorf("second delete err = %v, want ErrorPostNotFound", err)
	}

	id2, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, Images: img("/uploads/b.jpg")})
	if _, err := db.Exec(`DELETE FROM users WHERE id=$1`, alice); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.GetPostByID(ctx, id2); !errors.Is(err, qrm.ErrNoRows) {
		t.Errorf("posts not cascaded on user delete: %v", err)
	}
}
