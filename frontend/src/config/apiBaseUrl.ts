// Shared by the app (src/api/client.ts) and vite.config.ts, which reads it at
// build time to add a preconnect to index.html. Keep it free of browser APIs.

/** Used when VITE_API_BASE_URL is unset: the Go server from `go run ./cmd/server`. */
export const DEFAULT_API_BASE_URL = "http://localhost:8080";

/**
 * The origin index.html should preconnect to for a given VITE_API_BASE_URL,
 * or null when there is nothing to gain: a relative base such as the docker
 * build's "/api" is the page's own origin, which is already connected.
 */
export function apiPreconnectOrigin(baseUrl: string | undefined): string | null {
    const url = baseUrl ?? DEFAULT_API_BASE_URL;
    if (!/^https?:\/\//i.test(url)) {
        return null;
    }
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}
