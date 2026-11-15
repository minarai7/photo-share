import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGES_PER_POST, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../config/upload";
import { en, ja } from "../lang";
import type { UploadImageResponse } from "../types/upload";
import { jpegWithGear } from "../test/exifBytes";
import { makePost, seedSession } from "../test/fixtures";
import { apiError, mockApi, ok, type RecordedCall } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const photo = (name = "sunset.jpg", type = "image/jpeg") => new File(["fake-jpeg-bytes"], name, { type });

/** Upload replies in call order; the image path names the uploaded file. */
function uploadsReturning(...extras: Partial<UploadImageResponse>[]) {
    let n = 0;
    return (call: RecordedCall) => {
        const file = (call.body as FormData).get("image") as File;
        const extra = extras[n++] ?? {};
        return ok({ image_path: `/uploads/${file.name}`, ...extra }, 201);
    };
}

const picker = () => screen.getByLabelText(en.compose.choosePhotos, { selector: "input" });

describe("new post", () => {
    beforeEach(() => {
        seedSession();
        // jsdom has no object URLs; the page uses them for the previews.
        let n = 0;
        URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`);
        URL.revokeObjectURL = vi.fn();
    });

    it("is a live preview: the typed title and place appear in the slide", async () => {
        mockApi({});
        const { user } = renderApp("/posts/new");
        expect(screen.getByRole("heading", { name: en.compose.title })).toBeInTheDocument();
        const stage = screen.getByRole("region", { name: en.compose.preview });
        expect(stage).toHaveTextContent(en.compose.untitled);
        expect(within(stage).getByRole("button", { name: new RegExp(en.compose.choosePhotos) })).toHaveTextContent(
            en.compose.limits(MAX_IMAGES_PER_POST, MAX_UPLOAD_MB),
        );

        await user.type(screen.getByLabelText(en.compose.caption), "Golden hour");
        await user.type(screen.getByLabelText(en.compose.place), "Kamakura");
        expect(stage).toHaveTextContent("Golden hour");
        expect(stage).toHaveTextContent("Kamakura");
    });

    it("requires a photo", async () => {
        const api = mockApi({});
        const { user } = renderApp("/posts/new");
        await user.click(screen.getByRole("button", { name: en.compose.publish }));
        expect(screen.getByRole("alert")).toHaveTextContent(en.validation.photoRequired);
        expect(api.fetch).not.toHaveBeenCalled();
    });

    it("shows camera and lens from the photo as placeholders before anything is uploaded", async () => {
        const api = mockApi({});
        const { user } = renderApp("/posts/new");
        await user.upload(picker(), jpegWithGear("DSCF4021.JPG", "FUJIFILM", "X-T5", "XF33mmF1.4 R LM WR"));

        await waitFor(() => expect(screen.getByLabelText(en.compose.camera)).toHaveAttribute("placeholder", "FUJIFILM X-T5"));
        expect(screen.getByLabelText(en.compose.lens)).toHaveAttribute("placeholder", "XF33mmF1.4 R LM WR");
        expect(screen.getByText(en.compose.gearHint)).toBeInTheDocument();
        expect(screen.getByRole("region", { name: en.compose.preview })).toHaveTextContent("FUJIFILM X-T5 · XF33mmF1.4 R LM WR");
        expect(api.fetch).not.toHaveBeenCalled();
    });

    it("uploads one at a time in filmstrip order, then publishes, toasts and opens the new post", async () => {
        const api = mockApi({
            "POST /uploads": uploadsReturning({ thumbnail_path: "/uploads/a_w800.jpg" }, {}),
            "POST /posts": ok(makePost({ id: 42, caption: "Golden hour" }), 201),
            "GET /posts/42": ok(makePost({ id: 42, caption: "Golden hour" })),
        });
        const { user, currentPath } = renderApp("/posts/new");

        await user.upload(picker(), [photo("a.jpg"), jpegWithGear("b.jpg", "SONY", "ILCE-7C")]);
        expect(screen.getByRole("img", { name: en.compose.coverAlt("a.jpg") })).toHaveAttribute("src", "blob:preview-1");
        expect(screen.getByText(en.compose.cover)).toBeInTheDocument();
        await user.type(screen.getByLabelText(en.compose.caption), "  Golden hour  ");
        await user.type(screen.getByLabelText(en.compose.place), "  Kamakura ");
        await user.type(screen.getByLabelText(en.compose.lens), "   ");
        await user.click(screen.getByRole("button", { name: en.compose.publish }));

        await waitFor(() => expect(currentPath()).toBe("/posts/42"));
        expect(api.calls("POST /uploads").map((c) => ((c.body as FormData).get("image") as File).name)).toEqual(["a.jpg", "b.jpg"]);
        // The camera read in the browser fills the blank field; blank lens is omitted.
        expect(api.calls("POST /posts")[0].json()).toEqual({
            images: [{ image_path: "/uploads/a.jpg", thumbnail_path: "/uploads/a_w800.jpg" }, { image_path: "/uploads/b.jpg" }],
            caption: "Golden hour",
            location: "Kamakura",
            camera_body: "SONY ILCE-7C",
        });
        expect(await screen.findByText(en.toast.published)).toBeInTheDocument();
    });

    it("falls back to the server's EXIF reading when the browser found none", async () => {
        const api = mockApi({
            "POST /uploads": uploadsReturning({ camera_body: "NIKON Z 9", lens: "NIKKOR Z 50mm" }),
            "POST /posts": ok(makePost({ id: 42 }), 201),
            "GET /posts/42": ok(makePost({ id: 42 })),
        });
        const { user } = renderApp("/posts/new");
        await user.upload(picker(), photo());
        await user.type(screen.getByLabelText(en.compose.camera), "My camera");
        await user.click(screen.getByRole("button", { name: en.compose.publish }));
        await waitFor(() => expect(api.calls("POST /posts")).toHaveLength(1));
        expect(api.calls("POST /posts")[0].json()).toMatchObject({ camera_body: "My camera", lens: "NIKKOR Z 50mm" });
    });

    it("says 'Uploading 1 / 2' while it runs", async () => {
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        mockApi({
            "POST /uploads": async (call) => {
                await held;
                return uploadsReturning()(call);
            },
            "POST /posts": ok(makePost({ id: 42 }), 201),
            "GET /posts/42": ok(makePost({ id: 42 })),
        });
        const { user } = renderApp("/posts/new");
        await user.upload(picker(), [photo("a.jpg"), photo("b.jpg")]);
        await user.click(screen.getByRole("button", { name: en.compose.publish }));
        const button = await screen.findByRole("button", { name: new RegExp(en.compose.uploading) });
        expect(button).toBeDisabled();
        expect(within(button).getByRole("status", { name: "1 / 2" })).toBeInTheDocument();
        release();
    });

    it("doesn't re-upload photos that already went through when publishing is retried", async () => {
        let createFails = true;
        const api = mockApi({
            "POST /uploads": uploadsReturning(),
            "POST /posts": () => (createFails ? apiError(500, "create_post_failed") : ok(makePost({ id: 42 }), 201)),
            "GET /posts/42": ok(makePost({ id: 42 })),
        });
        const { user, currentPath } = renderApp("/posts/new");
        await user.upload(picker(), [photo("a.jpg"), photo("b.jpg")]);
        await user.click(screen.getByRole("button", { name: en.compose.publish }));
        expect(await screen.findByRole("alert")).toHaveTextContent(en.apiErrors.createPostFailed);

        createFails = false;
        await user.click(screen.getByRole("button", { name: en.compose.publish }));
        await waitFor(() => expect(currentPath()).toBe("/posts/42"));
        expect(api.calls("POST /uploads")).toHaveLength(2);
    });

    it("refuses files that are too large or not JPEG/PNG/WebP, and more than the limit", async () => {
        mockApi({});
        const { user } = renderApp("/posts/new");
        const big = photo("big.jpg");
        Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
        await user.upload(picker(), big);
        expect(screen.getByRole("alert")).toHaveTextContent(en.validation.photoTooLarge(MAX_UPLOAD_MB));

        fireEvent.change(picker(), { target: { files: [photo("anim.gif", "image/gif")] } });
        expect(screen.getByRole("alert")).toHaveTextContent(en.validation.photoWrongType);

        const many = Array.from({ length: MAX_IMAGES_PER_POST + 2 }, (_, i) => photo(`p${i}.jpg`));
        fireEvent.change(picker(), { target: { files: many } });
        expect(screen.getByRole("alert")).toHaveTextContent(en.validation.tooManyPhotos(MAX_IMAGES_PER_POST));
        expect(screen.getAllByRole("button", { name: /^Photo \d+ of 10/ })).toHaveLength(MAX_IMAGES_PER_POST);
        // Full: no add tile.
        expect(screen.queryByRole("button", { name: en.compose.addPhotos })).not.toBeInTheDocument();
    });

    it("removes a photo; the next one becomes the cover", async () => {
        mockApi({});
        const { user } = renderApp("/posts/new");
        await user.upload(picker(), [photo("a.jpg"), photo("b.jpg")]);
        await user.click(screen.getByRole("button", { name: en.compose.removePhoto(1) }));
        expect(screen.getByRole("img", { name: en.compose.coverAlt("b.jpg") })).toBeInTheDocument();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    });

    it("Close goes back to the feed when opened directly", async () => {
        mockApi({ "GET /posts": ok([]), "GET /posts/count": ok({ count: 0 }), "GET /users": ok([]) });
        const { user, currentPath } = renderApp("/posts/new");
        await user.click(screen.getByRole("button", { name: en.header.closeToFeed }));
        expect(currentPath()).toBe("/");
    });

    it("Esc does the same, but not while typing in a field", async () => {
        mockApi({ "GET /posts": ok([]), "GET /posts/count": ok({ count: 0 }), "GET /users": ok([]) });
        const { currentPath } = renderApp("/posts/new");
        fireEvent.keyDown(screen.getByLabelText(en.compose.caption), { key: "Escape" });
        expect(currentPath()).toBe("/posts/new");
        fireEvent.keyDown(document.body, { key: "Escape" });
        expect(currentPath()).toBe("/");
    });
    it("renders in Japanese", () => {
        mockApi({});
        renderApp("/posts/new", { language: "ja" });
        expect(screen.getByRole("heading", { name: ja.compose.title })).toBeInTheDocument();
        expect(screen.getByLabelText(ja.compose.camera)).toHaveAttribute("placeholder", ja.compose.fromPhoto);
        expect(screen.getByRole("button", { name: ja.compose.publish })).toBeInTheDocument();
    });
});
