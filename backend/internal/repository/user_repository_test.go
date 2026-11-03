package repository_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"backend/internal/repository"
	"backend/internal/testutil/testdb"
)

func TestUserRepository(t *testing.T) {
	db := testdb.Open(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	created, err := repo.Create(ctx, repository.CreateUserParams{Username: "alice", Email: "alice@example.com", PasswordHash: "hash"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == 0 || created.Username != "alice" || created.Email != "alice@example.com" || created.PasswordHash != "hash" {
		t.Errorf("Create returned %+v", created)
	}
	if created.PreferredLanguage != "en" {
		t.Errorf("default preferred_language = %q, want en", created.PreferredLanguage)
	}
	if time.Since(created.CreatedAt) > time.Minute || created.CreatedAt.IsZero() {
		t.Errorf("created_at = %v", created.CreatedAt)
	}

	t.Run("lookups find the user", func(t *testing.T) {
		byID, err := repo.GetByID(ctx, created.ID)
		if err != nil || byID == nil || byID.Email != "alice@example.com" {
			t.Errorf("GetByID = %+v, %v", byID, err)
		}
		byEmail, err := repo.GetByEmail(ctx, "alice@example.com")
		if err != nil || byEmail == nil || byEmail.ID != created.ID {
			t.Errorf("GetByEmail = %+v, %v", byEmail, err)
		}
		byName, err := repo.GetByUsername(ctx, "alice")
		if err != nil || byName == nil || byName.ID != created.ID {
			t.Errorf("GetByUsername = %+v, %v", byName, err)
		}
	})

	// memstore and the services rely on (nil, nil) for "not found".
	t.Run("missing user is (nil, nil)", func(t *testing.T) {
		if u, err := repo.GetByID(ctx, 99999); u != nil || err != nil {
			t.Errorf("GetByID = (%+v, %v), want (nil, nil)", u, err)
		}
		if u, err := repo.GetByEmail(ctx, "ghost@example.com"); u != nil || err != nil {
			t.Errorf("GetByEmail = (%+v, %v), want (nil, nil)", u, err)
		}
		if u, err := repo.GetByUsername(ctx, "ghost"); u != nil || err != nil {
			t.Errorf("GetByUsername = (%+v, %v), want (nil, nil)", u, err)
		}
	})

	t.Run("unique constraints", func(t *testing.T) {
		if _, err := repo.Create(ctx, repository.CreateUserParams{Username: "other", Email: "alice@example.com", PasswordHash: "h"}); err == nil {
			t.Error("duplicate email accepted")
		}
		if _, err := repo.Create(ctx, repository.CreateUserParams{Username: "alice", Email: "other@example.com", PasswordHash: "h"}); err == nil {
			t.Error("duplicate username accepted")
		}
	})

	t.Run("UpdatePreferredLanguage", func(t *testing.T) {
		if err := repo.UpdatePreferredLanguage(ctx, created.ID, "ja"); err != nil {
			t.Fatal(err)
		}
		u, _ := repo.GetByID(ctx, created.ID)
		if u.PreferredLanguage != "ja" {
			t.Errorf("preferred_language = %q", u.PreferredLanguage)
		}
		if err := repo.UpdatePreferredLanguage(ctx, created.ID, "fr"); err == nil {
			t.Error("check constraint did not reject 'fr'")
		}
		if err := repo.UpdatePreferredLanguage(ctx, 99999, "ja"); !errors.Is(err, repository.ErrorUserNotFound) {
			t.Errorf("missing user err = %v, want ErrorUserNotFound", err)
		}
	})
}
