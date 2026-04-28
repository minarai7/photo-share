import type { ApiErrorResponse } from "../types/auth";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"

type ApiRequestOptions = {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
    credentials?: RequestCredentials;
};

export async function apiRequest<T>(
    path: string,
    options: ApiRequestOptions = {}
): Promise<T> {
    const {
        method = "GET",
        body,
        headers,
        credentials = "include",
    } = options;

    const finalHeaders = new Headers(headers);

    if (body !== undefined && !finalHeaders.has("Content-Type")) {
        finalHeaders.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: finalHeaders,
        credentials,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
            const errorData = (await response.json()) as ApiErrorResponse;
            if (errorData?.error?.message) {
                message = errorData.error.message;
            }
        } catch {
        }
        throw new Error(message);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}
