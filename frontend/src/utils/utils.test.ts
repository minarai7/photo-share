import { describe, expect, it } from "vitest";
import { getImageUrl } from "./imageUrl";
import { getLocaleFromLanguage } from "./locale";

describe("getImageUrl", () => {
  it("prefixes the API base onto stored /uploads paths", () => {
    expect(getImageUrl("/uploads/a.jpg")).toBe("http://api.test/uploads/a.jpg");
  });

  it.each(["https://cdn.example.com/a.jpg", "http://example.com/a.jpg"])("passes absolute URL %s through", (url) => {
    expect(getImageUrl(url)).toBe(url);
  });
});

describe("getLocaleFromLanguage", () => {
  it("maps app languages to BCP 47 locales", () => {
    expect(getLocaleFromLanguage("en")).toBe("en-US");
    expect(getLocaleFromLanguage("ja")).toBe("ja-JP");
  });
});
