import type { UploadImageResponse } from "../types/upload";
import { apiRequest } from "./client";

export function uploadImage(file: File): Promise<UploadImageResponse> {
    const formData = new FormData();

    formData.append("image", file);

    return apiRequest<UploadImageResponse>("/uploads", {
        method: "POST",
        body: formData,
    })
}
