import { apiRequest } from "./client";
import type { Author, LoginRequest, LoginResponse, PublicUser, SignupRequest } from "../types/auth";

export function signup(data: SignupRequest) {
    return apiRequest<LoginResponse>("/auth/signup", {
        method: "POST",
        body: data,
    });
}

export function loginUser(data: LoginRequest) {
    return apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: data,
    });
}

/** A person's public profile: name and the counts of their work. */
export function getUserById(id: number) {
    return apiRequest<PublicUser>(`/users/${id}`);
}

/** Everyone who has posted, by username. */
export function getAuthors() {
    return apiRequest<Author[]>("/users");
}
