import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "../lang/LanguageContext";
import { makePost } from "../test/fixtures";
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
