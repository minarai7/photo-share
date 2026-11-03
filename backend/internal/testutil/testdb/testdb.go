// Package testdb gives integration tests a real, freshly migrated Postgres.
//
// Set TEST_DATABASE_URL to a *throwaway* database whose name ends in "_test";
// the schema is dropped and rebuilt from backend/migrations on first use.
// Without TEST_DATABASE_URL the tests skip, unless REQUIRE_DB_TESTS=1 (CI),
// in which case they fail so a misconfigured pipeline can't pass silently.
//
//	docker run -d --name photoshare-testdb -p 5434:5432 \
//	  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=photoshare_test \
//	  --tmpfs /var/lib/postgresql/data postgres:16-alpine
//	TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5434/photoshare_test?sslmode=disable
package testdb

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var (
	once    sync.Once
	shared  *sql.DB
	initErr error
)

// Open returns a connection to the migrated test database with all tables
// truncated. Tests using it must not call t.Parallel().
func Open(t *testing.T) *sql.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		if os.Getenv("REQUIRE_DB_TESTS") == "1" {
			t.Fatal("REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is not set")
		}
		t.Skip("TEST_DATABASE_URL not set; skipping database integration test")
	}

	once.Do(func() { shared, initErr = setup(dsn) })
	if initErr != nil {
		t.Fatalf("test database setup: %v", initErr)
	}

	Truncate(t, shared)
	return shared
}

func setup(dsn string) (*sql.DB, error) {
	cfg, err := pgconn.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse TEST_DATABASE_URL: %w", err)
	}
	if !strings.HasSuffix(cfg.Database, "_test") {
		return nil, fmt.Errorf("refusing to use database %q: TEST_DATABASE_URL must name a database ending in _test (it gets wiped)", cfg.Database)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	if err := ResetSchema(db); err != nil {
		return nil, err
	}
	if err := MigrateUp(db); err != nil {
		return nil, err
	}
	return db, nil
}

// Truncate empties every application table and resets id sequences.
func Truncate(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`TRUNCATE users, posts RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func ResetSchema(db *sql.DB) error {
	_, err := db.Exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)
	return err
}

// MigrateUp applies every "-- +goose Up" section in filename order.
func MigrateUp(db *sql.DB) error {
	files, err := migrationFiles()
	if err != nil {
		return err
	}
	for _, f := range files {
		up, _, err := parseMigration(f)
		if err != nil {
			return err
		}
		if _, err := db.Exec(up); err != nil {
			return fmt.Errorf("%s up: %w", filepath.Base(f), err)
		}
	}
	return nil
}

// MigrateDown applies every "-- +goose Down" section in reverse order.
func MigrateDown(db *sql.DB) error {
	files, err := migrationFiles()
	if err != nil {
		return err
	}
	for i := len(files) - 1; i >= 0; i-- {
		_, down, err := parseMigration(files[i])
		if err != nil {
			return err
		}
		if _, err := db.Exec(down); err != nil {
			return fmt.Errorf("%s down: %w", filepath.Base(files[i]), err)
		}
	}
	return nil
}

func migrationsDir() string {
	_, thisFile, _, _ := runtime.Caller(0)
	// internal/testutil/testdb/testdb.go → backend/migrations
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "migrations")
}

func migrationFiles() ([]string, error) {
	files, err := filepath.Glob(filepath.Join(migrationsDir(), "*.sql"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no migrations found in %s", migrationsDir())
	}
	sort.Strings(files)
	return files, nil
}

// parseMigration splits a goose SQL file into its Up and Down sections.
// StatementBegin/End markers are dropped: each section is sent as one
// simple-protocol Exec, which already allows multiple statements.
func parseMigration(path string) (up, down string, err error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", "", err
	}
	var cur *strings.Builder
	var upB, downB strings.Builder
	for _, line := range strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "-- +goose Up"):
			cur = &upB
			continue
		case strings.HasPrefix(trimmed, "-- +goose Down"):
			cur = &downB
			continue
		case strings.HasPrefix(trimmed, "-- +goose NO TRANSACTION"):
			return "", "", fmt.Errorf("%s: NO TRANSACTION migrations are not supported by testdb; extend parseMigration", filepath.Base(path))
		case strings.HasPrefix(trimmed, "-- +goose"):
			continue
		}
		if cur != nil {
			cur.WriteString(line)
			cur.WriteByte('\n')
		}
	}
	if strings.TrimSpace(upB.String()) == "" {
		return "", "", fmt.Errorf("%s: empty or missing -- +goose Up section", filepath.Base(path))
	}
	if strings.TrimSpace(downB.String()) == "" {
		return "", "", fmt.Errorf("%s: empty or missing -- +goose Down section", filepath.Base(path))
	}
	return upB.String(), downB.String(), nil
}
