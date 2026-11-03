import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en, ja } from "../lang";
import { makeToken, makeUser } from "../test/fixtures";
import { apiError, mockApi, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

describe("LoginPage", () => {
  it("validates before calling the API", async () => {
    const api = mockApi({});
    const { user } = renderApp("/login");

    await user.click(screen.getByRole("button", { name: en.auth.loginButton }));
    expect(screen.getByText(en.validation.emailRequired)).toBeInTheDocument();

    await user.type(screen.getByLabelText(en.auth.email), "alice@example.com");
    await user.click(screen.getByRole("button", { name: en.auth.loginButton }));
    expect(screen.getByText(en.validation.passwordRequired)).toBeInTheDocument();

    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("logs in, stores the session, applies the user's language and goes to the feed", async () => {
    const token = makeToken();
    const api = mockApi({
      "POST /auth/login": ok({ token, user: makeUser({ preferred_language: "ja" }) }),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/login");

    await user.type(screen.getByLabelText(en.auth.email), "  alice@example.com  ");
    await user.type(screen.getByLabelText(en.auth.password), "password123");
    await user.click(screen.getByRole("button", { name: en.auth.loginButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("POST /auth/login")[0].json()).toEqual({ email: "alice@example.com", password: "password123" });
    expect(localStorage.getItem("auth_token")).toBe(token);
    expect(await screen.findByRole("button", { name: ja.nav.logout })).toBeInTheDocument();
  });

  it("returns to the page that required login", async () => {
    mockApi({ "POST /auth/login": ok({ token: makeToken(), user: makeUser() }) });
    const { user, currentPath } = renderApp("/posts/new");
    expect(currentPath()).toBe("/login");

    await user.type(screen.getByLabelText(en.auth.email), "alice@example.com");
    await user.type(screen.getByLabelText(en.auth.password), "password123");
    await user.click(screen.getByRole("button", { name: en.auth.loginButton }));

    await waitFor(() => expect(currentPath()).toBe("/posts/new"));
  });

  it("shows the translated backend error on bad credentials", async () => {
    mockApi({ "POST /auth/login": apiError(401, "invalid_credentials", "invalid email or password") });
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText(en.auth.email), "alice@example.com");
    await user.type(screen.getByLabelText(en.auth.password), "wrong");
    await user.click(screen.getByRole("button", { name: en.auth.loginButton }));

    expect(await screen.findByText(en.apiErrors.invalidCredentials)).toBeInTheDocument();
    expect(localStorage.getItem("auth_token")).toBeNull();
  });
});
