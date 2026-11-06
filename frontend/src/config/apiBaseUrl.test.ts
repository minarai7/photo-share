import { describe, expect, it } from "vitest";
import { apiPreconnectOrigin } from "./apiBaseUrl";

describe("apiPreconnectOrigin", () => {
  it("falls back to the local Go server when VITE_API_BASE_URL is unset", () => {
    expect(apiPreconnectOrigin(undefined)).toBe("http://localhost:8080");
  });

  it("uses the origin of an absolute API URL (prod)", () => {
    expect(apiPreconnectOrigin("https://api.example.on.aws")).toBe("https://api.example.on.aws");
    expect(apiPreconnectOrigin("https://api.example.on.aws/v1/")).toBe("https://api.example.on.aws");
  });

  it("skips a same-origin base (the docker build's /api, or empty)", () => {
    expect(apiPreconnectOrigin("/api")).toBeNull();
    expect(apiPreconnectOrigin("")).toBeNull();
  });

  it("skips anything that isn't an http(s) URL", () => {
    expect(apiPreconnectOrigin("%VITE_API_BASE_URL%")).toBeNull();
    expect(apiPreconnectOrigin("javascript:alert(1)")).toBeNull();
    expect(apiPreconnectOrigin("http://")).toBeNull();
  });
});
