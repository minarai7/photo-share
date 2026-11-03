package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"backend/internal/dto"
	"backend/internal/service"
	"backend/internal/testutil/memstore"
)

func strPtr(s string) *string { return &s }

func newPosts(t *testing.T) (*service.PostService, *memstore.Store) {
	t.Helper()
	store := memstore.New()
	return service.NewPostService(store.Posts()), store
}

func TestCreatePost_ReturnsHydratedPost(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	post, err := svc.CreatePost(context.Background(), service.CreatePostParams{
		UserID:     alice.ID,
		ImagePath:  "/uploads/a.jpg",
		Caption:    "sunset",
		Location:   strPtr("Kyoto"),
		CameraBody: strPtr("X100V"),
	})
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}
	if post.ID == 0 || post.UserID != alice.ID || post.Username != "alice" {
		t.Errorf("unexpected post identity: %+v", post)
	}
	if post.Caption != "sunset" || *post.Location != "Kyoto" || *post.CameraBody != "X100V" || post.Lens != nil {
		t.Errorf("fields not round-tripped: %+v", post)
	}
}

func TestCreatePost_Validation(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	_, err := svc.CreatePost(context.Background(), service.CreatePostParams{UserID: 0, ImagePath: "/uploads/a.jpg"})
	if !errors.Is(err, service.ErrUserRequired) {
		t.Errorf("missing user: got %v", err)
	}
	_, err = svc.CreatePost(context.Background(), service.CreatePostParams{UserID: alice.ID, ImagePath: "   "})
	if !errors.Is(err, service.ErrImagePathRequired) {
		t.Errorf("blank image path: got %v", err)
	}
}

func TestGetPostByID_NotFound(t *testing.T) {
	svc, _ := newPosts(t)
	_, err := svc.GetPostByID(context.Background(), 404)
	if !errors.Is(err, service.ErrPostNotFound) {
		t.Fatalf("got %v, want ErrPostNotFound", err)
	}
}

func TestListPosts_NewestFirst(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	store.Now = func() time.Time { return base }
	older := store.MustAddPost(alice.ID, "/uploads/1.jpg", "older")
	store.Now = func() time.Time { return base.Add(time.Hour) }
	newer := store.MustAddPost(alice.ID, "/uploads/2.jpg", "newer")

	posts, err := svc.ListPosts(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 2 || posts[0].ID != newer || posts[1].ID != older {
		t.Fatalf("order = %v, want [%d %d]", ids(posts), newer, older)
	}
}

func TestUpdatePost_Ownership(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	mallory := store.MustAddUser("mallory", "mallory@example.com")
	postID := store.MustAddPost(alice.ID, "/uploads/a.jpg", "original")

	t.Run("non-owner is forbidden and the post is unchanged", func(t *testing.T) {
		_, err := svc.UpdatePost(context.Background(), service.UpdatePostParams{PostID: postID, UserID: mallory.ID, Caption: "pwned"})
		if !errors.Is(err, service.ErrForbidden) {
			t.Fatalf("got %v, want ErrForbidden", err)
		}
		p, _ := svc.GetPostByID(context.Background(), postID)
		if p.Caption != "original" {
			t.Errorf("caption changed to %q", p.Caption)
		}
	})

	t.Run("owner can update and gets the fresh row", func(t *testing.T) {
		got, err := svc.UpdatePost(context.Background(), service.UpdatePostParams{PostID: postID, UserID: alice.ID, Caption: "edited", Lens: strPtr("35mm")})
		if err != nil {
			t.Fatal(err)
		}
		if got.Caption != "edited" || got.Lens == nil || *got.Lens != "35mm" {
			t.Errorf("returned stale post: %+v", got)
		}
	})

	t.Run("missing post is not found", func(t *testing.T) {
		_, err := svc.UpdatePost(context.Background(), service.UpdatePostParams{PostID: 999, UserID: alice.ID})
		if !errors.Is(err, service.ErrPostNotFound) {
			t.Fatalf("got %v, want ErrPostNotFound", err)
		}
	})
}

func TestDeletePost_Ownership(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	mallory := store.MustAddUser("mallory", "mallory@example.com")
	postID := store.MustAddPost(alice.ID, "/uploads/a.jpg", "mine")

	if err := svc.DeletePost(context.Background(), service.DeletePostParams{PostID: postID, UserID: mallory.ID}); !errors.Is(err, service.ErrForbidden) {
		t.Fatalf("non-owner delete: got %v, want ErrForbidden", err)
	}
	if _, err := svc.GetPostByID(context.Background(), postID); err != nil {
		t.Fatalf("post vanished after forbidden delete: %v", err)
	}

	if err := svc.DeletePost(context.Background(), service.DeletePostParams{PostID: postID, UserID: alice.ID}); err != nil {
		t.Fatalf("owner delete: %v", err)
	}
	if _, err := svc.GetPostByID(context.Background(), postID); !errors.Is(err, service.ErrPostNotFound) {
		t.Fatalf("post still exists after delete: %v", err)
	}

	if err := svc.DeletePost(context.Background(), service.DeletePostParams{PostID: postID, UserID: alice.ID}); !errors.Is(err, service.ErrPostNotFound) {
		t.Fatalf("second delete: got %v, want ErrPostNotFound", err)
	}
}

func ids(posts []dto.PostResponse) []int64 {
	out := make([]int64, len(posts))
	for i, p := range posts {
		out[i] = p.ID
	}
	return out
}
