import type { UserResponse } from "../types/auth";
import type { Post } from "../types/post";

export const API = "http://api.test"; // matches test.env in vitest.config.ts

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Unsigned JWT-shaped token; the frontend only decodes the payload. */
export function makeToken({ userId = 1, expiresInSec = 3600 } = {}): string {
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const payload = base64Url({ user_id: userId, exp: Math.floor(Date.now() / 1000) + expiresInSec });
  return `${header}.${payload}.signature`;
}

export function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 1,
    username: "alice",
    email: "alice@example.com",
    preferred_language: "en",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * A single post like GET /posts/{id} returns. Without an `images` override it
 * has one image, its cover (image_path / thumbnail_path). image_count follows
 * the images unless overridden. For a list item (no images), use makeListPost.
 */
export function makePost(overrides: Partial<Post> = {}): Post {
  const post: Omit<Post, "images" | "image_count"> = {
    id: 10,
    user_id: 1,
    username: "alice",
    image_path: "/uploads/photo.jpg",
    caption: "Morning light",
    location: "Kyoto",
    camera_body: null,
    lens: null,
    created_at: "2026-10-20T08:00:00Z",
    updated_at: "2026-10-20T08:00:00Z",
    ...overrides,
  };
  const cover = post.thumbnail_path
    ? { image_path: post.image_path, thumbnail_path: post.thumbnail_path }
    : { image_path: post.image_path };
  const images = overrides.images ?? [cover];
  return { ...post, images, image_count: overrides.image_count ?? images.length };
}

/** A post as GET /posts lists it: the cover and image_count, no images. */
export function makeListPost(overrides: Partial<Post> = {}): Post {
  const post = makePost(overrides);
  delete post.images;
  return post;
}

/** Puts a session in localStorage exactly like authStorage.saveAuth does. */
export function seedSession(user: UserResponse = makeUser(), token = makeToken({ userId: user.id })) {
  localStorage.setItem("auth_token", token);
  localStorage.setItem("auth_user", JSON.stringify(user));
  return { user, token };
}
