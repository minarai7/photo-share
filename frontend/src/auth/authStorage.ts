import type { User } from "../types/auth";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
export const AUTH_CHANGED_EVENT = "auth_changed";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
    const rawUser = localStorage.getItem(USER_KEY);

    if (!rawUser) {
        return null;
    }

    try {
        return JSON.parse(rawUser) as User;
    } catch {
        return null;
    }
}

export function saveAuth(token: string, user: User): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function isTokenExpired(token: string): boolean {
    try {
        const payloadBase64 = token.split(".")[1];

        if (!payloadBase64) {
            return true;
        }

        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);

        if (!payload.exp) {
            return true;
        }

        const expiredAtMs = payload.exp * 1000;
        const nowMs = Date.now();

        return nowMs >= expiredAtMs;
    } catch {
        return true
    }
}