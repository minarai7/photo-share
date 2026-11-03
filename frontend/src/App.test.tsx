import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en, ja } from "./lang";
import { makeToken, makeUser, seedSession } from "./test/fixtures";
import { apiError, mockApi, noContent, ok } from "./test/mockApi";
import { renderApp } from "./test/renderApp";

describe("route guards", () => {
  it("sends anonymous users from a protected page to /login", async () => {
    const { currentPath } = renderApp("/posts/new");
    expect(await screen.findByRole("heading", { name: en.auth.loginTitle })).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
  });

  it("treats an expired token as logged out", async () => {
    seedSession(makeUser(), makeToken({ expiresInSec: -60 }));
    const { currentPath } = renderApp("/posts/new");
    expect(await screen.findByRole("heading", { name: en.auth.loginTitle })).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
  });

  it("lets a logged-in user open a protected page", () => {
    seedSession();
    renderApp("/posts/new");
    expect(screen.getByRole("heading", { name: en.posts.createPostTitle })).toBeInTheDocument();
  });

  it.each(["/login", "/signup"])("redirects logged-in users away from %s", async (path) => {
    seedSession();
    mockApi({ "GET /posts": ok([]) });
    const { currentPath } = renderApp(path);
    await waitFor(() => expect(currentPath()).toBe("/"));
  });

  it("renders the not-found page for unknown routes", () => {
    renderApp("/definitely/not/a/page");
    expect(screen.getByRole("heading", { name: en.notFound.title })).toBeInTheDocument();
  });
});

describe("nav bar", () => {
  it("shows login/signup when anonymous", () => {
    mockApi({ "GET /posts": ok([]) });
    renderApp("/");
    expect(screen.getByRole("link", { name: en.nav.login })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.nav.logout })).not.toBeInTheDocument();
  });

  it("logout clears the session and returns to /login", async () => {
    const { user: me } = seedSession(makeUser({ username: "alice" }));
    mockApi({ "GET /posts": ok([]) });
    const { user, currentPath } = renderApp("/");

    expect(screen.getByRole("link", { name: en.nav.profile(me.username) })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.nav.logout }));

    expect(currentPath()).toBe("/login");
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(screen.queryByRole("button", { name: en.nav.logout })).not.toBeInTheDocument();
  });
});

describe("language switcher", () => {
  it("persists the choice for logged-in users", async () => {
    seedSession();
    const api = mockApi({ "GET /posts": ok([]), "PUT /users/me/settings/language": noContent() });
    const { user } = renderApp("/");

    await user.click(screen.getByRole("button", { name: "JA" }));

    expect(await screen.findByRole("link", { name: ja.nav.feed })).toBeInTheDocument();
    expect(api.calls("PUT /users/me/settings/language")[0].json()).toEqual({ preferred_language: "ja" });
  });

  it("reverts and shows an error when saving fails", async () => {
    seedSession();
    mockApi({ "GET /posts": ok([]), "PUT /users/me/settings/language": apiError(500, "internal_error") });
    const { user } = renderApp("/");

    await user.click(screen.getByRole("button", { name: "JA" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.settings.languageSaveFailed);
    expect(screen.getByRole("link", { name: en.nav.feed })).toBeInTheDocument();
  });

  it("switches locally without an API call when anonymous", async () => {
    const api = mockApi({ "GET /posts": ok([]) });
    const { user } = renderApp("/");
    await user.click(screen.getByRole("button", { name: "JA" }));
    expect(await screen.findByRole("link", { name: ja.nav.feed })).toBeInTheDocument();
    expect(api.calls("PUT /users/me/settings/language")).toHaveLength(0);
  });
});
