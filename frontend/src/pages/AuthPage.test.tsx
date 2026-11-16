import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../lang";
import { feedRoutes } from "../test/feedApi";
import { makePost, makeToken, makeUser } from "../test/fixtures";
import { apiError, mockApi, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const newest = makePost({ id: 7, caption: "Snowfield at dawn", tint: "#e3e8f4" });

describe("log in", () => {
    it("stages the newest work beside the form when the visitor came from nowhere", async () => {
        mockApi(feedRoutes([newest]));
        renderApp("/login");
        expect(screen.getByRole("heading", { name: en.auth.loginTitle })).toBeInTheDocument();
        expect(screen.getByText(en.auth.loginSubtitle)).toBeInTheDocument();
        expect(await screen.findByRole("img", { name: "Snowfield at dawn" })).toBeInTheDocument();
    });

    it("stages the post the visitor came from, on its shown photo", async () => {
        mockApi(feedRoutes([]));
        const fromPost = {
            pathname: "/posts/3",
            search: "",
            hash: "",
            key: "x",
            state: { post: makePost({ id: 3, caption: "Harbour", images: [{ image_path: "/uploads/1.jpg" }, { image_path: "/uploads/2.jpg" }] }), image: 1 },
        };
        renderApp({ pathname: "/login", state: { from: fromPost } });
        expect(screen.getByRole("img", { name: "Harbour" })).toHaveAttribute("src", "http://api.test/uploads/2.jpg");
    });

    it("checks the fields before calling the API", async () => {
        const api = mockApi(feedRoutes([]));
        const { user } = renderApp("/login");
        await user.click(screen.getByRole("button", { name: en.auth.loginButton }));
        expect(screen.getByText(en.validation.emailInvalid)).toBeInTheDocument();
        expect(screen.getByText(en.validation.passwordRequired)).toBeInTheDocument();
        expect(screen.getByLabelText(en.auth.email)).toHaveAttribute("aria-invalid", "true");
        expect(api.calls("POST /auth/login")).toHaveLength(0);
    });

    it("logs in, says welcome back, applies the user's language and goes where they were headed", async () => {
        const token = makeToken({ userId: 4 });
        const api = mockApi({
            ...feedRoutes([]),
            "POST /auth/login": ok({ token, user: makeUser({ id: 4, username: "bob", preferred_language: "ja" }) }),
        });
        const { user, currentPath } = renderApp({ pathname: "/login", state: { from: { pathname: "/posts/new", search: "", hash: "", key: "k", state: null } } });

        await user.type(screen.getByLabelText(en.auth.email), " bob@example.com ");
        await user.type(screen.getByLabelText(en.auth.password), "hunter22");
        await user.click(screen.getByRole("button", { name: en.auth.loginButton }));

        expect(api.calls("POST /auth/login")[0].json()).toEqual({ email: "bob@example.com", password: "hunter22" });
        await waitFor(() => expect(currentPath()).toBe("/posts/new"));
        expect(localStorage.getItem("auth_token")).toBe(token);
        expect(document.documentElement.lang).toBe("ja");
        expect(await screen.findByText(en.toast.welcomeBack)).toBeInTheDocument();
    });

    it("shows a wrong password as a form error", async () => {
        mockApi({ ...feedRoutes([]), "POST /auth/login": apiError(401, "invalid_credentials") });
        const { user } = renderApp("/login");
        await user.type(screen.getByLabelText(en.auth.email), "bob@example.com");
        await user.type(screen.getByLabelText(en.auth.password), "nope");
        await user.click(screen.getByRole("button", { name: en.auth.loginButton }));
        expect(await screen.findByRole("alert")).toHaveTextContent(en.apiErrors.invalidCredentials);
        expect(screen.getByRole("button", { name: en.auth.loginButton })).toBeEnabled();
    });

    it("swaps to sign up with the alternate link", async () => {
        mockApi(feedRoutes([]));
        const { user, currentPath } = renderApp("/login");
        await user.click(screen.getByRole("button", { name: en.auth.signupLink }));
        expect(currentPath()).toBe("/signup");
        expect(screen.getByRole("heading", { name: en.auth.signupTitle })).toBeInTheDocument();
    });
});

describe("sign up", () => {
    it("asks for a username and 8+ characters", async () => {
        mockApi(feedRoutes([]));
        const { user } = renderApp("/signup");
        await user.type(screen.getByLabelText(en.auth.email), "new@example.com");
        await user.type(screen.getByLabelText(en.auth.password), "short");
        await user.click(screen.getByRole("button", { name: en.auth.signupButton }));
        expect(screen.getByText(en.validation.usernameRequired)).toBeInTheDocument();
        expect(screen.getByText(en.validation.passwordTooShort)).toBeInTheDocument();
    });

    it("creates the account and signs in at once", async () => {
        const token = makeToken({ userId: 8 });
        const api = mockApi({ ...feedRoutes([]), "POST /auth/signup": ok({ token, user: makeUser({ id: 8, username: "newbie" }) }, 201) });
        const { user, currentPath } = renderApp("/signup");
        await user.type(screen.getByLabelText(en.auth.username), "newbie");
        await user.type(screen.getByLabelText(en.auth.email), "new@example.com");
        await user.type(screen.getByLabelText(en.auth.password), "password123");
        await user.click(screen.getByRole("button", { name: en.auth.signupButton }));

        // The language the visitor signed up in becomes their preference.
        expect(api.calls("POST /auth/signup")[0].json()).toEqual({ username: "newbie", email: "new@example.com", password: "password123", preferred_language: "en" });
        await waitFor(() => expect(currentPath()).toBe("/"));
        expect(localStorage.getItem("auth_token")).toBe(token);
        expect(await screen.findByText(en.toast.signedUpAs("newbie"))).toBeInTheDocument();
    });

    it("shows a taken email as a form error", async () => {
        mockApi({ ...feedRoutes([]), "POST /auth/signup": apiError(409, "signup_failed") });
        const { user } = renderApp("/signup");
        await user.type(screen.getByLabelText(en.auth.username), "newbie");
        await user.type(screen.getByLabelText(en.auth.email), "taken@example.com");
        await user.type(screen.getByLabelText(en.auth.password), "password123");
        await user.click(screen.getByRole("button", { name: en.auth.signupButton }));
        expect(await screen.findByRole("alert")).toHaveTextContent(en.apiErrors.signupFailed);
    });
});
