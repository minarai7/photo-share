import { describe, expect, it, vi } from "vitest";
import { AUTH_CHANGED_EVENT, clearAuth, getStoredUser, getToken, isTokenExpired, saveAuth } from "./authStorage";
import { makeToken, makeUser } from "../test/fixtures";

describe("isTokenExpired", () => {
  it("is false for a token that expires in the future", () => {
    expect(isTokenExpired(makeToken({ expiresInSec: 60 }))).toBe(false);
  });

  it("is true for a token whose exp has passed", () => {
    expect(isTokenExpired(makeToken({ expiresInSec: -1 }))).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["no payload segment", "header-only"],
    ["payload not base64 JSON", "a.%%%.c"],
    ["payload without exp", `x.${btoa(JSON.stringify({ user_id: 1 }))}.y`],
  ])("treats %s as expired", (_, token) => {
    expect(isTokenExpired(token)).toBe(true);
  });
});

describe("session storage", () => {
  it("round-trips token and user and notifies listeners", () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    const user = makeUser();

    saveAuth("tok", user);
    expect(getToken()).toBe("tok");
    expect(getStoredUser()).toEqual(user);

    clearAuth();
    expect(getToken()).toBeNull();
    expect(getStoredUser()).toBeNull();

    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  });

  it("ignores a corrupted stored user instead of crashing", () => {
    localStorage.setItem("auth_user", "{not json");
    expect(getStoredUser()).toBeNull();
  });
});
