export type Post = {
    id: number;
    user_id: number;
    username: string;
    image_path: string;
    // Small JPEG for the feed and profile grids; absent for posts without one.
    thumbnail_path?: string | null;
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
    image_path: string;
    // Must be the thumbnail_path the upload returned for image_path.
    thumbnail_path?: string | null;
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