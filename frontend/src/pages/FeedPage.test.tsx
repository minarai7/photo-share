import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../lang";
import { makePost } from "../test/fixtures";
import { apiError, mockApi, ok } from "../test/mockApi";
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
