import { apiRequest } from "./client";
import type { LoginRequest, LoginResponse, SignupRequest } from "./types";

export function signup(data: SignupRequest) {
    return apiRequest<LoginResponse>("/auth/signup", {
        method: "POST",
        body: data,
    });
}

export function login(data: LoginRequest) {
    return apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: data,
    });
}
