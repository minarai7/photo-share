package service_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"backend/internal/service"
	"backend/internal/testutil/memstore"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const testSecret = "test-secret"

func newAuth(t *testing.T) (*service.AuthService, *memstore.Store) {
	t.Helper()
	store := memstore.New()
	return service.NewAuthService(store.Users(), testSecret), store
}

func TestSignup_CreatesUserWithBcryptHashAndTrimmedFields(t *testing.T) {
	auth, store := newAuth(t)

	user, err := auth.Signup(context.Background(), service.SignupParams{
		Username: "  alice  ",
		Email:    " alice@example.com ",
		Password: "correct horse",
	})
	if err != nil {
		t.Fatalf("Signup: %v", err)
	}
	if user.Username != "alice" || user.Email != "alice@example.com" {
		t.Errorf("fields not trimmed: username=%q email=%q", user.Username, user.Email)
	}
	if user.PasswordHash == "correct horse" {
		t.Fatal("password stored in plaintext")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("correct horse")); err != nil {
		t.Errorf("stored hash does not verify: %v", err)
	}

	stored, _ := store.Users().GetByEmail(context.Background(), "alice@example.com")
	if stored == nil {
		t.Fatal("user was not persisted")
	}
}

func TestSignup_Validation(t *testing.T) {
	cases := []struct {
		name string
		in   service.SignupParams
		want error
	}{
		{"missing username", service.SignupParams{Username: " ", Email: "a@b.c", Password: "pw"}, service.ErrInvalidSignupInput},
		{"missing email", service.SignupParams{Username: "a", Email: "", Password: "pw"}, service.ErrInvalidSignupInput},
		{"missing password", service.SignupParams{Username: "a", Email: "a@b.c", Password: ""}, service.ErrInvalidSignupInput},
		{"73-byte password", service.SignupParams{Username: "a", Email: "a@b.c", Password: strings.Repeat("x", 73)}, service.ErrPasswordTooLong},
		// 25 three-byte runes = 75 bytes: the limit is bytes, not characters.
		{"multibyte password over 72 bytes", service.SignupParams{Username: "a", Email: "a@b.c", Password: strings.Repeat("写", 25)}, service.ErrPasswordTooLong},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			auth, _ := newAuth(t)
			_, err := auth.Signup(context.Background(), tc.in)
			if !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestSignup_Accepts72BytePassword(t *testing.T) {
	auth, _ := newAuth(t)
	_, err := auth.Signup(context.Background(), service.SignupParams{
		Username: "a", Email: "a@b.c", Password: strings.Repeat("x", 72),
	})
	if err != nil {
		t.Fatalf("72-byte password should be accepted: %v", err)
	}
}

func TestSignup_Duplicates(t *testing.T) {
	auth, store := newAuth(t)
	store.MustAddUser("taken", "taken@example.com")

	_, err := auth.Signup(context.Background(), service.SignupParams{Username: "new", Email: "taken@example.com", Password: "pw"})
	if !errors.Is(err, service.ErrEmailAlreadyExists) {
		t.Errorf("duplicate email: got %v", err)
	}

	_, err = auth.Signup(context.Background(), service.SignupParams{Username: "taken", Email: "new@example.com", Password: "pw"})
	if !errors.Is(err, service.ErrUsernameAlreadyExists) {
		t.Errorf("duplicate username: got %v", err)
	}
}

func TestLogin(t *testing.T) {
	auth, _ := newAuth(t)
	created, err := auth.Signup(context.Background(), service.SignupParams{Username: "bob", Email: "bob@example.com", Password: "hunter22"})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("success returns a token for the user", func(t *testing.T) {
		res, err := auth.Login(context.Background(), service.LoginParams{Email: "bob@example.com", Password: "hunter22"})
		if err != nil {
			t.Fatalf("Login: %v", err)
		}
		if res.User.ID != created.ID {
			t.Errorf("user id = %d, want %d", res.User.ID, created.ID)
		}
		uid, err := auth.ParseToken(res.Token)
		if err != nil || uid != created.ID {
			t.Errorf("ParseToken = (%d, %v), want (%d, nil)", uid, err, created.ID)
		}
	})

	t.Run("wrong password and unknown email are indistinguishable", func(t *testing.T) {
		_, err1 := auth.Login(context.Background(), service.LoginParams{Email: "bob@example.com", Password: "nope"})
		_, err2 := auth.Login(context.Background(), service.LoginParams{Email: "nobody@example.com", Password: "hunter22"})
		if !errors.Is(err1, service.ErrInvalidCredentials) || !errors.Is(err2, service.ErrInvalidCredentials) {
			t.Errorf("got %v and %v, want ErrInvalidCredentials for both", err1, err2)
		}
	})
}

func TestGetUserByID_NotFound(t *testing.T) {
	auth, _ := newAuth(t)
	_, err := auth.GetUserByID(context.Background(), 999)
	if !errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want ErrUserNotFound", err)
	}
}

func TestToken_ExpiresIn24Hours(t *testing.T) {
	auth, _ := newAuth(t)
	tok, err := auth.GenerateToken(42)
	if err != nil {
		t.Fatal(err)
	}
	claims := &service.Claims{}
	if _, err := jwt.ParseWithClaims(tok, claims, func(*jwt.Token) (any, error) { return []byte(testSecret), nil }); err != nil {
		t.Fatal(err)
	}
	ttl := time.Until(claims.ExpiresAt.Time)
	if ttl < 23*time.Hour || ttl > 24*time.Hour+time.Minute {
		t.Errorf("token ttl = %v, want ~24h", ttl)
	}
	if claims.UserID != 42 {
		t.Errorf("user_id claim = %d, want 42", claims.UserID)
	}
}

func TestParseToken_Rejects(t *testing.T) {
	auth, _ := newAuth(t)

	sign := func(method jwt.SigningMethod, key any, claims service.Claims) string {
		t.Helper()
		s, err := jwt.NewWithClaims(method, claims).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	valid := service.Claims{
		UserID: 1,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	expired := valid
	expired.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))

	cases := map[string]string{
		"garbage":            "not.a.jwt",
		"empty":              "",
		"wrong secret":       sign(jwt.SigningMethodHS256, []byte("other-secret"), valid),
		"expired":            sign(jwt.SigningMethodHS256, []byte(testSecret), expired),
		"alg none":           sign(jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, valid),
		"tampered signature": sign(jwt.SigningMethodHS256, []byte(testSecret), valid) + "x",
	}
	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := auth.ParseToken(tok); err == nil {
				t.Fatal("token was accepted")
			}
		})
	}
}
