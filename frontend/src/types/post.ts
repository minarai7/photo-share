export type Post = {
    id: number;
    user_id: number;
    username: string;
    image_path: string;
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