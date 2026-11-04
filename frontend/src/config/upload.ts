// Largest image the backend accepts (POST /uploads).
// Keep in sync with the MAX_UPLOAD_BYTES default in backend/internal/config/config.go.
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
