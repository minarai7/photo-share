export type GearKind = "camera" | "lens";

export type GearLinkConfidence = "low" | "medium" | "high";

export type GearLinkSuggestion = {
    title: string;
    url: string;
    reason: string;
    confidence: GearLinkConfidence;
}

export type GearLinkRequest = {
    kind: GearKind;
    name: string;
}

export type GearLinkResponse = {
    kind: GearKind;
    name: string;
    summary: string;
    suggestions: GearLinkSuggestion[];
}
