import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EAGER_GRID_IMAGES } from "../config/images";
import { en } from "../lang";
import { makePost } from "../test/fixtures";
import { apiError, deferred, mockApi, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

describe("FeedPage", () => {
  it("renders every post with author, caption, image and only the metadata that exists", async () => {
    mockApi({
      "GET /posts": ok([
        makePost({ id: 2, username: "bob", caption: "Harbour", location: null, camera_body: "X100V" }),
        makePost({ id: 1, username: "alice", caption: "Temple", location: "Nara" }),
      ]),
    });
    renderApp("/");

    expect(await screen.findByRole("heading", { name: en.posts.feedTitle })).toBeInTheDocument();
    const harbour = screen.getByRole("img", { name: "Harbour" });
    expect(harbour).toHaveAttribute("src", "http://api.test/uploads/photo.jpg");
    expect(harbour.closest("a")).toHaveAttribute("href", "/posts/2");
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("X100V")).toBeInTheDocument();
    expect(screen.getByText("Nara")).toBeInTheDocument();
    // Only one post has a location, so the label appears once.
    expect(screen.getAllByText(en.posts.location)).toHaveLength(1);
  });

  it("loads the first screen of images eagerly and lazy-loads the rest", async () => {
    const posts = Array.from({ length: EAGER_GRID_IMAGES + 3 }, (_, i) =>
      makePost({ id: 100 - i, caption: `Photo ${i}` }),
    );
    mockApi({ "GET /posts": ok(posts) });
    renderApp("/");

    await screen.findByRole("heading", { name: en.posts.feedTitle });
    const loading = screen.getAllByRole("img").map((img) => img.getAttribute("loading"));
    expect(loading).toEqual([
      ...Array(EAGER_GRID_IMAGES).fill("eager"),
      ...Array(3).fill("lazy"),
    ]);
  });

  it("opens a post instantly from the feed, then refreshes it in the background", async () => {
    const refresh = deferred();
    const api = mockApi({
      "GET /posts": ok([makePost({ id: 2, caption: "Harbour" })]),
      "GET /posts/2": refresh.handler,
    });
    const { user, currentPath } = renderApp("/");

    await user.click(await screen.findByRole("img", { name: "Harbour" }));

    expect(currentPath()).toBe("/posts/2");
    expect(screen.getByRole("heading", { name: "Harbour" })).toBeInTheDocument();
    expect(screen.queryByText(en.posts.loadingPost)).not.toBeInTheDocument();
    expect(api.calls("GET /posts/2")).toHaveLength(1);

    await act(async () => refresh.resolve(ok(makePost({ id: 2, caption: "Harbour at dusk" }))));
    expect(await screen.findByRole("heading", { name: "Harbour at dusk" })).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    mockApi({ "GET /posts": ok([]) });
    renderApp("/");
    expect(await screen.findByText(en.posts.noPosts)).toBeInTheDocument();
  });

  it("shows a translated error when loading fails", async () => {
    mockApi({ "GET /posts": apiError(500, "list_posts_failed") });
    renderApp("/");
    expect(await screen.findByText(en.apiErrors.listPostsFailed)).toBeInTheDocument();
  });
});
