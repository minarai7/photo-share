import type { UserResponse } from "../types/auth";
import type { LanguageCode } from "../types/lang";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
export const AUTH_CHANGED_EVENT = "auth_changed";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserResponse | null {
    const rawUser = localStorage.getItem(USER_KEY);

    if (!rawUser) {
        return null;
    }

    try {
        return JSON.parse(rawUser) as UserResponse;
    } catch {
        return null;
    }
}

export function saveAuth(token: string, user: UserResponse): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/**
 * The signed-in member's saved language, for the first render after a
 * reload (login() applies it otherwise). undefined for a visitor or an
 * expired session, so the site's default applies.
 */
export function storedLanguage(): LanguageCode | undefined {
    const token = getToken();
    if (!token || isTokenExpired(token)) return undefined;
    return getStoredUser()?.preferred_language;
}

/** Keeps the stored member in step after their language is saved, so a reload keeps it. */
export function rememberLanguage(language: LanguageCode): void {
    const token = getToken();
    const user = getStoredUser();
    if (token && user && user.preferred_language !== language) saveAuth(token, { ...user, preferred_language: language });
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