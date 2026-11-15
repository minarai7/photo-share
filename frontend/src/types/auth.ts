import type { LanguageCode } from "./lang";

export type ApiErrorResponse = {
    error: {
        code: string;
        message: string;
    };
};

/** The signed-in user's own account (login and signup responses only). */
export type UserResponse = {
    id: number;
    username: string;
    email: string;
    created_at: string;
    preferred_language: LanguageCode;
};

/** What anyone may read about a person (GET /users/{id}): no email, no settings. */
export type PublicUser = {
    id: number;
    username: string;
    /** Their posts ("works"). */
    post_count: number;
    /** The images in those posts ("photographs"). */
    photo_count: number;
    created_at: string;
};

/** Someone who has posted (GET /users), for the "By" filter. */
export type Author = {
    id: number;
    username: string;
    post_count: number;
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
    user: UserResponse;
};


