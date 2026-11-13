import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { en } from "../lang";
import { LanguageProvider } from "../lang/LanguageContext";
import { API, makeListPost, makePost } from "../test/fixtures";
import { PostCard } from "./PostCard";

function renderCard(props: Partial<Parameters<typeof PostCard>[0]> = {}) {
  render(
    <LanguageProvider initialLanguage="en">
      <MemoryRouter>
        <PostCard post={makePost({ caption: "Harbour" })} {...props} />
      </MemoryRouter>
    </LanguageProvider>,
  );
  return screen.getByRole("img", { name: "Harbour" });
}

describe("PostCard image source", () => {
  it("shows the thumbnail when the post has one", () => {
    const img = renderCard({
      post: makePost({ caption: "Harbour", image_path: "/uploads/1_a.png", thumbnail_path: "/uploads/1_a_w800.jpg" }),
    });
    expect(img).toHaveAttribute("src", `${API}/uploads/1_a_w800.jpg`);
  });

  it.each([
    ["null", null],
    ["absent", undefined],
  ])("falls back to the original when thumbnail_path is %s", (_, thumbnail_path) => {
    const img = renderCard({ post: makePost({ caption: "Harbour", image_path: "/uploads/1_a.png", thumbnail_path }) });
    expect(img).toHaveAttribute("src", `${API}/uploads/1_a.png`);
  });

  it("switches to the original when the thumbnail fails to load", () => {
    const img = renderCard({
      post: makePost({ caption: "Harbour", image_path: "/uploads/1_a.png", thumbnail_path: "/uploads/1_a_w800.jpg" }),
    });
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", `${API}/uploads/1_a.png`);

    // If the original fails too, it stays put (no loop).
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", `${API}/uploads/1_a.png`);
  });
});

describe("PostCard photo count", () => {
  it("marks a post with several photos and shows its cover", () => {
    const img = renderCard({
      post: makePost({
        caption: "Harbour",
        image_path: "/uploads/1.jpg",
        thumbnail_path: "/uploads/1_w800.jpg",
        images: [
          { image_path: "/uploads/1.jpg", thumbnail_path: "/uploads/1_w800.jpg" },
          { image_path: "/uploads/2.jpg" },
          { image_path: "/uploads/3.jpg" },
        ],
      }),
    });
    expect(img).toHaveAttribute("src", `${API}/uploads/1_w800.jpg`);
    expect(screen.getByLabelText(en.posts.imageCount(3))).toHaveTextContent("1/3");
  });

  it("takes the count from image_count on a feed post (which has no images)", () => {
    renderCard({ post: makeListPost({ caption: "Harbour", image_count: 4 }) });
    expect(screen.getByLabelText(en.posts.imageCount(4))).toHaveTextContent("1/4");
  });

  it("has no count for a single photo", () => {
    renderCard();
    expect(screen.queryByText(/^1\/\d+$/)).not.toBeInTheDocument();
  });
});

describe("PostCard image loading", () => {
  it("lazy-loads and decodes off the main thread by default", () => {
    const img = renderCard();
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).not.toHaveAttribute("fetchpriority");
  });

  it("loads eagerly when asked (cards on the first screen)", () => {
    const img = renderCard({ eager: true });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("decoding", "async");
  });
});
