import { API_BASE_URL } from "../api/client";

export function getImageUrl(imagePath: string): string {
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
        return imagePath;
    }

    return `${API_BASE_URL}${imagePath}`;
}