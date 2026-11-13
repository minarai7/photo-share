export type PostImage = {
    image_path: string;
    // Small JPEG of this image; absent when it has none.
    thumbnail_path?: string | null;
};

export type Post = {
    id: number;
    user_id: number;
    username: string;
    // The cover, i.e. the first image.
    image_path: string;
    // Small JPEG for the feed and profile grids; absent for posts without one.
    thumbnail_path?: string | null;
    // How many images the post has (at least one). Optional only because a
    // post kept in browser history from an older build may lack it.
    image_count?: number;
    // All of the post's images in display order. Only a single post
    // (GET /posts/{id}) has them; the feed and profile lists don't.
    images?: PostImage[];
    caption: string;
    location?: string | null;
    camera_body?: string | null;
    lens?: string | null;
    created_at: string;
    updated_at: string;
};

export type GetPostsResponse = Post[];

export type GetPostResponse = Post;

export type CreatePostRequest = {
    // In display order; the first is the cover. Each thumbnail_path must be
    // the one the upload returned for that image_path.
    images: PostImage[];
    caption: string;
    location?: string | null;
    camera_body?: string | null;
    lens?: string | null;
};

export type UpdatePostRequest = {
  caption: string;
  location?: string | null;
  camera_body?: string | null;
  lens?: string | null;
};
