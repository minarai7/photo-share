import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../lang";
import { makePost, makeUser, seedSession } from "../test/fixtures";
import { apiError, mockApi, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const alice = makeUser({ id: 1, username: "alice" });
const bob = makeUser({ id: 2, username: "bob", email: "bob@example.com" });
const allPosts = [
  makePost({ id: 3, user_id: 2, username: "bob", caption: "Bob's harbour" }),
  makePost({ id: 2, user_id: 1, username: "alice", caption: "Alice's temple" }),
];

describe("ProfilePage", () => {
  it("shows another user's name and only their posts", async () => {
    mockApi({ "GET /posts": ok(allPosts), "GET /users/2": ok(bob) });
    renderApp("/users/2");

    expect(await screen.findByRole("heading", { name: en.profile.userPostsTitle("bob") })).toBeInTheDocument();
    expect(screen.getByText(en.profile.postCount(1))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bob's harbour" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Alice's temple" })).not.toBeInTheDocument();
  });

  it("uses the session for your own profile and offers to create a first post", async () => {
    seedSession(alice);
    // No GET /users/1 route: the page must not need it for the logged-in user.
    const api = mockApi({ "GET /posts": ok([allPosts[0]]) });
    renderApp("/users/1");

    expect(await screen.findByRole("heading", { name: en.profile.userPostsTitle("alice") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.profile.createFirstPost })).toHaveAttribute("href", "/posts/new");
    expect(api.calls("GET /users/1")).toHaveLength(0);
  });

  it("shows the right name after navigating from your own profile to someone else's", async () => {
    seedSession(alice);
    mockApi({ "GET /posts": ok(allPosts), "GET /users/2": ok(bob) });
    const { navigate } = renderApp("/users/1");
    await screen.findByRole("heading", { name: en.profile.userPostsTitle("alice") });

    navigate("/users/2");

    expect(await screen.findByRole("heading", { name: en.profile.userPostsTitle("bob") })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: en.profile.createFirstPost })).not.toBeInTheDocument();
  });

  it("shows a translated error when the user does not exist", async () => {
    mockApi({ "GET /posts": ok([]), "GET /users/99": apiError(404, "user_not_found") });
    renderApp("/users/99");
    expect(await screen.findByText(en.apiErrors.userNotFound)).toBeInTheDocument();
  });

  it("rejects a non-numeric id without calling the API", async () => {
    const api = mockApi({});
    renderApp("/users/abc");
    expect(await screen.findByText(en.validation.invalidUserId)).toBeInTheDocument();
    expect(api.fetch).not.toHaveBeenCalled();
  });
});
