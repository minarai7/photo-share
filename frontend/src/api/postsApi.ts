import { apiRequest } from "./client";
import { type Post, type CreatePostRequest, type GetPostResponse, type GetPostsResponse } from "../types/auth";

export function getPosts() {
    return apiRequest<GetPostsResponse>("/posts");
}

export function getPostById(id: number) {
    return apiRequest<GetPostResponse>(`/posts/${id}`);
}

export async function getPostsByUserId(userId: number) {
    const posts = await getPosts()

    return posts.filter((post: Post) => post.user_id === userId);
}

export function createPost(data: CreatePostRequest) {
    return apiRequest<Post>("/posts", {
        method: "POST",
        body: data,
    });
}
