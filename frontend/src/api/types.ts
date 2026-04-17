export type ApiErrorResponse = {
    error: {
        code: string;
        message: string;
    };
};

export type User = {
    id: number;
    username: string;
    email: string;
    created_at: string;
};

export type SignupRequest = {
    username: string;
    email: string;
    password: string;
};

export type LoginRequest = {
    email: string;
    password: string;
};

export type LoginResponse = {
    token: string;
    user: User;
};

export type Post = {
    id: number;
    user_id: number;
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

