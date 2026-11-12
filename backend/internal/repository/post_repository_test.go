package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"backend/internal/repository"
	"backend/internal/testutil/testdb"

	"github.com/go-jet/jet/v2/qrm"
)

func strPtr(s string) *string { return &s }

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
		UserID: uid, ImagePath: "/uploads/a.jpg", Caption: "dawn",
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
		id2, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, ImagePath: "/uploads/b.jpg"})
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
		UserID: uid, ImagePath: "/uploads/a.png", ThumbnailPath: strPtr("/uploads/a_w800.jpg"),
	})
	if err != nil {
		t.Fatal(err)
	}
	without, err := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, ImagePath: "/uploads/b.png"})
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

	list, err := repo.ListPosts(ctx)
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

	empty, err := repo.ListPostsMissingThumbnail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if empty == nil || len(empty) != 0 {
		t.Fatalf("empty = %#v, want non-nil empty slice", empty)
	}

	uid := seedUser(t, db, "alice")
	first, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, ImagePath: "/uploads/1.jpg"})
	done, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, ImagePath: "/uploads/2.jpg", ThumbnailPath: strPtr("/uploads/2_w800.jpg")})
	last, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: uid, ImagePath: "/uploads/3.png"})

	missing, err := repo.ListPostsMissingThumbnail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(missing) != 2 || missing[0] != (repository.PostImage{ID: first, ImagePath: "/uploads/1.jpg"}) ||
		missing[1] != (repository.PostImage{ID: last, ImagePath: "/uploads/3.png"}) {
		t.Fatalf("missing = %+v, want posts %d and %d (not %d), oldest first", missing, first, last, done)
	}

	before, _ := repo.GetPostByID(ctx, first)
	if err := repo.SetThumbnailPath(ctx, first, "/uploads/1_w800.jpg"); err != nil {
		t.Fatalf("SetThumbnailPath: %v", err)
	}
	after, _ := repo.GetPostByID(ctx, first)
	if after.ThumbnailPath == nil || *after.ThumbnailPath != "/uploads/1_w800.jpg" {
		t.Errorf("thumbnail_path = %v", after.ThumbnailPath)
	}
	if !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Errorf("updated_at changed (%v -> %v): the backfill is not a user edit", before.UpdatedAt, after.UpdatedAt)
	}
	if missing, _ = repo.ListPostsMissingThumbnail(ctx); len(missing) != 1 || missing[0].ID != last {
		t.Errorf("after set, missing = %+v, want only %d", missing, last)
	}

	if err := repo.SetThumbnailPath(ctx, 99999, "/uploads/x_w800.jpg"); !errors.Is(err, repository.ErrorPostNotFound) {
		t.Errorf("missing post err = %v, want ErrorPostNotFound", err)
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
	_, err := repository.NewPostRepository(db).CreatePost(context.Background(), repository.CreatePostParams{UserID: 99999, ImagePath: "/uploads/x.jpg"})
	if err == nil {
		t.Fatal("foreign key not enforced")
	}
}

func TestPostRepository_ListOrderAndJoin(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewPostRepository(db)
	ctx := context.Background()

	empty, err := repo.ListPosts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if empty == nil || len(empty) != 0 {
		t.Fatalf("empty list = %#v, want non-nil empty slice (JSON [] not null)", empty)
	}

	alice := seedUser(t, db, "alice")
	bob := seedUser(t, db, "bob")
	old, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, ImagePath: "/uploads/1.jpg"})
	tieLow, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: bob, ImagePath: "/uploads/2.jpg"})
	tieHigh, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, ImagePath: "/uploads/3.jpg"})

	// Pin timestamps so ordering is deterministic: created_at DESC, then id DESC.
	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for id, ts := range map[int64]time.Time{old: base, tieLow: base.Add(time.Hour), tieHigh: base.Add(time.Hour)} {
		if _, err := db.Exec(`UPDATE posts SET created_at=$1 WHERE id=$2`, ts, id); err != nil {
			t.Fatal(err)
		}
	}

	posts, err := repo.ListPosts(ctx)
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
	id, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, ImagePath: "/uploads/a.jpg", Caption: "v1", Location: strPtr("Kyoto")})
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
	id, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, ImagePath: "/uploads/a.jpg"})

	if err := repo.DeletePostByID(ctx, id); err != nil {
		t.Fatalf("DeletePostByID: %v", err)
	}
	if _, err := repo.GetPostByID(ctx, id); !errors.Is(err, qrm.ErrNoRows) {
		t.Errorf("post still readable after delete: %v", err)
	}
	if err := repo.DeletePostByID(ctx, id); !errors.Is(err, repository.ErrorPostNotFound) {
		t.Errorf("second delete err = %v, want ErrorPostNotFound", err)
	}

	id2, _ := repo.CreatePost(ctx, repository.CreatePostParams{UserID: alice, ImagePath: "/uploads/b.jpg"})
	if _, err := db.Exec(`DELETE FROM users WHERE id=$1`, alice); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.GetPostByID(ctx, id2); !errors.Is(err, qrm.ErrNoRows) {
		t.Errorf("posts not cascaded on user delete: %v", err)
	}
}
