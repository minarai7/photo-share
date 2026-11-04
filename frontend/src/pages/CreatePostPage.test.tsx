import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../config/upload";
import { en } from "../lang";
import { makePost, seedSession } from "../test/fixtures";
import { apiError, mockApi, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const photo = () => new File(["fake-jpeg-bytes"], "sunset.jpg", { type: "image/jpeg" });

describe("CreatePostPage", () => {
  beforeEach(() => {
    seedSession();
    // jsdom has no object URLs; the page uses one for the preview.
    URL.createObjectURL = vi.fn(() => "blob:preview");
  });

  it("requires a photo", async () => {
    const api = mockApi({});
    const { user } = renderApp("/posts/new");

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    expect(screen.getByText(en.validation.photoRequired)).toBeInTheDocument();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("uploads the image, then creates the post with trimmed fields and blanks omitted", async () => {
    const api = mockApi({
      "POST /uploads": ok({ image_path: "/uploads/123_abc.jpg" }, 201),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    expect(screen.getByAltText(en.posts.selectedPreviewAlt)).toHaveAttribute("src", "blob:preview");

    await user.type(screen.getByLabelText(en.posts.title), "  Golden hour  ");
    await user.type(screen.getByLabelText(en.posts.location), "  Kamakura ");
    await user.type(screen.getByLabelText(en.posts.lens), "   ");
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));

    const upload = api.calls("POST /uploads")[0];
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get("image")).toBeInstanceOf(File);

    expect(api.calls("POST /posts")[0].json()).toEqual({
      image_path: "/uploads/123_abc.jpg",
      caption: "Golden hour",
      location: "Kamakura",
    });
  });

  it("tells the user the maximum file size", () => {
    mockApi({});
    renderApp("/posts/new");

    expect(screen.getByText(en.posts.maxImageSize(MAX_UPLOAD_MB))).toBeInTheDocument();
    expect(MAX_UPLOAD_MB).toBe(32);
  });

  it("rejects a photo over the size limit without uploading it", async () => {
    const api = mockApi({});
    const { user } = renderApp("/posts/new");

    const tooBig = photo();
    Object.defineProperty(tooBig, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await user.upload(screen.getByLabelText(en.posts.photo), tooBig);

    expect(screen.getByText(en.validation.photoTooLarge(MAX_UPLOAD_MB))).toBeInTheDocument();
    expect(screen.queryByAltText(en.posts.selectedPreviewAlt)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    expect(screen.getByText(en.validation.photoRequired)).toBeInTheDocument();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("accepts a photo of exactly the size limit", async () => {
    mockApi({});
    const { user } = renderApp("/posts/new");

    const atLimit = photo();
    Object.defineProperty(atLimit, "size", { value: MAX_UPLOAD_BYTES });
    await user.upload(screen.getByLabelText(en.posts.photo), atLimit);

    expect(screen.getByAltText(en.posts.selectedPreviewAlt)).toBeInTheDocument();
    expect(screen.queryByText(en.validation.photoTooLarge(MAX_UPLOAD_MB))).not.toBeInTheDocument();
  });

  it("does not create a post when the upload is rejected", async () => {
    const api = mockApi({ "POST /uploads": apiError(400, "invalid_file_type") });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    expect(await screen.findByText(en.apiErrors.invalidFileType)).toBeInTheDocument();
    expect(api.calls("POST /posts")).toHaveLength(0);
    expect(currentPath()).toBe("/posts/new");
  });
});
