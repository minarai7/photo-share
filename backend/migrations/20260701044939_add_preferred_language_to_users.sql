-- +goose Up
ALTER TABLE users
ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE users
ADD CONSTRAINT users_preferred_language_check
CHECK (preferred_language IN ('en', 'ja'));

-- +goose Down
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_preferred_language_check;

ALTER TABLE users
DROP COLUMN IF EXISTS preferred_language;