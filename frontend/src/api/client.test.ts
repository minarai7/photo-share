import { describe, expect, it } from "vitest";
import { apiRequest } from "./client";
import { ApiError } from "./apiError";
import { apiError, mockApi, noContent, ok } from "../test/mockApi";
import { makeToken } from "../test/fixtures";

describe("apiRequest", () => {
  it("prefixes API_BASE_URL and parses JSON", async () => {
    const api = mockApi({ "GET /posts": ok([{ id: 1 }]) });

    await expect(apiRequest("/posts")).resolves.toEqual([{ id: 1 }]);
    expect(api.fetch).toHaveBeenCalledWith("http://api.test/posts", expect.anything());
  });

  it("sends the stored token as a Bearer header", async () => {
    const token = makeToken();
    localStorage.setItem("auth_token", token);
    const api = mockApi({ "GET /posts": ok([]) });

    await apiRequest("/posts");
    expect(api.calls()[0].headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("sends no Authorization header when logged out", async () => {
    const api = mockApi({ "GET /posts": ok([]) });
    await apiRequest("/posts");
    expect(api.calls()[0].headers.has("Authorization")).toBe(false);
  });

  it("JSON-encodes object bodies with a JSON content type", async () => {
    const api = mockApi({ "POST /posts": ok({ id: 1 }, 201) });

    await apiRequest("/posts", { method: "POST", body: { caption: "hi" } });
    const call = api.calls()[0];
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.json()).toEqual({ caption: "hi" });
  });

  it("passes FormData through untouched so the browser sets the multipart boundary", async () => {
    const api = mockApi({ "POST /uploads": ok({ image_path: "/uploads/x.jpg" }, 201) });
    const form = new FormData();
    form.append("image", new Blob(["x"]), "x.jpg");

    await apiRequest("/uploads", { method: "POST", body: form });
    const call = api.calls()[0];
    expect(call.body).toBe(form);
    expect(call.headers.has("Content-Type")).toBe(false);
  });

  it("returns undefined for 204", async () => {
    mockApi({ "DELETE /posts/1": noContent() });
    await expect(apiRequest("/posts/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws ApiError carrying the backend code, message and status", async () => {
    mockApi({ "GET /posts/9": apiError(404, "post_not_found", "post not found") });

    const err = await apiRequest("/posts/9").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "post_not_found", message: "post not found", status: 404 });
  });

  it("falls back to unknown_error when the error body is not the standard envelope", async () => {
    mockApi({ "GET /posts": { status: 502, body: "<html>Bad Gateway</html>" } });

    const err = await apiRequest("/posts").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "unknown_error", status: 502 });
  });
});
