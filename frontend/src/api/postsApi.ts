import { apiRequest } from "./client";
import type { Post, CreatePostRequest, GetPostResponse, GetPostsResponse, UpdatePostRequest } from "../types/post";

export type PostSort = "newest" | "oldest" | "most";
export type PhotosFilter = "any" | "single" | "series";

/** Which posts a list or a count covers. */
export type PostQuery = {
    /** Only these people's posts; everyone when empty or absent. */
    userIds?: number[];
    /** single: one photo; series: two or more. */
    photos?: PhotosFilter;
};

export type GetPostsParams = PostQuery & {
    /** newest (the API's default), oldest, or most photos first. */
    sort?: PostSort;
    /** Page size; without it the API returns every post. */
    limit?: number;
    /** The last post of the previous page; the page starts after it in this sort. */
    after?: Pick<Post, "id" | "created_at" | "image_count">;
};

function filterParams({ userIds, photos }: PostQuery): URLSearchParams {
    const query = new URLSearchParams();
    if (userIds && userIds.length > 0) {
        query.set("user_ids", userIds.join(","));
    }
    if (photos && photos !== "any") {
        query.set("photos", photos);
    }
    return query;
}

const withQuery = (path: string, query: URLSearchParams) => {
    const search = query.toString();
    return search ? `${path}?${search}` : path;
};

/** A page of posts. They have image_count and tint but no images. */
export function getPosts({ sort, limit, after, ...filter }: GetPostsParams = {}) {
    const query = filterParams(filter);
    if (sort && sort !== "newest") {
        query.set("sort", sort);
    }
    if (limit !== undefined) {
        query.set("limit", String(limit));
    }
    if (after) {
        // Sent back exactly as received, so the cursor matches the row.
        query.set("before_created_at", after.created_at);
        query.set("before_id", String(after.id));
        if (sort === "most") {
            query.set("before_image_count", String(after.image_count ?? 1));
        }
    }
    return apiRequest<GetPostsResponse>(withQuery("/posts", query));
}

/** How many posts match the filter (sort doesn't change it). */
export async function getPostCount(filter: PostQuery = {}): Promise<number> {
    const { count } = await apiRequest<{ count: number }>(withQuery("/posts/count", filterParams(filter)));
    return count;
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
