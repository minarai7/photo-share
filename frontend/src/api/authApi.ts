import { apiRequest } from "./client";
import type { LoginRequest, LoginResponse, SignupRequest, User } from "../types/auth";

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

export function getUserById(id: number) {
    return apiRequest<User>(`/users/${id}`);
}
