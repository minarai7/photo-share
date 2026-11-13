-- +goose Up
-- Keyset pagination of the feed: ORDER BY created_at DESC, id DESC with
-- WHERE (created_at, id) < (cursor) walks this index instead of sorting
-- every post.
CREATE INDEX posts_created_at_id_idx ON posts (created_at DESC, id DESC);

-- A user's profile: the same order, filtered by user_id. Postgres does not
-- index foreign keys by itself, so this also speeds up the user delete cascade.
CREATE INDEX posts_user_id_created_at_id_idx ON posts (user_id, created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS posts_user_id_created_at_id_idx;
DROP INDEX IF EXISTS posts_created_at_id_idx;
