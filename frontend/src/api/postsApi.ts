import { apiRequest } from "./client";
import { type Post, type CreatePostRequest, type GetPostResponse, type GetPostsResponse } from "./types";

export function getPosts() {
    return apiRequest<GetPostsResponse>("/posts");
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
