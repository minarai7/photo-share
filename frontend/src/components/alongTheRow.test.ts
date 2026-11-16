import { describe, expect, it } from "vitest";
import type { Modifier } from "@dnd-kit/core";
import { alongTheRow } from "./alongTheRow";

describe("alongTheRow", () => {
    it("keeps the sideways movement and drops the vertical", () => {
        const args = { transform: { x: 42, y: -30, scaleX: 1, scaleY: 1 } } as Parameters<Modifier>[0];
        expect(alongTheRow(args)).toEqual({ x: 42, y: 0, scaleX: 1, scaleY: 1 });
    });
});
