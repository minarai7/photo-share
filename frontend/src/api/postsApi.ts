import { apiRequest } from "./client";
import type { Post, CreatePostRequest, GetPostResponse, GetPostsResponse, UpdatePostRequest } from "../types/post";

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
