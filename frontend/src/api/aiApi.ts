import type { GearLinkRequest, GearLinkResponse } from "../types/ai";
import { apiRequest } from "./client";

export function findGearLinks(data: GearLinkRequest) {
    return apiRequest<GearLinkResponse>("/ai/gear-link", {
        method: "POST",
        body: data,
    });
}
