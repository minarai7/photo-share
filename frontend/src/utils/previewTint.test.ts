import { describe, expect, it } from "vitest";
import { tintFromColor } from "./previewTint";

// The same cases as backend/internal/tint: the preview should match what the
// server stores closely, and always be pale.
describe("tintFromColor", () => {
    it("is pale #rrggbb and keeps the hue", () => {
        const red = tintFromColor(200 / 255, 40 / 255, 40 / 255);
        expect(red).toMatch(/^#[0-9a-f]{6}$/);
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(red.slice(i, i + 2), 16));
        expect(r).toBeGreaterThan(g);
        expect(Math.min(r, g, b)).toBeGreaterThan(190);
    });

    it("keeps grey neutral and lifts black to a pale page", () => {
        expect(tintFromColor(0.35, 0.35, 0.35)).toMatch(/^#([0-9a-f]{2})\1\1$/);
        const black = tintFromColor(0, 0, 0);
        expect(parseInt(black.slice(1, 3), 16)).toBeGreaterThan(220);
    });
});
