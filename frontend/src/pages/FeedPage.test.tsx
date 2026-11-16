import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en, ja } from "../lang";
import { feedRoutes } from "../test/feedApi";
import { makeAuthor, makeListPost, makePost, makePublicUser, makeUser, seedSession } from "../test/fixtures";
import { apiError, deferred, mockApi, ok } from "../test/mockApi";
import { showInView } from "../test/intersection";
import { renderApp } from "../test/renderApp";

const alice = makeAuthor({ id: 1, username: "alice", post_count: 2 });
const bob = makeAuthor({ id: 2, username: "bob", post_count: 1 });
const carol = makeAuthor({ id: 5, username: "carol", post_count: 1 });

const posts = [
    makePost({ id: 30, user_id: 1, username: "alice", caption: "Harbour at dusk", image_count: 3, tint: "#e6ebe0" }),
    makePost({ id: 20, user_id: 2, username: "bob", caption: "Snowfield" }),
    makePost({ id: 10, user_id: 5, username: "carol", caption: "海辺の生きもの", image_count: 2 }),
    makePost({ id: 5, user_id: 1, username: "alice", caption: "Morning light" }),
];

describe("feed", () => {
    it("shows a visitor the landing hero, every work as a slide, and the Index link", async () => {
        mockApi(feedRoutes(posts, [alice, bob, carol]));
        renderApp("/");

        expect(screen.getByText(en.hero.tagline)).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: en.hero.signup })[0]).toHaveAttribute("href", "/signup");
        for (const p of posts) {
            expect(await screen.findByRole("heading", { name: new RegExp(p.caption) })).toBeInTheDocument();
        }
        expect(await screen.findByRole("button", { name: en.header.indexLabel(en.header.allWorks(4)) })).toBeInTheDocument();
        // The whole set is loaded: the end card, not a loading card.
        expect(screen.getByText(en.reel.endHere)).toBeInTheDocument();
    });

    it("opens a work with the post and the photo carried in router state", async () => {
        mockApi({ ...feedRoutes(posts), "GET /posts/30": ok(posts[0]) });
        const { user, currentPath } = renderApp("/");
        const slide = await screen.findByRole("region", { name: "Harbour at dusk" });
        await user.click(within(slide).getAllByRole("link", { name: en.reel.openWork("Harbour at dusk") })[0]);
        expect(currentPath()).toBe("/posts/30");
        // It renders at once from the router state (no wait for the fetch).
        expect(screen.getByRole("img", { name: en.post.photoOf("Harbour at dusk", 1, 3) })).toBeInTheDocument();
    });

    it("sends the rules in the URL to the API and reads 'N of M works'", async () => {
        const api = mockApi(feedRoutes(posts, [alice, bob, carol]));
        renderApp("/?sort=oldest&by=2,5&only=series");

        expect(await screen.findByRole("button", { name: en.header.indexLabel(en.header.someWorks(1, 4)) })).toBeInTheDocument();
        const list = api.calls("GET /posts").find((c) => c.query.get("limit"));
        expect(list?.query.get("sort")).toBe("oldest");
        expect(list?.query.get("user_ids")).toBe("2,5");
        expect(list?.query.get("photos")).toBe("series");
        // One count for everything, one for the rules.
        const counts = api.calls("GET /posts/count").map((c) => c.query.toString());
        expect(counts).toContain("");
        expect(counts).toContain("user_ids=2%2C5&photos=series");
    });

    it("names active filters under the wordmark; Clear keeps the sort", async () => {
        mockApi(feedRoutes(posts, [alice, bob, carol]));
        const { user, currentPath } = renderApp("/?sort=oldest&by=2,5&only=series");
        const isLine = (_: string, el: Element | null) => el?.classList.contains("filterline") ?? false;

        // Never over the hero: it appears once a work is on screen.
        const slide = await screen.findByRole("region", { name: "海辺の生きもの" });
        expect(screen.queryByText(isLine)).not.toBeInTheDocument();
        showInView(slide);

        const line = await screen.findByText(isLine);
        await waitFor(() => expect(line).toHaveTextContent(`${en.filterLine.byTwo("bob", "carol")} · ${en.filterLine.seriesOnly}`));
        await user.click(within(line).getByRole("button", { name: en.filterLine.clear }));
        expect(currentPath()).toBe("/");
        expect(screen.queryByText((_, el) => el?.classList.contains("filterline") ?? false)).not.toBeInTheDocument();
    });

    it("changes the rules from the Index, re-querying the API", async () => {
        const api = mockApi(feedRoutes(posts, [alice, bob, carol]));
        const { user } = renderApp("/");

        await user.click(await screen.findByRole("button", { name: en.header.indexLabel(en.header.allWorks(4)) }));
        const sheet = await screen.findByRole("dialog", { name: en.index.title });
        await user.click(within(sheet).getByRole("button", { name: en.index.most }));
        await waitFor(() => expect(api.calls("GET /posts").some((c) => c.query.get("sort") === "most")).toBe(true));

        await user.click(within(sheet).getByRole("button", { name: en.index.series }));
        await waitFor(() => expect(within(sheet).getByRole("status")).toHaveTextContent(en.index.someWorks(2, 4)));
        expect(within(sheet).getByRole("button", { name: en.index.clearAll })).toBeInTheDocument();
    });

    it("keeps the contact sheet while new rules load: never 'nothing matches' in between", async () => {
        const most = deferred();
        mockApi({
            ...feedRoutes(posts, [alice, bob, carol]),
            "GET /posts": (call) => (call.query.get("sort") === "most" ? most.handler() : feedRoutes(posts)["GET /posts"](call)),
        });
        const { user } = renderApp("/");
        await user.click(await screen.findByRole("button", { name: en.header.indexLabel(en.header.allWorks(4)) }));
        const sheet = await screen.findByRole("dialog", { name: en.index.title });
        await within(sheet).findByText("Snowfield");

        await user.click(within(sheet).getByRole("button", { name: en.index.most }));
        // Still loading: the previous works stay, the sheet stays open, nothing says "no match".
        expect(within(sheet).getByText("Snowfield")).toBeInTheDocument();
        expect(within(sheet).queryByText(en.index.nothing)).not.toBeInTheDocument();
        expect(within(sheet).getByRole("region", { name: en.index.worksLabel })).toHaveAttribute("aria-busy", "true");

        await act(async () => most.resolve(ok([makeListPost(posts[0])])));
        await waitFor(() => expect(within(sheet).queryByText("Snowfield")).not.toBeInTheDocument());
        expect(within(sheet).getByText("Harbour at dusk")).toBeInTheDocument();
    });

    it("pages the contact sheet in: work 21 loads when the end of the sheet comes into view", async () => {
        const many = Array.from({ length: 21 }, (_, i) => makePost({ id: 100 - i, caption: `Work ${i + 1}` }));
        mockApi({
            ...feedRoutes(many),
            "GET /posts": (call) => ok(call.query.get("before_id") ? many.slice(20) : many.slice(0, 20)),
        });
        const { user } = renderApp("/");
        await user.click(await screen.findByRole("button", { name: en.header.indexLabel(en.header.allWorks(21)) }));
        const sheet = await screen.findByRole("dialog", { name: en.index.title });
        const sentinel = await within(sheet).findByText(en.reel.loading);
        showInView(sentinel);
        expect(await within(sheet).findByText("Work 21")).toBeInTheDocument();
        expect(within(sheet).queryByText(en.reel.loading)).not.toBeInTheDocument();
    });

    it("says in the Index when the next works failed to load, with a retry", async () => {
        const many = Array.from({ length: 21 }, (_, i) => makePost({ id: 100 - i, caption: `Work ${i + 1}` }));
        let fail = true;
        mockApi({
            ...feedRoutes(many),
            "GET /posts": (call) =>
                call.query.get("before_id") ? (fail ? apiError(500, "list_posts_failed") : ok(many.slice(20))) : ok(many.slice(0, 20)),
        });
        const { user } = renderApp("/");
        await user.click(await screen.findByRole("button", { name: en.header.indexLabel(en.header.allWorks(21)) }));
        const sheet = await screen.findByRole("dialog", { name: en.index.title });
        showInView(await within(sheet).findByText(en.reel.loading));

        expect(await within(sheet).findByText(en.apiErrors.listPostsFailed)).toBeInTheDocument();
        fail = false;
        await user.click(within(sheet).getByRole("button", { name: en.reel.retry }));
        expect(await within(sheet).findByText("Work 21")).toBeInTheDocument();
    });

    it("shows people in the Index and picking one person turns the reel into their profile", async () => {
        mockApi({ ...feedRoutes(posts, [alice, bob, carol]), "GET /users/5": ok(makePublicUser({ id: 5, username: "carol", post_count: 1, photo_count: 2 })) });
        const { user } = renderApp("/");
        await user.click(await screen.findByRole("button", { name: en.header.indexLabel(en.header.allWorks(4)) }));
        const sheet = await screen.findByRole("dialog", { name: en.index.title });
        await user.click(await within(sheet).findByRole("button", { name: "carol" }));
        await user.click(within(sheet).getByRole("button", { name: en.header.close }));

        expect(await screen.findByRole("heading", { level: 1, name: "carol" })).toBeInTheDocument();
        expect(screen.getByText(en.hero.stats(1, 2))).toBeInTheDocument();
        expect(await screen.findByText(en.reel.endBy("carol"))).toBeInTheDocument();
    });

    it("loads the next page as the end nears, with the sort's own cursor", async () => {
        const many = Array.from({ length: 21 }, (_, i) =>
            makePost({ id: 100 - i, caption: `Work ${i}`, image_count: 3 - Math.floor(i / 10), created_at: `2026-10-${String(28 - i).padStart(2, "0")}T08:00:00Z` }),
        );
        const api = mockApi({
            ...feedRoutes(many),
            "GET /posts": (call) => ok(call.query.get("before_id") ? many.slice(20) : many.slice(0, 20)),
        });
        renderApp("/?sort=most");

        const near = await screen.findByRole("region", { name: "Work 17" });
        expect(api.calls("GET /posts").filter((c) => c.query.get("before_id"))).toHaveLength(0);
        showInView(near);

        expect(await screen.findByRole("region", { name: "Work 20" })).toBeInTheDocument();
        const next = api.calls("GET /posts").find((c) => c.query.get("before_id"))!;
        expect(next.query.get("sort")).toBe("most");
        expect(next.query.get("before_id")).toBe("81");
        expect(next.query.get("before_created_at")).toBe(many[19].created_at);
        expect(next.query.get("before_image_count")).toBe("2");
        // A page shorter than the limit is the last: the end card.
        expect(await screen.findByText(en.reel.endHere)).toBeInTheDocument();
    });

    it("says when nothing matches, with a way out", async () => {
        mockApi({ ...feedRoutes(posts, [alice, bob]), "GET /users/2": ok(makePublicUser({ id: 2, username: "bob" })) });
        const { user, currentPath } = renderApp("/?by=2&only=series");
        expect(await screen.findByText(en.reel.noMatch)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: en.reel.clearFilters }));
        expect(currentPath()).toBe("/");
    });

    it("says when there are no works at all", async () => {
        mockApi(feedRoutes([]));
        renderApp("/");
        expect(await screen.findByText(en.reel.noWorksYet)).toBeInTheDocument();
    });

    it("shows a load error in words, and retries", async () => {
        let fail = true;
        mockApi({
            ...feedRoutes(posts),
            "GET /posts": (call) => (fail ? apiError(500, "list_posts_failed") : feedRoutes(posts)["GET /posts"](call)),
        });
        const { user } = renderApp("/");
        expect(await screen.findByText(en.apiErrors.listPostsFailed)).toBeInTheDocument();
        fail = false;
        await user.click(screen.getByRole("button", { name: en.reel.retry }));
        expect(await screen.findByRole("heading", { name: /Snowfield/ })).toBeInTheDocument();
    });

    it("says 'One moment…' while the first page loads", async () => {
        const page = deferred();
        mockApi({ ...feedRoutes(posts), "GET /posts": page.handler });
        renderApp("/");
        expect(screen.getByText(en.reel.loading)).toBeInTheDocument();
        await act(async () => page.resolve(ok([])));
        expect(await screen.findByText(en.reel.noWorksYet)).toBeInTheDocument();
    });

    it("signs a member out from the landing hero with a toast", async () => {
        seedSession(makeUser({ id: 1, username: "alice" }));
        mockApi(feedRoutes(posts));
        const { user } = renderApp("/");
        await user.click(screen.getByRole("button", { name: en.hero.logout }));
        expect(await screen.findByText(en.toast.signedOut)).toBeInTheDocument();
        expect(localStorage.getItem("auth_token")).toBeNull();
        // Logged out, the site is back in its default language, Japanese.
        expect(screen.getAllByRole("link", { name: ja.header.login }).length).toBeGreaterThan(0);
        expect(document.documentElement.lang).toBe("ja");
    });

    it("renders in Japanese", async () => {
        mockApi(feedRoutes(posts));
        renderApp("/", { language: "ja" });
        expect(screen.getByText(ja.hero.tagline)).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: ja.header.indexLabel(ja.header.allWorks(4)) })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /海辺の生きもの/ })).toHaveClass("is-ja");
    });
});

describe("profile", () => {
    it("is the reel with the person pinned: hero, counts, their works, Sort and Only from the URL", async () => {
        const api = mockApi({ ...feedRoutes(posts), "GET /users/1": ok(makePublicUser({ id: 1, username: "alice", post_count: 2, photo_count: 4 })) });
        renderApp("/users/1?sort=oldest&only=single");

        expect(await screen.findByRole("heading", { level: 1, name: "alice" })).toBeInTheDocument();
        expect(screen.getByText(en.hero.stats(2, 4))).toBeInTheDocument();
        const list = api.calls("GET /posts").find((c) => c.query.get("limit"));
        expect(list?.query.get("user_ids")).toBe("1");
        expect(list?.query.get("sort")).toBe("oldest");
        expect(list?.query.get("photos")).toBe("single");
        expect(await screen.findByRole("heading", { name: /Morning light/ })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /Snowfield/ })).not.toBeInTheDocument();
        expect(screen.getByText(en.reel.endBy("alice"))).toBeInTheDocument();
    });

    it("gives the owner New post · All works · Log out; All works goes to the feed keeping the sort", async () => {
        seedSession(makeUser({ id: 1, username: "alice" }));
        mockApi({ ...feedRoutes(posts), "GET /users/1": ok(makePublicUser({ id: 1, username: "alice" })) });
        const { user, currentPath } = renderApp("/users/1?sort=oldest");

        await screen.findByRole("heading", { level: 1, name: "alice" });
        const hero = screen.getByRole("heading", { level: 1, name: "alice" }).closest("section")!;
        expect(within(hero).getByRole("link", { name: en.hero.newPost })).toBeInTheDocument();
        expect(within(hero).getByRole("button", { name: en.hero.logout })).toBeInTheDocument();
        await user.click(within(hero).getByRole("button", { name: en.hero.allWorks }));
        expect(currentPath()).toBe("/");
    });

    it("shows another person's hero without actions", async () => {
        seedSession(makeUser({ id: 9, username: "zed" }));
        mockApi({ ...feedRoutes(posts), "GET /users/2": ok(makePublicUser({ id: 2, username: "bob" })) });
        renderApp("/users/2");
        const hero = (await screen.findByRole("heading", { level: 1, name: "bob" })).closest("section")!;
        expect(within(hero).queryByRole("button", { name: en.hero.logout })).not.toBeInTheDocument();
    });

    it("tells a member with no works to post their first, instead of a scroll cue that leads nowhere", async () => {
        seedSession(makeUser({ id: 7, username: "newbie" }));
        mockApi({ ...feedRoutes(posts), "GET /users/7": ok(makePublicUser({ id: 7, username: "newbie", post_count: 0, photo_count: 0 })) });
        renderApp("/users/7");

        const hero = (await screen.findByRole("heading", { level: 1, name: "newbie" })).closest("section")!;
        expect(await within(hero).findByText(en.hero.firstWork)).toBeInTheDocument();
        expect(within(hero).getByRole("link", { name: en.hero.newPost })).toHaveAttribute("href", "/posts/new");
        expect(within(hero).queryByText(en.hero.scroll)).not.toBeInTheDocument();
        // The default photograph stands in for a work.
        expect(hero.querySelector("img.hero-img")).toHaveAttribute("src", expect.stringContaining("empty-hero"));
        // Nothing below the hero to scroll to.
        expect(screen.queryByText(en.reel.noWorksYet)).not.toBeInTheDocument();
    });

    it("says someone else hasn't posted yet", async () => {
        mockApi({ ...feedRoutes(posts), "GET /users/8": ok(makePublicUser({ id: 8, username: "quiet", post_count: 0, photo_count: 0 })) });
        renderApp("/users/8");
        const hero = (await screen.findByRole("heading", { level: 1, name: "quiet" })).closest("section")!;
        expect(await within(hero).findByText(en.hero.noWorksBy("quiet"))).toBeInTheDocument();
        expect(within(hero).queryByRole("link", { name: en.hero.newPost })).not.toBeInTheDocument();
        expect(within(hero).queryByText(en.hero.scroll)).not.toBeInTheDocument();
    });

    it("names the person in the filter line of their profile, without loading everyone", async () => {
        const api = mockApi({ ...feedRoutes(posts), "GET /users/1": ok(makePublicUser({ id: 1, username: "alice", post_count: 2 })) });
        renderApp("/users/1");
        showInView(await screen.findByRole("region", { name: "Morning light" }));
        const line = await screen.findByText((_, el) => el?.classList.contains("filterline") ?? false);
        await waitFor(() => expect(line).toHaveTextContent(en.filterLine.byOne("alice")));
        expect(line).not.toHaveTextContent("#1");
        expect(api.calls("GET /users")).toHaveLength(0);
    });

    it("sets a Japanese name and place upright in Japanese type inside the English credit line", async () => {
        const jp = makePost({ id: 77, user_id: 9, username: "あんじゅ", caption: "朝霧の川", location: "京都・嵐山" });
        mockApi(feedRoutes([jp]));
        renderApp("/");
        const slide = await screen.findByRole("region", { name: "朝霧の川" });
        expect(within(slide).getByText("あんじゅ")).toHaveAttribute("lang", "ja");
        expect(within(slide).getByText("京都・嵐山")).toHaveClass("ja-text");
    });

    it("says there is no one here for an unknown person", async () => {
        mockApi({ ...feedRoutes([]), "GET /users/404": apiError(404, "user_not_found") });
        renderApp("/users/404");
        expect(await screen.findByRole("heading", { name: en.notFound.userMessage })).toBeInTheDocument();
    });

    it("says the same for an id that isn't a number", () => {
        renderApp("/users/abc");
        expect(screen.getByRole("heading", { name: en.notFound.userMessage })).toBeInTheDocument();
    });
});
