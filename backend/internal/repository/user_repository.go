package repository

import (
	"context"
	"database/sql"
	"errors"

	postgres "github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	model "backend/internal/db/gen/photoshare/public/model"
	table "backend/internal/db/gen/photoshare/public/table"
)

var ErrorUserNotFound = errors.New("user not found")

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

type CreateUserParams struct {
	Username     string
	Email        string
	PasswordHash string
}

func (r *UserRepository) GetByID(ctx context.Context, id int64) (*model.Users, error) {
	stmt := postgres.SELECT(table.Users.AllColumns).
		FROM(table.Users).
		WHERE(table.Users.ID.EQ(postgres.Int64(id)))

	var user model.Users
	err := stmt.QueryContext(ctx, r.db, &user)

	if errors.Is(err, qrm.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.Users, error) {
	stmt := postgres.SELECT(table.Users.AllColumns).
		FROM(table.Users).
		WHERE(table.Users.Email.EQ(postgres.String(email)))

	var user model.Users
	err := stmt.QueryContext(ctx, r.db, &user)

	if errors.Is(err, qrm.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*model.Users, error) {
	stmt := postgres.SELECT(table.Users.AllColumns).
		FROM(table.Users).
		WHERE(table.Users.Username.EQ(postgres.String(username)))

	var user model.Users
	err := stmt.QueryContext(ctx, r.db, &user)

	if errors.Is(err, qrm.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) Create(ctx context.Context, p CreateUserParams) (*model.Users, error) {
	stmt := table.Users.
		INSERT(
			table.Users.Username,
			table.Users.Email,
			table.Users.PasswordHash).
		MODEL(p).
		RETURNING(table.Users.AllColumns)

	var user model.Users
	err := stmt.QueryContext(ctx, r.db, &user)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) UpdatePreferredLanguage(ctx context.Context, id int64, preferredLanguage string) error {
	stmt := table.Users.UPDATE(
		table.Users.PreferredLanguage,
	).SET(
		preferredLanguage,
	).WHERE(
		table.Users.ID.EQ(postgres.Int64(id)),
	)

	result, err := stmt.ExecContext(ctx, r.db)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return ErrorUserNotFound
	}

	return nil
}
