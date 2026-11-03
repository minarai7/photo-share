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
		if p2.Location != nil || p2.CameraBody != nil || p2.Lens != nil {
			t.Errorf("expected nil optionals, got %+v", p2)
		}
		if p2.Caption != "" {
			t.Errorf("caption default = %q, want empty", p2.Caption)
		}
	})
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
