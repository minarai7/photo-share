import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGES_PER_POST, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../config/upload";
import { en } from "../lang";
import type { UploadImageResponse } from "../types/upload";
import { makePost, seedSession } from "../test/fixtures";
import { apiError, mockApi, ok, type RecordedCall } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const photo = (name = "sunset.jpg") => new File(["fake-jpeg-bytes"], name, { type: "image/jpeg" });

/** Upload replies in call order; the image path names the uploaded file. */
function uploadsReturning(...extras: Partial<UploadImageResponse>[]) {
  let n = 0;
  return (call: RecordedCall) => {
    const file = (call.body as FormData).get("image") as File;
    const extra = extras[n++] ?? {};
    return ok({ image_path: `/uploads/${file.name}`, ...extra }, 201);
  };
}

describe("CreatePostPage", () => {
  beforeEach(() => {
    seedSession();
    // jsdom has no object URLs; the page uses them for the previews.
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`);
    URL.revokeObjectURL = vi.fn();
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
    expect(screen.getByAltText(en.posts.selectedPreviewAlt(1))).toHaveAttribute("src", "blob:preview-1");

    await user.type(screen.getByLabelText(en.posts.title), "  Golden hour  ");
    await user.type(screen.getByLabelText(en.posts.location), "  Kamakura ");
    await user.type(screen.getByLabelText(en.posts.lens), "   ");
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));

    const upload = api.calls("POST /uploads")[0];
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get("image")).toBeInstanceOf(File);

    expect(api.calls("POST /posts")[0].json()).toEqual({
      images: [{ image_path: "/uploads/123_abc.jpg" }],
      caption: "Golden hour",
      location: "Kamakura",
    });
  });

  it("passes the upload's thumbnail on to the new post", async () => {
    const api = mockApi({
      "POST /uploads": ok({ image_path: "/uploads/123_abc.png", thumbnail_path: "/uploads/123_abc_w800.jpg" }, 201),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("POST /posts")[0].json()).toEqual({
      images: [{ image_path: "/uploads/123_abc.png", thumbnail_path: "/uploads/123_abc_w800.jpg" }],
      caption: "",
    });
  });

  it("uploads several photos one at a time and posts them in order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const replies = uploadsReturning({ thumbnail_path: "/uploads/a_w800.jpg" });
    const api = mockApi({
      "POST /uploads": async (call) => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return replies(call);
      },
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);
    expect(screen.getByAltText(en.posts.selectedPreviewAlt(3))).toBeInTheDocument();
    expect(screen.getByText(en.posts.coverPhoto)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    await waitFor(() => expect(currentPath()).toBe("/"));

    expect(maxInFlight).toBe(1);
    expect(api.calls("POST /posts")[0].json()).toEqual({
      images: [
        { image_path: "/uploads/a.jpg", thumbnail_path: "/uploads/a_w800.jpg" },
        { image_path: "/uploads/b.jpg" },
        { image_path: "/uploads/c.jpg" },
      ],
      caption: "",
    });
  });

  it("lets the user reorder and remove photos before posting", async () => {
    const api = mockApi({
      "POST /uploads": uploadsReturning(),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

    // c to the front, then drop a (now second).
    await user.click(screen.getByRole("button", { name: en.posts.movePhotoEarlier(3) }));
    await user.click(screen.getByRole("button", { name: en.posts.movePhotoEarlier(2) }));
    expect(screen.getByRole("button", { name: en.posts.movePhotoEarlier(1) })).toBeDisabled();
    expect(screen.getByRole("button", { name: en.posts.movePhotoLater(3) })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: en.posts.removePhoto(2) }));

    expect(screen.queryByAltText(en.posts.selectedPreviewAlt(3))).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1"); // a's preview

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    await waitFor(() => expect(currentPath()).toBe("/"));

    expect(api.calls("POST /uploads")).toHaveLength(2);
    expect(api.calls("POST /posts")[0].json()).toMatchObject({
      images: [{ image_path: "/uploads/c.jpg" }, { image_path: "/uploads/b.jpg" }],
    });
  });

  it(`accepts at most ${MAX_IMAGES_PER_POST} photos`, async () => {
    mockApi({});
    const { user } = renderApp("/posts/new");

    const files = Array.from({ length: MAX_IMAGES_PER_POST + 2 }, (_, i) => photo(`${i}.jpg`));
    await user.upload(screen.getByLabelText(en.posts.photo), files);

    expect(screen.getByText(en.validation.tooManyPhotos(MAX_IMAGES_PER_POST))).toBeInTheDocument();
    expect(screen.getByAltText(en.posts.selectedPreviewAlt(MAX_IMAGES_PER_POST))).toBeInTheDocument();
    expect(screen.queryByAltText(en.posts.selectedPreviewAlt(MAX_IMAGES_PER_POST + 1))).not.toBeInTheDocument();
    // Full: no more can be added.
    expect(screen.getByLabelText(en.posts.photo)).toBeDisabled();
    expect(screen.queryByText(`+ ${en.posts.addMorePhotos}`)).not.toBeInTheDocument();
  });

  it("adds photos chosen later to the end", async () => {
    const api = mockApi({
      "POST /uploads": uploadsReturning(),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo("first.jpg"));
    expect(screen.getByText(`+ ${en.posts.addMorePhotos}`)).toBeInTheDocument();
    await user.upload(screen.getByLabelText(en.posts.photo), [photo("second.jpg"), photo("third.jpg")]);

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("POST /posts")[0].json()).toMatchObject({
      images: [{ image_path: "/uploads/first.jpg" }, { image_path: "/uploads/second.jpg" }, { image_path: "/uploads/third.jpg" }],
    });
  });

  it("does not upload photos again when creating the post is retried", async () => {
    let createAttempts = 0;
    const api = mockApi({
      "POST /uploads": uploadsReturning(),
      "POST /posts": () => (++createAttempts === 1 ? apiError(500, "create_post_failed") : ok(makePost(), 201)),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), [photo("a.jpg"), photo("b.jpg")]);
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    expect(await screen.findByText(en.apiErrors.createPostFailed)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    await waitFor(() => expect(currentPath()).toBe("/"));

    expect(api.calls("POST /uploads")).toHaveLength(2);
    expect(api.calls("POST /posts")).toHaveLength(2);
  });

  it("shows a translated error when the server rejects the thumbnail", async () => {
    mockApi({
      "POST /uploads": ok({ image_path: "/uploads/123_abc.png", thumbnail_path: "/uploads/123_abc_w800.jpg" }, 201),
      "POST /posts": apiError(400, "invalid_thumbnail_path"),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    expect(await screen.findByText(en.apiErrors.invalidThumbnailPath)).toBeInTheDocument();
    expect(currentPath()).toBe("/posts/new");
  });

  it("fills blank camera and lens from the photo's EXIF data", async () => {
    const api = mockApi({
      "POST /uploads": ok(
        { image_path: "/uploads/123_abc.jpg", camera_body: "SONY ILCE-7C", lens: "FE 35mm F1.8" },
        201,
      ),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    expect(screen.getByLabelText(en.posts.camera)).toHaveAttribute("placeholder", en.posts.gearFromPhotoPlaceholder);
    expect(screen.getByLabelText(en.posts.lens)).toHaveAttribute("placeholder", en.posts.gearFromPhotoPlaceholder);

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    await user.type(screen.getByLabelText(en.posts.lens), "   ");
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("POST /posts")[0].json()).toEqual({
      images: [{ image_path: "/uploads/123_abc.jpg" }],
      caption: "",
      camera_body: "SONY ILCE-7C",
      lens: "FE 35mm F1.8",
    });
  });

  it("takes the gear from the first photo that records it", async () => {
    const api = mockApi({
      "POST /uploads": uploadsReturning(
        {}, // a screenshot: no EXIF
        { camera_body: "FUJIFILM X100V" },
        { camera_body: "SONY ILCE-7C", lens: "FE 35mm F1.8" },
      ),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), [photo("a.png"), photo("b.jpg"), photo("c.jpg")]);
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("POST /posts")[0].json()).toMatchObject({
      camera_body: "FUJIFILM X100V",
      lens: "FE 35mm F1.8",
    });
  });

  it("keeps what the user typed over the photo's EXIF data", async () => {
    const api = mockApi({
      "POST /uploads": ok({ image_path: "/uploads/123_abc.jpg", camera_body: "SONY ILCE-7C", lens: "FE 35mm F1.8" }, 201),
      "POST /posts": ok(makePost(), 201),
      "GET /posts": ok([]),
    });
    const { user, currentPath } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    await user.type(screen.getByLabelText(en.posts.camera), " Sony a7C ");
    await user.type(screen.getByLabelText(en.posts.lens), "Zeiss C Sonnar 50mm f/1.5");
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    await waitFor(() => expect(currentPath()).toBe("/"));
    expect(api.calls("POST /posts")[0].json()).toMatchObject({
      camera_body: "Sony a7C",
      lens: "Zeiss C Sonnar 50mm f/1.5",
    });
  });

  it("tells the user the maximum file size and photo count", () => {
    mockApi({});
    renderApp("/posts/new");

    expect(screen.getByText(en.posts.maxImageSize(MAX_UPLOAD_MB))).toBeInTheDocument();
    expect(screen.getByText(en.posts.maxImages(MAX_IMAGES_PER_POST))).toBeInTheDocument();
    expect(MAX_UPLOAD_MB).toBe(32);
    expect(MAX_IMAGES_PER_POST).toBe(10);
  });

  it("rejects a photo over the size limit without uploading it", async () => {
    const api = mockApi({});
    const { user } = renderApp("/posts/new");

    const tooBig = photo();
    Object.defineProperty(tooBig, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await user.upload(screen.getByLabelText(en.posts.photo), tooBig);

    expect(screen.getByText(en.validation.photoTooLarge(MAX_UPLOAD_MB))).toBeInTheDocument();
    expect(screen.queryByAltText(en.posts.selectedPreviewAlt(1))).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));
    expect(screen.getByText(en.validation.photoRequired)).toBeInTheDocument();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("keeps the other photos when one of them is too large", async () => {
    mockApi({});
    const { user } = renderApp("/posts/new");

    const tooBig = photo("big.jpg");
    Object.defineProperty(tooBig, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await user.upload(screen.getByLabelText(en.posts.photo), [photo("a.jpg"), tooBig, photo("b.jpg")]);

    expect(screen.getByText(en.validation.photoTooLarge(MAX_UPLOAD_MB))).toBeInTheDocument();
    expect(screen.getByAltText(en.posts.selectedPreviewAlt(2))).toBeInTheDocument();
    expect(screen.queryByAltText(en.posts.selectedPreviewAlt(3))).not.toBeInTheDocument();
  });

  it("accepts a photo of exactly the size limit", async () => {
    mockApi({});
    const { user } = renderApp("/posts/new");

    const atLimit = photo();
    Object.defineProperty(atLimit, "size", { value: MAX_UPLOAD_BYTES });
    await user.upload(screen.getByLabelText(en.posts.photo), atLimit);

    expect(screen.getByAltText(en.posts.selectedPreviewAlt(1))).toBeInTheDocument();
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

  it("shows a translated error when the post has too many images", async () => {
    mockApi({
      "POST /uploads": uploadsReturning(),
      "POST /posts": apiError(400, "too_many_images"),
    });
    const { user } = renderApp("/posts/new");

    await user.upload(screen.getByLabelText(en.posts.photo), photo());
    await user.click(screen.getByRole("button", { name: en.posts.createPostButton }));

    expect(await screen.findByText(en.apiErrors.tooManyImages)).toBeInTheDocument();
  });
});
