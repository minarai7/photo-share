-- +goose Up
-- Public path of the small JPEG shown in the feed and profile grids
-- (/uploads/<name>_w800.jpg). NULL until one has been made; clients then
-- fall back to image_path.
ALTER TABLE posts
ADD COLUMN thumbnail_path TEXT;

-- +goose Down
ALTER TABLE posts
DROP COLUMN IF EXISTS thumbnail_path;
