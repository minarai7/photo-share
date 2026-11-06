import { getToken } from "../auth/authStorage";
import type { ApiErrorResponse } from "../types/auth";
import { ApiError } from "./apiError";
import { DEFAULT_API_BASE_URL } from "../config/apiBaseUrl";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

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

    const token = getToken();

    const finalHeaders = new Headers(headers);

    if (token) {
        finalHeaders.set("Authorization", `Bearer ${token}`)
    }

    const isFormData = body instanceof FormData;

    if (body !== undefined && !isFormData && !finalHeaders.has("Content-Type")) {
        finalHeaders.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: finalHeaders,
        credentials,
        body: 
            body !== undefined
                ? isFormData
                    ? body
                    : JSON.stringify(body)
                : undefined,
    });

    if (!response.ok) {
        let code = "unknown_error"
        let message = `Request failed with status ${response.status}`;
        try {
            const errorData = (await response.json()) as ApiErrorResponse;
            if (errorData?.error?.code) {
                code = errorData.error.code;
            }
            if (errorData?.error?.message) {
                message = errorData.error.message;
            }
        } catch {
            // Body wasn't the JSON error envelope (e.g. a proxy's HTML page): keep the defaults above.
        }
        throw new ApiError(
            code,
            message,
            response.status
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}
