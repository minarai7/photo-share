package service_test

import (
	"context"
	"errors"
	"testing"

	"backend/internal/service"
	"backend/internal/testutil/memstore"
)

func TestUpdatePreferredLanguage(t *testing.T) {
	store := memstore.New()
	svc := service.NewUserSettingsService(store.Users())
	u := store.MustAddUser("alice", "alice@example.com")

	for _, lang := range []string{"ja", "en"} {
		if err := svc.UpdatePreferredLanguage(context.Background(), service.UpdatePreferredLanguageParams{UserID: u.ID, PreferredLanguage: lang}); err != nil {
			t.Fatalf("set %q: %v", lang, err)
		}
		got, _ := store.Users().GetByID(context.Background(), u.ID)
		if got.PreferredLanguage != lang {
			t.Errorf("stored %q, want %q", got.PreferredLanguage, lang)
		}
	}

	for _, bad := range []string{"", "fr", "JA", "en-US"} {
		err := svc.UpdatePreferredLanguage(context.Background(), service.UpdatePreferredLanguageParams{UserID: u.ID, PreferredLanguage: bad})
		if !errors.Is(err, service.ErrInvalidPreferredLanguage) {
			t.Errorf("%q: got %v, want ErrInvalidPreferredLanguage", bad, err)
		}
	}

	err := svc.UpdatePreferredLanguage(context.Background(), service.UpdatePreferredLanguageParams{UserID: 999, PreferredLanguage: "ja"})
	if !errors.Is(err, service.ErrUserNotFound) {
		t.Errorf("missing user: got %v, want ErrUserNotFound", err)
	}
}
