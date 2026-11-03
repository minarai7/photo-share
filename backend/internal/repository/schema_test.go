package repository_test

import (
	"reflect"
	"sort"
	"strings"
	"testing"
	"unicode"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/testutil/testdb"
)

// Every migration must be reversible: up → down → up has to succeed and
// leave the schema usable. Catches AI-written migrations with a broken or
// missing Down section.
func TestMigrationsRoundTrip(t *testing.T) {
	db := testdb.Open(t)

	if err := testdb.MigrateDown(db); err != nil {
		t.Fatalf("down: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','posts')`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("%d app tables still exist after migrating down", n)
	}
	if err := testdb.MigrateUp(db); err != nil {
		t.Fatalf("up again: %v", err)
	}
}

// The go-jet models in internal/db/gen must match the migrated schema.
// If this fails you probably added a migration without regenerating:
//
//	jet -dsn="YOUR_DSN" -schema=public -path=./internal/db/gen
func TestGeneratedModelsMatchSchema(t *testing.T) {
	db := testdb.Open(t)

	for table, m := range map[string]any{
		"users": model.Users{},
		"posts": model.Posts{},
	} {
		t.Run(table, func(t *testing.T) {
			rows, err := db.Query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, table)
			if err != nil {
				t.Fatal(err)
			}
			defer rows.Close()
			var dbCols []string
			for rows.Next() {
				var c string
				if err := rows.Scan(&c); err != nil {
					t.Fatal(err)
				}
				dbCols = append(dbCols, c)
			}

			var modelCols []string
			rt := reflect.TypeOf(m)
			for i := 0; i < rt.NumField(); i++ {
				modelCols = append(modelCols, snake(rt.Field(i).Name))
			}

			sort.Strings(dbCols)
			sort.Strings(modelCols)
			if !reflect.DeepEqual(dbCols, modelCols) {
				t.Errorf("schema drift for %s:\n  db:    %v\n  model: %v\nregenerate go-jet models", table, dbCols, modelCols)
			}
		})
	}
}

// snake converts go-jet field names (UserID, PasswordHash) to column names.
func snake(s string) string {
	r := []rune(s)
	var b strings.Builder
	for i, c := range r {
		if unicode.IsUpper(c) && i > 0 {
			prevLower := unicode.IsLower(r[i-1])
			nextLower := i+1 < len(r) && unicode.IsLower(r[i+1])
			if prevLower || (nextLower && unicode.IsUpper(r[i-1])) {
				b.WriteByte('_')
			}
		}
		b.WriteRune(unicode.ToLower(c))
	}
	return b.String()
}
