import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en, ja } from "../lang";
import { feedRoutes } from "../test/feedApi";
import { makeListPost, makePost, makeUser, seedSession } from "../test/fixtures";
import { apiError, deferred, mockApi, noContent, ok } from "../test/mockApi";
import { renderApp } from "../test/renderApp";

const series = makePost({
    id: 10,
    image_path: "/uploads/a.jpg",
    thumbnail_path: "/uploads/a_w800.jpg",
    caption: "Harbour at dusk",
    camera_body: "FUJIFILM X-T5",
    lens: "XF23mmF1.4",
    location: "Kyoto",
    created_at: "2026-08-14T08:00:00Z",
    tint: "#e6ebe0",
    images: [
        { image_path: "/uploads/a.jpg", thumbnail_path: "/uploads/a_w800.jpg" },
        { image_path: "/uploads/b.jpg" },
        { image_path: "/uploads/c.jpg" },
    ],
});

const photo = (i: number) => screen.getByRole("img", { name: en.post.photoOf("Harbour at dusk", i, 3) });

describe("post view", () => {
    it("renders at once from the reel's copy (cover + count) and fills in the photos when the fetch lands", async () => {
        const fetch = deferred();
        mockApi({ "GET /posts/10": fetch.handler });
        renderApp({ pathname: "/posts/10", state: { post: makeListPost(series), image: 0, returnTo: "/" } });

        expect(photo(1)).toHaveAttribute("src", "http://api.test/uploads/a.jpg");
        // Photos 2 and 3 are placeholders, so the pager already reads 1/3.
        expect(screen.queryByRole("img", { name: en.post.photoOf("Harbour at dusk", 2, 3) })).not.toBeInTheDocument();
        expect(screen.getByRole("status", { name: en.post.photoPosition(1, 3) })).toBeInTheDocument();

        await act(async () => fetch.resolve(ok(series)));
        // The next photo loads (off screen, so hidden from the accessibility tree).
        await waitFor(() =>
            expect(screen.getByRole("img", { hidden: true, name: en.post.photoOf("Harbour at dusk", 2, 3) })).toHaveAttribute("src", "http://api.test/uploads/b.jpg"),
        );
    });

    it("opens on the photo carried from the reel (2 of 3 stays 2 of 3)", async () => {
        mockApi({ "GET /posts/10": ok(series) });
        renderApp({ pathname: "/posts/10", state: { post: series, image: 1, returnTo: "/" } });
        expect(screen.getByRole("status", { name: en.post.photoPosition(2, 3) })).toBeInTheDocument();
    });

    it("pages the series with the pager and the arrow keys", async () => {
        mockApi({ "GET /posts/10": ok(series) });
        const { user } = renderApp("/posts/10");
        await screen.findByRole("status", { name: en.post.photoPosition(1, 3) });
        await user.click(screen.getByRole("button", { name: en.post.nextPhoto }));
        expect(screen.getByRole("status", { name: en.post.photoPosition(2, 3) })).toBeInTheDocument();
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("status", { name: en.post.photoPosition(3, 3) })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: en.post.nextPhoto })).toBeDisabled();
    });

    it("shows the wall label: author, title and year, place, gear with Find, the date", async () => {
        mockApi({ "GET /posts/10": ok(series) });
        renderApp("/posts/10");
        const label = await screen.findByRole("region", { name: en.post.about });
        expect(within(label).getByRole("link", { name: "alice" })).toHaveAttribute("href", "/users/1");
        expect(label).toHaveTextContent("Harbour at dusk, 2026");
        expect(label).toHaveTextContent("Kyoto");
        expect(within(label).getByRole("button", { name: en.gear.findLabel("FUJIFILM X-T5") })).toBeInTheDocument();
        expect(within(label).getByRole("button", { name: en.gear.findLabel("XF23mmF1.4") })).toBeInTheDocument();
        expect(label).toHaveTextContent("2026.08.14");
        // Not the owner: no Manage.
        expect(within(label).queryByRole("button", { name: en.post.manage })).not.toBeInTheDocument();
    });

    it("Info says where it goes", async () => {
        mockApi({ "GET /posts/10": ok(series) });
        renderApp("/posts/10");
        expect(await screen.findByRole("button", { name: en.post.infoDown })).toHaveAttribute("aria-controls", "post-details");
    });

    it("Close goes back to where the post was opened from", async () => {
        mockApi({ ...feedRoutes([series]), "GET /posts/10": ok(series), "GET /users/1": ok({ id: 1, username: "alice", post_count: 1, photo_count: 3, created_at: "" }) });
        const { user, currentPath } = renderApp({ pathname: "/posts/10", state: { post: series, returnTo: "/users/1" } });
        await user.click(screen.getByRole("button", { name: en.header.closeToProfile }));
        expect(currentPath()).toBe("/users/1");
    });

    it("Esc leaves for the feed when there is nowhere to go back to", async () => {
        mockApi({ ...feedRoutes([series]), "GET /posts/10": ok(series) });
        const { currentPath } = renderApp("/posts/10");
        await screen.findByRole("region", { name: en.post.about });
        fireEvent.keyDown(document.body, { key: "Escape" });
        expect(currentPath()).toBe("/");
    });

    it("turns the lights out with F or a click on the photo, and back on with Esc", async () => {
        mockApi({ "GET /posts/10": ok(series) });
        const { user } = renderApp("/posts/10");
        await screen.findByRole("region", { name: en.post.about });

        fireEvent.keyDown(document.body, { key: "f" });
        const lights = screen.getByRole("dialog", { name: en.post.lightsOut("Harbour at dusk") });
        expect(within(lights).getByRole("img", { name: en.post.photoOf("Harbour at dusk", 1, 3) })).toBeInTheDocument();
        fireEvent.keyDown(document.body, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: en.post.viewFull(en.post.photoOf("Harbour at dusk", 1, 3)) }));
        expect(screen.getByRole("dialog", { name: en.post.lightsOut("Harbour at dusk") })).toBeInTheDocument();
        await user.click(within(screen.getByRole("dialog")).getByRole("img", { name: en.post.photoOf("Harbour at dusk", 1, 3) }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("says a deleted post isn't here any more", async () => {
        mockApi({ "GET /posts/10": apiError(404, "post_not_found") });
        renderApp({ pathname: "/posts/10", state: { post: series } });
        expect(await screen.findByRole("alert")).toHaveTextContent(en.apiErrors.postNotFound);
    });

    it("keeps the reel's copy on screen when only the refresh fails", async () => {
        mockApi({ "GET /posts/10": apiError(500, "internal_error") });
        renderApp({ pathname: "/posts/10", state: { post: series } });
        await waitFor(() => expect(photo(1)).toBeInTheDocument());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("asks the gear lookup to answer in the reader's language", async () => {
        seedSession(makeUser({ id: 9, username: "zed" }));
        const api = mockApi({
            "GET /posts/10": ok(series),
            "POST /ai/gear-link": ok({
                kind: "camera",
                name: "FUJIFILM X-T5",
                summary: "4020万画素のAPS-Cミラーレスカメラ。",
                suggestions: [{ title: "X-T5 | 富士フイルム", url: "https://www.fujifilm.com/jp/ja/consumer/digitalcameras/x/fujifilm-x-t5", reason: "メーカー公式の製品ページ。", confidence: "high" }],
            }),
        });
        const { user } = renderApp("/posts/10", { language: "ja" });
        const label = await screen.findByRole("region", { name: ja.post.about });
        await user.click(within(label).getByRole("button", { name: ja.gear.findLabel("FUJIFILM X-T5") }));

        expect(api.calls("POST /ai/gear-link")[0].json()).toEqual({ kind: "camera", name: "FUJIFILM X-T5", language: "ja" });
        expect(await screen.findByRole("link", { name: "X-T5 | 富士フイルム" })).toHaveAttribute("href", expect.stringContaining("/jp/ja/"));
        expect(screen.getByText("メーカー公式の製品ページ。")).toBeInTheDocument();
    });

    it("renders in Japanese", async () => {
        mockApi({ "GET /posts/10": ok({ ...series, caption: "海辺の生きもの" }) });
        renderApp("/posts/10", { language: "ja" });
        expect(await screen.findByRole("button", { name: ja.post.infoDown })).toHaveTextContent(ja.post.info);
        expect(screen.getByRole("button", { name: ja.header.closeToFeed })).toBeInTheDocument();
        expect(screen.getByText("海辺の生きもの", { selector: "h1" })).toHaveClass("is-ja");
        // The wall label sets a Japanese title off from its year with a full-width space, not ", ".
        // (Raw textContent: toHaveTextContent folds the full-width space into " ".)
        expect(screen.getByRole("region", { name: ja.post.about }).querySelector(".wall-title")?.textContent).toBe("海辺の生きもの　2026");
    });
});

describe("owner actions", () => {
    function asOwner() {
        seedSession(makeUser({ id: 1, username: "alice" }));
    }

    it("Manage opens to Edit · Delete; Edit saves in a dialog with a toast", async () => {
        asOwner();
        const api = mockApi({
            "GET /posts/10": ok(series),
            "PUT /posts/10": (call) => ok({ ...series, ...(call.json() as object) }),
        });
        const { user } = renderApp("/posts/10");
        const label = await screen.findByRole("region", { name: en.post.about });

        await user.click(within(label).getByRole("button", { name: en.post.manage }));
        await user.click(within(label).getByRole("button", { name: en.post.edit }));
        const dialog = await screen.findByRole("dialog", { name: en.editPost.title });
        const title = within(dialog).getByLabelText(en.editPost.caption);
        expect(title).toHaveValue("Harbour at dusk");
        await user.clear(title);
        await user.type(title, "Harbour, blue hour");
        await user.clear(within(dialog).getByLabelText(en.editPost.place));
        await user.click(within(dialog).getByRole("button", { name: en.editPost.save }));

        expect(api.calls("PUT /posts/10")[0].json()).toEqual({ caption: "Harbour, blue hour", camera_body: "FUJIFILM X-T5", lens: "XF23mmF1.4" });
        expect(await screen.findByText(en.toast.updated)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(label).toHaveTextContent("Harbour, blue hour, 2026");
    });

    it("shows a save error inside the dialog", async () => {
        asOwner();
        mockApi({ "GET /posts/10": ok(series), "PUT /posts/10": apiError(403, "forbidden") });
        const { user } = renderApp("/posts/10");
        const label = await screen.findByRole("region", { name: en.post.about });
        await user.click(within(label).getByRole("button", { name: en.post.manage }));
        await user.click(within(label).getByRole("button", { name: en.post.edit }));
        const dialog = await screen.findByRole("dialog", { name: en.editPost.title });
        await user.click(within(dialog).getByRole("button", { name: en.editPost.save }));
        expect(await within(dialog).findByRole("alert")).toHaveTextContent(en.apiErrors.forbidden);
    });

    it("Delete confirms in a dialog, then deletes, toasts and leaves", async () => {
        asOwner();
        const api = mockApi({ ...feedRoutes([]), "GET /posts/10": ok(series), "DELETE /posts/10": noContent() });
        const { user, currentPath } = renderApp({ pathname: "/posts/10", state: { post: series, returnTo: "/" } });
        const label = await screen.findByRole("region", { name: en.post.about });
        await user.click(within(label).getByRole("button", { name: en.post.manage }));
        await user.click(within(label).getByRole("button", { name: en.post.delete }));

        const confirm = await screen.findByRole("alertdialog", { name: en.deletePost.title });
        expect(confirm).toHaveTextContent(en.deletePost.description("Harbour at dusk", 3));
        expect(api.calls("DELETE /posts/10")).toHaveLength(0);
        await user.click(within(confirm).getByRole("button", { name: en.deletePost.confirm }));

        expect(api.calls("DELETE /posts/10")).toHaveLength(1);
        expect(await screen.findByText(en.toast.deleted)).toBeInTheDocument();
        await waitFor(() => expect(currentPath()).toBe("/"));
    });

    it("Cancel keeps the post", async () => {
        asOwner();
        const api = mockApi({ "GET /posts/10": ok(series), "DELETE /posts/10": noContent() });
        const { user } = renderApp("/posts/10");
        const label = await screen.findByRole("region", { name: en.post.about });
        await user.click(within(label).getByRole("button", { name: en.post.manage }));
        await user.click(within(label).getByRole("button", { name: en.post.delete }));
        const confirm = await screen.findByRole("alertdialog");
        await user.click(within(confirm).getByRole("button", { name: en.deletePost.cancel }));
        expect(api.calls("DELETE /posts/10")).toHaveLength(0);
    });
});
