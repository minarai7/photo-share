import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en, ja } from "./lang";
import { feedRoutes } from "./test/feedApi";
import { makePost, makeToken, makeUser, seedSession } from "./test/fixtures";
import { apiError, mockApi, noContent } from "./test/mockApi";
import { renderApp } from "./test/renderApp";

describe("route guards", () => {
  it("sends anonymous users from a protected page to /login", async () => {
    mockApi(feedRoutes([]));
    const { currentPath } = renderApp("/posts/new");
    expect(await screen.findByRole("heading", { name: en.auth.loginTitle })).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
  });

  it("treats an expired token as logged out", async () => {
    mockApi(feedRoutes([]));
    seedSession(makeUser(), makeToken({ expiresInSec: -60 }));
    const { currentPath } = renderApp("/posts/new");
    expect(await screen.findByRole("heading", { name: en.auth.loginTitle })).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
  });

  it("lets a logged-in user open a protected page", () => {
    seedSession();
    renderApp("/posts/new");
    expect(screen.getByRole("heading", { name: en.compose.title })).toBeInTheDocument();
  });

  it.each(["/login", "/signup"])("redirects logged-in users away from %s", async (path) => {
    seedSession();
    mockApi(feedRoutes([]));
    const { currentPath } = renderApp(path);
    await waitFor(() => expect(currentPath()).toBe("/"));
  });

  it("renders the not-found sentence for unknown routes, with the way back", () => {
    renderApp("/definitely/not/a/page");
    expect(screen.getByRole("heading", { name: en.notFound.message })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.notFound.backToFeed })).toHaveAttribute("href", "/");
  });
});

describe("header", () => {
  it("offers Log in to a visitor and + New to a member, never both", async () => {
    mockApi(feedRoutes([makePost()]));
    const visitor = renderApp("/");
    expect(screen.getAllByRole("link", { name: en.header.login }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: en.header.newPostLabel })).not.toBeInTheDocument();
    visitor.unmount();

    seedSession();
    renderApp("/");
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: en.header.newPostLabel })).toHaveAttribute("href", "/posts/new");
    expect(header.queryByRole("link", { name: en.header.login })).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: new RegExp(makePost().caption) });
  });

  it("shows no Log in on the log-in page itself", () => {
    mockApi(feedRoutes([]));
    renderApp("/login");
    expect(screen.queryByRole("link", { name: en.header.login })).not.toBeInTheDocument();
  });
});

describe("language toggle (in the hero)", () => {
  it("persists the choice for logged-in users and sets <html lang>", async () => {
    seedSession();
    const api = mockApi({ ...feedRoutes([]), "PUT /users/me/settings/language": noContent() });
    const { user } = renderApp("/");

    await user.click(screen.getByRole("button", { name: en.settings.japanese }));

    expect(await screen.findByText(ja.hero.tagline)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ja");
    expect(api.calls("PUT /users/me/settings/language")[0].json()).toEqual({ preferred_language: "ja" });
  });

  it("reverts when saving fails, and says so", async () => {
    seedSession();
    mockApi({ ...feedRoutes([]), "PUT /users/me/settings/language": apiError(500, "internal_error") });
    const { user } = renderApp("/");

    await user.click(screen.getByRole("button", { name: en.settings.japanese }));

    expect(await screen.findByText(en.settings.languageSaveFailed)).toBeInTheDocument();
    expect(screen.getByText(en.hero.tagline)).toBeInTheDocument();
  });

  it("switches locally without an API call when anonymous", async () => {
    const api = mockApi(feedRoutes([]));
    const { user } = renderApp("/");
    await user.click(screen.getByRole("button", { name: en.settings.japanese }));
    expect(await screen.findByText(ja.hero.tagline)).toBeInTheDocument();
    expect(api.calls("PUT /users/me/settings/language")).toHaveLength(0);
  });
});
