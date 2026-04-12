package repository

import (
	"context"
	"database/sql"

	postgres "github.com/go-jet/jet/v2/postgres"

	model "backend/internal/db/gen/photoshare/public/model"
	table "backend/internal/db/gen/photoshare/public/table"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) ListUsers(ctx context.Context) ([]model.Users, error) {
	stmt := postgres.SELECT(
		table.Users.AllColumns,
	).FROM(
		table.Users,
	).ORDER_BY(
		table.Users.ID.ASC(),
	)

	var users []model.Users
	err := stmt.QueryContext(ctx, r.db, &users)

	if err != nil {
		return nil, err
	}

	return users, nil
}
