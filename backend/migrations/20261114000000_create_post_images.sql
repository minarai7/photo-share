-- +goose Up
-- A post's images in display order (position 0 is the cover). posts.image_path
-- and posts.thumbnail_path stay as a copy of position 0, written in the same
-- transaction, so the feed, older clients and older backends keep working.
CREATE TABLE post_images (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position >= 0),
    image_path TEXT NOT NULL,
    thumbnail_path TEXT,
    UNIQUE (post_id, position)
);

-- Every existing post has exactly one image: its cover.
INSERT INTO post_images (post_id, position, image_path, thumbnail_path)
SELECT id, 0, image_path, thumbnail_path FROM posts;

-- +goose Down
-- The cover columns still hold image 0; only the extra images are lost.
DROP TABLE IF EXISTS post_images;
