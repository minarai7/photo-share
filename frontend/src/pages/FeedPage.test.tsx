import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EAGER_GRID_IMAGES, FEED_PAGE_SIZE } from "../config/images";
import { en, ja } from "../lang";
import { makeListPost, makePost } from "../test/fixtures";
import { apiError, deferred, mockApi, ok, type RecordedCall } from "../test/mockApi";
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

  describe("pagination", () => {
    // Newest first; created_at pairs repeat so the cursor needs the id too.
    const many = Array.from({ length: FEED_PAGE_SIZE * 2 + 5 }, (_, i) =>
      makeListPost({ id: 500 - i, caption: `Post ${i}`, created_at: `2026-10-01T00:${String(59 - Math.floor(i / 2)).padStart(2, "0")}:00.123456Z` }),
    );
    /** GET /posts that pages `many` by limit + before_id, like the API. */
    const pages = (call: RecordedCall) => {
      const beforeId = call.query.get("before_id");
      const start = beforeId ? many.findIndex((p) => p.id === Number(beforeId)) + 1 : 0;
      return ok(many.slice(start, start + Number(call.query.get("limit"))));
    };

    it("loads the first page, then the next ones from the last post on screen", async () => {
      const api = mockApi({ "GET /posts": pages });
      const { user } = renderApp("/");

      await screen.findByRole("heading", { name: en.posts.feedTitle });
      expect(screen.getAllByRole("article")).toHaveLength(FEED_PAGE_SIZE);
      expect(api.calls("GET /posts")[0].query.get("limit")).toBe(String(FEED_PAGE_SIZE));
      expect(api.calls("GET /posts")[0].query.has("before_id")).toBe(false);

      await user.click(screen.getByRole("button", { name: en.posts.loadMore }));
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(FEED_PAGE_SIZE * 2));
      const second = api.calls("GET /posts")[1].query;
      const lastOfFirst = many[FEED_PAGE_SIZE - 1];
      // The cursor is the last post, its created_at sent back verbatim.
      expect(second.get("before_id")).toBe(String(lastOfFirst.id));
      expect(second.get("before_created_at")).toBe(lastOfFirst.created_at);

      await user.click(screen.getByRole("button", { name: en.posts.loadMore }));
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(many.length));
      // A short page is the last one.
      expect(screen.queryByRole("button", { name: en.posts.loadMore })).not.toBeInTheDocument();
      expect(screen.getByRole("img", { name: `Post ${many.length - 1}` })).toBeInTheDocument();
    });

    it("keeps the loaded posts and lets the user retry when a page fails", async () => {
      let calls = 0;
      mockApi({ "GET /posts": (call) => (++calls === 2 ? apiError(500, "list_posts_failed") : pages(call)) });
      const { user } = renderApp("/");

      await user.click(await screen.findByRole("button", { name: en.posts.loadMore }));
      expect(await screen.findByText(en.apiErrors.listPostsFailed)).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(FEED_PAGE_SIZE);

      await user.click(screen.getByRole("button", { name: en.posts.loadMore }));
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(FEED_PAGE_SIZE * 2));
      expect(screen.queryByText(en.apiErrors.listPostsFailed)).not.toBeInTheDocument();
    });

    it("keeps the loaded pages when the language changes", async () => {
      const api = mockApi({ "GET /posts": pages });
      const { user } = renderApp("/");

      await user.click(await screen.findByRole("button", { name: en.posts.loadMore }));
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(FEED_PAGE_SIZE * 2));

      await user.click(screen.getByRole("button", { name: "JA" }));
      expect(await screen.findByRole("button", { name: ja.posts.loadMore })).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(FEED_PAGE_SIZE * 2);
      expect(api.calls("GET /posts")).toHaveLength(2);
    });

    it("has no Load more button when everything fits on one page", async () => {
      mockApi({ "GET /posts": ok([makeListPost()]) });
      renderApp("/");
      await screen.findByRole("heading", { name: en.posts.feedTitle });
      expect(screen.queryByRole("button", { name: en.posts.loadMore })).not.toBeInTheDocument();
    });
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
