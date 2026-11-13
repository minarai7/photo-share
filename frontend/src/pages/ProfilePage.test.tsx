import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FEED_PAGE_SIZE } from "../config/images";
import { en } from "../lang";
import { makeListPost, makeUser, seedSession } from "../test/fixtures";
import { apiError, mockApi, ok, type RecordedCall } from "../test/mockApi";
import { renderApp } from "../test/renderApp";
import type { Post } from "../types/post";

const alice = makeUser({ id: 1, username: "alice" });
const bob = makeUser({ id: 2, username: "bob", email: "bob@example.com" });
const allPosts = [
  makeListPost({ id: 3, user_id: 2, username: "bob", caption: "Bob's harbour" }),
  makeListPost({ id: 2, user_id: 1, username: "alice", caption: "Alice's temple" }),
];

/** GET /posts that filters by user_id like the API does. */
const postsOf = (posts: Post[]) => (call: RecordedCall) => {
  const userId = call.query.get("user_id");
  return ok(userId ? posts.filter((p) => p.user_id === Number(userId)) : posts);
};

describe("ProfilePage", () => {
  it("asks the API for only that user's posts and shows their name", async () => {
    const api = mockApi({ "GET /posts": postsOf(allPosts), "GET /users/2": ok(bob) });
    renderApp("/users/2");

    expect(await screen.findByRole("heading", { name: en.profile.userPostsTitle("bob") })).toBeInTheDocument();
    expect(screen.getByText(en.profile.postCount(1))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bob's harbour" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Alice's temple" })).not.toBeInTheDocument();

    const query = api.calls("GET /posts")[0].query;
    expect(query.get("user_id")).toBe("2");
    expect(query.get("limit")).toBe(String(FEED_PAGE_SIZE));
  });

  it("uses the session for your own profile and offers to create a first post", async () => {
    seedSession(alice);
    // No GET /users/1 route: the page must not need it for the logged-in user.
    const api = mockApi({ "GET /posts": postsOf([allPosts[0]]) });
    renderApp("/users/1");

    expect(await screen.findByRole("heading", { name: en.profile.userPostsTitle("alice") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.profile.createFirstPost })).toHaveAttribute("href", "/posts/new");
    expect(api.calls("GET /users/1")).toHaveLength(0);
  });

  it("shows the right name after navigating from your own profile to someone else's", async () => {
    seedSession(alice);
    mockApi({ "GET /posts": postsOf(allPosts), "GET /users/2": ok(bob) });
    const { navigate } = renderApp("/users/1");
    await screen.findByRole("heading", { name: en.profile.userPostsTitle("alice") });

    navigate("/users/2");

    expect(await screen.findByRole("heading", { name: en.profile.userPostsTitle("bob") })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: en.profile.createFirstPost })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Alice's temple" })).not.toBeInTheDocument();
  });

  it("pages through a long profile and says the count is at least what is loaded", async () => {
    const many = Array.from({ length: FEED_PAGE_SIZE + 3 }, (_, i) =>
      makeListPost({ id: 1000 - i, user_id: 2, username: "bob", caption: `Bob ${i}`, created_at: `2026-10-${String(28 - Math.floor(i / 2)).padStart(2, "0")}T08:00:00Z` }),
    );
    const api = mockApi({
      "GET /posts": (call) => {
        const beforeId = call.query.get("before_id");
        const start = beforeId ? many.findIndex((p) => p.id === Number(beforeId)) + 1 : 0;
        return ok(many.slice(start, start + Number(call.query.get("limit"))));
      },
      "GET /users/2": ok(bob),
    });
    const { user } = renderApp("/users/2");

    expect(await screen.findByText(en.profile.postCountAtLeast(FEED_PAGE_SIZE))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.posts.loadMore }));

    expect(await screen.findByText(en.profile.postCount(FEED_PAGE_SIZE + 3))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.posts.loadMore })).not.toBeInTheDocument();
    const second = api.calls("GET /posts")[1].query;
    expect(second.get("user_id")).toBe("2");
    expect(second.get("before_id")).toBe(String(many[FEED_PAGE_SIZE - 1].id));
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
    await waitFor(() => expect(api.fetch).not.toHaveBeenCalled());
  });
});
