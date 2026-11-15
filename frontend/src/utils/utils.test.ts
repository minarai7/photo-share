import { describe, expect, it } from "vitest";
import { getImageUrl } from "./imageUrl";
import { formatDateDots, isJa } from "./motion";

describe("getImageUrl", () => {
  it("prefixes the API base onto stored /uploads paths", () => {
    expect(getImageUrl("/uploads/a.jpg")).toBe("http://api.test/uploads/a.jpg");
  });

  it.each(["https://cdn.example.com/a.jpg", "http://example.com/a.jpg"])("passes absolute URL %s through", (url) => {
    expect(getImageUrl(url)).toBe(url);
  });
});

describe("wall label helpers", () => {
  it("writes the date with dots", () => {
    expect(formatDateDots("2026-08-04T12:00:00")).toBe("2026.08.04");
  });

  it("detects Japanese titles", () => {
    expect(isJa("海辺の生きもの")).toBe(true);
    expect(isJa("カフェ")).toBe(true);
    expect(isJa("Harbour at dusk")).toBe(false);
  });
});
