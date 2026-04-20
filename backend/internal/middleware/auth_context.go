package middleware

import (
	"context"
	"errors"
)

type contextKey string

const userIDContextKey contextKey = "UserID"

func WithUserID(ctx context.Context, userID int64) context.Context {
	return context.WithValue(ctx, userIDContextKey, userID)
}

func GetUserID(ctx context.Context) (int64, error) {
	userID, ok := ctx.Value(userIDContextKey).(int64)
	if !ok {
		return 0, errors.New("user_id not found in context")
	}

	return userID, nil
}
