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

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
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
}

/** Puts a session in localStorage exactly like authStorage.saveAuth does. */
export function seedSession(user: UserResponse = makeUser(), token = makeToken({ userId: user.id })) {
  localStorage.setItem("auth_token", token);
  localStorage.setItem("auth_user", JSON.stringify(user));
  return { user, token };
}
