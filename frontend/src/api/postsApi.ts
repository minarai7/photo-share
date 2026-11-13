import { apiRequest } from "./client";
import type { Post, CreatePostRequest, GetPostResponse, GetPostsResponse, UpdatePostRequest } from "../types/post";

export type GetPostsParams = {
    /** Only this user's posts. */
    userId?: number;
    /** Page size; without it the API returns every post. */
    limit?: number;
    /** The last post of the previous page; the page starts after it. */
    after?: Pick<Post, "id" | "created_at">;
};

/** A page of posts, newest first. They have image_count but no images. */
export function getPosts({ userId, limit, after }: GetPostsParams = {}) {
    const query = new URLSearchParams();
    if (userId !== undefined) {
        query.set("user_id", String(userId));
    }
    if (limit !== undefined) {
        query.set("limit", String(limit));
    }
    if (after) {
        // Sent back exactly as received, so the cursor matches the row.
        query.set("before_created_at", after.created_at);
        query.set("before_id", String(after.id));
    }
    const search = query.toString();
    return apiRequest<GetPostsResponse>(search ? `/posts?${search}` : "/posts");
}

export function getPostById(id: number) {
    return apiRequest<GetPostResponse>(`/posts/${id}`);
}

export function createPost(data: CreatePostRequest) {
    return apiRequest<Post>("/posts", {
        method: "POST",
        body: data,
    });
}

export function updatePostById(id: number, data: UpdatePostRequest) {
    return apiRequest<Post>(`/posts/${id}`, {
        method: "PUT",
        body: data,
    })
}

export function deletePostById(id: number) {
    return apiRequest<undefined>(`/posts/${id}`, {
        method: "DELETE",
    })
}
