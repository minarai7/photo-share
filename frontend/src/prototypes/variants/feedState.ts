// Feed sort/filter rules and "where was I" memory for the Immersive screens.
// Held above the screens so they survive going to a post and back.
import { createContext, useContext, type RefObject } from "react";

/** The reel's scroll container, for scroll-linked motion inside it (undefined = the window). */
export const ReelContainerContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);
import type { ProtoPost } from "../data";
import type { OptionDef } from "../protoContext";

export type SortKey = "newest" | "oldest" | "most";

/** How many photos a post has: any, a series (2+), or a single photo (round 10). */
export type PhotoCount = "any" | "series" | "single";

export type FeedFilter = {
    sort: SortKey;
    /** Author user ids; empty = everyone. */
    authors: number[];
    photos: PhotoCount;
};

export const DEFAULT_FILTER: FeedFilter = { sort: "newest", authors: [], photos: "any" };

export const SORT_LABELS: Record<SortKey, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    most: "Most photos",
};

export function applyFilter(posts: ProtoPost[], f: FeedFilter): ProtoPost[] {
    const kept = posts.filter(
        (p) =>
            (f.authors.length === 0 || f.authors.includes(p.user_id)) &&
            (f.photos === "any" || (f.photos === "series" ? p.images.length > 1 : p.images.length === 1)),
    );
    const time = (p: ProtoPost) => new Date(p.created_at).getTime();
    return kept.sort((a, b) =>
        f.sort === "oldest" ? time(a) - time(b)
        : f.sort === "most" ? b.images.length - a.images.length || time(b) - time(a)
        : time(b) - time(a),
    );
}

/**
 * How many rules narrow the set. Sort only reorders, so it never makes
 * "10 of 10 works", a filter line (round 11) or a "Clear all" (round 12).
 */
export function activeFilters(f: FeedFilter): number {
    return f.authors.length + (f.photos !== "any" ? 1 : 0);
}

/** Stable key: the reel re-mounts (back to the top) when the rules change. */
export function filterKey(f: FeedFilter): string {
    return [f.sort, f.authors.join(","), f.photos].join("|");
}

/** "original": native snap reel, window-scrolled profile, plain post view. "b": see Combined.tsx. */
export type Tuning = "original" | "b";

/**
 * Open decisions as mix-and-match rows in the harness options panel (Combined
 * and Combined B). Decided and removed: Back = the shared Close and Index link
 * = "4 of 10 works" (round 4); scroll cue = the drawn line (round 5); post
 * details = Fullscreen + Info with Info scrolling down to the details (round 6);
 * no "Full screen" text, clicking the photo opens a distraction-free view (round 7);
 * details = the wall label, full view = lights out with the label below (round 8);
 * scrolling = Combined B, post page = photo / label in two snapped screens (round 9).
 * Feed motion = Settle (round 11). One reel, the header holding only + New /
 * Log in and the Index link, Edit / Delete behind "Manage" (round 12).
 * Hero text = Corner shade (round 14). Header over a hero = Halo only, Close =
 * "− Close" like "+ New" (round 15).
 * Nothing is open; new open decisions go back in here.
 */
export const COMBINED_OPTIONS: OptionDef[] = [];

export type FeedState = {
    tuning: Tuning;
    filter: FeedFilter;
    setFilter: (f: FeedFilter) => void;
    /** The post last opened from a reel, so returning lands on it. */
    lastViewed: number | null;
    setLastViewed: (id: number | null) => void;
    /** The work on screen in the feed reel, so log in / sign up can open around the same photograph. */
    inView: number | null;
    setInView: (id: number | null) => void;
};

export const FeedStateContext = createContext<FeedState | null>(null);

export function useFeedState(): FeedState {
    const v = useContext(FeedStateContext);
    if (!v) throw new Error("useFeedState needs <FeedStateProvider>");
    return v;
}
