-- +goose Up
-- How many images a post has. Images are fixed after creation, so the backend
-- writes it once, in CreatePost's transaction. Stored (not a COUNT subquery)
-- so the "most photos" sort and the single / series filter can use an index.
-- The default 1 matches a post from a backend older than this column; a
-- multi-image post created by such a backend (a rollback) would read as 1
-- until fixed with the same UPDATE as below.
ALTER TABLE posts
ADD COLUMN image_count SMALLINT NOT NULL DEFAULT 1 CHECK (image_count >= 1);

UPDATE posts
SET image_count = GREATEST(1, (SELECT count(*) FROM post_images WHERE post_images.post_id = posts.id));

-- GET /posts?sort=most: ORDER BY image_count DESC, created_at DESC, id DESC
-- with WHERE (image_count, created_at, id) < (cursor).
CREATE INDEX posts_image_count_created_at_id_idx ON posts (image_count DESC, created_at DESC, id DESC);

-- The page colour of a post: a pale "#rrggbb" sampled from its cover's
-- thumbnail (internal/tint). NULL until computed; clients then use their
-- default page colour.
ALTER TABLE posts
ADD COLUMN tint TEXT CHECK (tint ~ '^#[0-9a-f]{6}$');

-- +goose Down
ALTER TABLE posts
DROP COLUMN IF EXISTS tint;

DROP INDEX IF EXISTS posts_image_count_created_at_id_idx;

ALTER TABLE posts
DROP COLUMN IF EXISTS image_count;
