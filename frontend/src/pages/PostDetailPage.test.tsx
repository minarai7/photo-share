import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../lang";
import { makeListPost, makePost, makeUser, seedSession } from "../test/fixtures";
import { apiError, deferred, mockApi, noContent, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const post = makePost({ id: 10, user_id: 1, caption: "Morning light", location: "Kyoto" });

describe("PostDetailPage", () => {
  it("shows the post to anonymous visitors, without edit controls", async () => {
    mockApi({ "GET /posts/10": ok(post) });
    renderApp("/posts/10");

    expect(await screen.findByRole("heading", { name: "Morning light" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Morning light" })).toHaveAttribute("src", "http://api.test/uploads/photo.jpg");
    expect(screen.getByText("Kyoto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.posts.edit })).not.toBeInTheDocument();
  });

  it("shows the full-size original, not the grid thumbnail", async () => {
    mockApi({ "GET /posts/10": ok({ ...post, thumbnail_path: "/uploads/photo_w800.jpg" }) });
    renderApp("/posts/10");
    expect(await screen.findByRole("img", { name: "Morning light" })).toHaveAttribute("src", "http://api.test/uploads/photo.jpg");
  });

  it("fetches its main image with high priority", async () => {
    mockApi({ "GET /posts/10": ok(post) });
    renderApp("/posts/10");
    expect(await screen.findByRole("img", { name: "Morning light" })).toHaveAttribute("fetchpriority", "high");
  });

  describe("with several images", () => {
    const multi = makePost({
      id: 10,
      caption: "Morning light",
      images: [
        { image_path: "/uploads/1.jpg", thumbnail_path: "/uploads/1_w800.jpg" },
        { image_path: "/uploads/2.png" },
        { image_path: "/uploads/3.webp" },
      ],
      image_path: "/uploads/1.jpg",
      thumbnail_path: "/uploads/1_w800.jpg",
    });
    const shownSrc = () => screen.getByRole("img", { name: "Morning light" }).getAttribute("src");

    it("starts at the first original and steps with the buttons", async () => {
      mockApi({ "GET /posts/10": ok(multi) });
      const { user } = renderApp("/posts/10");

      await screen.findByRole("heading", { name: "Morning light" });
      expect(shownSrc()).toBe("http://api.test/uploads/1.jpg");
      expect(screen.getByText(en.posts.imagePosition(1, 3))).toBeInTheDocument();
      expect(screen.getByRole("button", { name: en.posts.previousImage })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: en.posts.nextImage }));
      expect(shownSrc()).toBe("http://api.test/uploads/2.png");
      expect(screen.getByText(en.posts.imagePosition(2, 3))).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: en.posts.nextImage }));
      expect(shownSrc()).toBe("http://api.test/uploads/3.webp");
      expect(screen.getByRole("button", { name: en.posts.nextImage })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: en.posts.previousImage }));
      expect(shownSrc()).toBe("http://api.test/uploads/2.png");
    });

    it("steps with the arrow keys and jumps with the dots", async () => {
      mockApi({ "GET /posts/10": ok(multi) });
      const { user } = renderApp("/posts/10");

      await screen.findByRole("heading", { name: "Morning light" });
      screen.getByRole("region", { name: "Morning light" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(shownSrc()).toBe("http://api.test/uploads/2.png");
      await user.keyboard("{ArrowLeft}{ArrowLeft}");
      expect(shownSrc()).toBe("http://api.test/uploads/1.jpg");

      const dots = within(screen.getByRole("region", { name: "Morning light" }));
      await user.click(dots.getByRole("button", { name: en.posts.imagePosition(3, 3) }));
      expect(shownSrc()).toBe("http://api.test/uploads/3.webp");
    });

    it("follows a swipe: the slide scrolled into view becomes the current one", async () => {
      mockApi({ "GET /posts/10": ok(multi) });
      renderApp("/posts/10");
      await screen.findByRole("heading", { name: "Morning light" });

      // jsdom has no layout: give the track a width, then scroll it like a
      // finger would (scroll-snap ends on a whole slide).
      const track = document.querySelector(".image-carousel-track") as HTMLElement;
      Object.defineProperty(track, "clientWidth", { configurable: true, value: 400 });
      track.scrollLeft = 400;
      fireEvent.scroll(track);
      expect(screen.getByText(en.posts.imagePosition(2, 3))).toBeInTheDocument();
      expect(shownSrc()).toBe("http://api.test/uploads/2.png");

      track.scrollLeft = 800;
      fireEvent.scroll(track);
      expect(screen.getByText(en.posts.imagePosition(3, 3))).toBeInTheDocument();
      expect(screen.getByRole("button", { name: en.posts.nextImage })).toBeDisabled();
    });

    it("loads a slide's image only once it is shown or next in line", async () => {
      mockApi({ "GET /posts/10": ok(multi) });
      const { user } = renderApp("/posts/10");
      await screen.findByRole("heading", { name: "Morning light" });

      const loaded = () =>
        Array.from(document.querySelectorAll(".image-carousel-slide img")).map((img) => img.getAttribute("src"));
      expect(loaded()).toEqual(["http://api.test/uploads/1.jpg", "http://api.test/uploads/2.png"]);

      await user.click(screen.getByRole("button", { name: en.posts.nextImage }));
      expect(loaded()).toHaveLength(3);
      // Going back keeps what was loaded.
      await user.click(screen.getByRole("button", { name: en.posts.previousImage }));
      expect(loaded()).toHaveLength(3);
    });

    it("opened from the feed, shows every slide's place at once and fills them in when the post arrives", async () => {
      const refresh = deferred();
      mockApi({ "GET /posts/10": refresh.handler });
      // The feed's copy: the cover and the count, no images.
      const listed = makeListPost({ id: 10, caption: "Morning light", image_path: "/uploads/1.jpg", image_count: 3 });
      const { user } = renderApp({ pathname: "/posts/10", state: { post: listed } });

      expect(screen.getByText(en.posts.imagePosition(1, 3))).toBeInTheDocument();
      expect(shownSrc()).toBe("http://api.test/uploads/1.jpg");
      expect(document.querySelectorAll(".image-carousel-slide")).toHaveLength(3);
      await user.click(screen.getByRole("button", { name: en.posts.nextImage }));
      expect(screen.getByText(en.posts.imagePosition(2, 3))).toBeInTheDocument();

      await act(async () => refresh.resolve(ok(multi)));
      expect(await screen.findByRole("img", { name: "Morning light" })).toHaveAttribute("src", "http://api.test/uploads/2.png");
    });

    it("shows a single image without carousel controls", async () => {
      mockApi({ "GET /posts/10": ok(post) });
      renderApp("/posts/10");

      await screen.findByRole("heading", { name: "Morning light" });
      expect(screen.queryByRole("button", { name: en.posts.nextImage })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Morning light" })).not.toBeInTheDocument();
    });
  });

  describe("opened from a card (post in router state)", () => {
    const fromFeed = (statePost = post) => ({
      pathname: "/posts/10",
      state: { returnTo: { pathname: "/", labelKey: "backToFeed" }, post: statePost },
    });

    it("renders the post at once and swaps in the fresh copy when it arrives", async () => {
      const refresh = deferred();
      const api = mockApi({ "GET /posts/10": refresh.handler });
      renderApp(fromFeed());

      // First render, before any fetch resolved: no loading state.
      expect(screen.getByRole("heading", { name: "Morning light" })).toBeInTheDocument();
      expect(screen.queryByText(en.posts.loadingPost)).not.toBeInTheDocument();
      expect(api.calls("GET /posts/10")).toHaveLength(1);

      await act(async () => refresh.resolve(ok({ ...post, caption: "Edited elsewhere" })));
      expect(await screen.findByRole("heading", { name: "Edited elsewhere" })).toBeInTheDocument();
    });

    it("keeps showing the post when the background refresh fails", async () => {
      const refresh = deferred();
      mockApi({ "GET /posts/10": refresh.handler });
      renderApp(fromFeed());

      await act(async () => refresh.resolve(apiError(500, "get_post_failed")));
      expect(screen.getByRole("heading", { name: "Morning light" })).toBeInTheDocument();
      expect(screen.queryByText(en.posts.loadPostFailed)).not.toBeInTheDocument();
    });

    it("shows the not-found error when the post was deleted in the meantime", async () => {
      mockApi({ "GET /posts/10": apiError(404, "post_not_found") });
      renderApp(fromFeed());
      expect(await screen.findByText(en.apiErrors.postNotFound)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Morning light" })).not.toBeInTheDocument();
    });

    describe("after the owner edits the post", () => {
      // First GET answers at once; later ones (refetches) hang, so whatever is
      // on screen afterwards comes from the page's own state, not the API.
      function setUp() {
        seedSession(makeUser({ id: 1 }));
        let gets = 0;
        const later = deferred();
        mockApi({
          "GET /posts/10": () => (++gets === 1 ? ok(post) : later.handler()),
          "PUT /posts/10": ok({ ...post, caption: "Evening light" }),
          "PUT /users/me/settings/language": noContent(),
          "GET /posts": ok([]),
        });
        return { ...renderApp(fromFeed()), refetches: () => gets - 1 };
      }

      async function editCaption(user: ReturnType<typeof renderApp>["user"]) {
        await user.click(await screen.findByRole("button", { name: en.posts.edit }));
        const caption = screen.getByLabelText(en.posts.title);
        await user.clear(caption);
        await user.type(caption, "Evening light");
        await user.click(screen.getByRole("button", { name: en.posts.save }));
        await screen.findByRole("heading", { name: "Evening light" });
      }

      it("keeps the edited version through a language switch", async () => {
        const { user, refetches } = setUp();
        await editCaption(user);

        await user.click(screen.getByRole("button", { name: "JA" }));

        await waitFor(() => expect(refetches()).toBe(1)); // the switch re-ran the fetch
        expect(screen.getByRole("heading", { name: "Evening light" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Morning light" })).not.toBeInTheDocument();
      });

      it("previews the edited version when coming Back to the page", async () => {
        const { user, navigate, currentPath } = setUp();
        await editCaption(user);

        await navigate("/");
        await screen.findByText(en.posts.noPosts);
        await navigate(-1);

        expect(currentPath()).toBe("/posts/10");
        expect(screen.getByRole("heading", { name: "Evening light" })).toBeInTheDocument();
        expect(screen.queryByText(en.posts.loadingPost)).not.toBeInTheDocument();
      });
    });

    it("ignores a state post whose id doesn't match the URL", async () => {
      const refresh = deferred();
      mockApi({ "GET /posts/10": refresh.handler });
      renderApp(fromFeed(makePost({ id: 11, caption: "Some other post" })));

      expect(screen.getByText(en.posts.loadingPost)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Some other post" })).not.toBeInTheDocument();

      await act(async () => refresh.resolve(ok(post)));
      expect(await screen.findByRole("heading", { name: "Morning light" })).toBeInTheDocument();
    });
  });

  it("shows the loading state on a deep link or refresh (no router state)", async () => {
    const refresh = deferred();
    mockApi({ "GET /posts/10": refresh.handler });
    renderApp("/posts/10");

    expect(screen.getByText(en.posts.loadingPost)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Morning light" })).not.toBeInTheDocument();

    await act(async () => refresh.resolve(ok(post)));
    expect(await screen.findByRole("heading", { name: "Morning light" })).toBeInTheDocument();
    expect(screen.queryByText(en.posts.loadingPost)).not.toBeInTheDocument();
  });

  it("has a labelled back link when opened directly (no router state)", async () => {
    mockApi({ "GET /posts/10": ok(post) });
    renderApp("/posts/10");
    expect(await screen.findByRole("link", { name: en.posts.backToFeed })).toHaveAttribute("href", "/");
  });

  it("returns to the profile when opened from one", async () => {
    mockApi({ "GET /posts/10": ok(post) });
    renderApp({ pathname: "/posts/10", state: { returnTo: { pathname: "/users/1", labelKey: "backToProfile" } } });
    expect(await screen.findByRole("link", { name: en.posts.backToProfile })).toHaveAttribute("href", "/users/1");
  });

  it("hides edit controls from logged-in non-owners", async () => {
    seedSession(makeUser({ id: 2, username: "bob" }));
    mockApi({ "GET /posts/10": ok(post) });
    renderApp("/posts/10");

    await screen.findByRole("heading", { name: "Morning light" });
    expect(screen.queryByRole("button", { name: en.posts.edit })).not.toBeInTheDocument();
  });

  it("lets the owner edit and save", async () => {
    seedSession(makeUser({ id: 1 }));
    const api = mockApi({
      "GET /posts/10": ok(post),
      "PUT /posts/10": ok({ ...post, caption: "Evening light", location: null }),
    });
    const { user } = renderApp("/posts/10");

    await user.click(await screen.findByRole("button", { name: en.posts.edit }));
    const caption = screen.getByLabelText(en.posts.title);
    await user.clear(caption);
    await user.type(caption, "Evening light");
    await user.clear(screen.getByLabelText(en.posts.location));
    await user.click(screen.getByRole("button", { name: en.posts.save }));

    expect(await screen.findByRole("heading", { name: "Evening light" })).toBeInTheDocument();
    expect(api.calls("PUT /posts/10")[0].json()).toEqual({ caption: "Evening light" });
  });

  it("lets the owner delete after confirming", async () => {
    seedSession(makeUser({ id: 1 }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = mockApi({ "GET /posts/10": ok(post), "DELETE /posts/10": noContent(), "GET /posts": ok([]) });
    const { user, currentPath } = renderApp("/posts/10");

    await user.click(await screen.findByRole("button", { name: en.posts.edit }));
    await user.click(screen.getByRole("button", { name: en.posts.delete }));

    expect(confirm).toHaveBeenCalledWith(en.posts.deleteConfirm);
    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("DELETE /posts/10")).toHaveLength(1);
  });

  it("does nothing when delete is cancelled", async () => {
    seedSession(makeUser({ id: 1 }));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = mockApi({ "GET /posts/10": ok(post) });
    const { user, currentPath } = renderApp("/posts/10");

    await user.click(await screen.findByRole("button", { name: en.posts.edit }));
    await user.click(screen.getByRole("button", { name: en.posts.delete }));

    expect(api.calls("DELETE /posts/10")).toHaveLength(0);
    expect(currentPath()).toBe("/posts/10");
  });

  it("shows a translated error for a missing post", async () => {
    mockApi({ "GET /posts/404": apiError(404, "post_not_found") });
    renderApp("/posts/404");
    const main = await screen.findByText(en.apiErrors.postNotFound);
    expect(within(main.closest("main")!).getByRole("link", { name: en.posts.backToFeed })).toBeInTheDocument();
  });

  it("rejects a non-numeric id without calling the API", async () => {
    const api = mockApi({});
    renderApp("/posts/abc");
    expect(await screen.findByText(en.posts.invalidPostId)).toBeInTheDocument();
    expect(api.fetch).not.toHaveBeenCalled();
  });
});
