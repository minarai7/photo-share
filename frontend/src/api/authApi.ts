import { apiRequest } from "./client";
import type { LoginRequest, LoginResponse, SignupRequest } from "../types/auth";

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
