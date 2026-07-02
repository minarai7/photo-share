import type { UpdatePreferredLanguageRequest } from "../types/userSettings";
import { apiRequest } from "./client";

export function updatePreferredLanguage(data: UpdatePreferredLanguageRequest) {
    return apiRequest<undefined>(`/users/me/settings/language`, {
        method: "PUT",
        body: data,
    })
}