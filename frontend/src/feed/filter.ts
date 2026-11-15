// The feed's sort and filter rules. They live in the URL
// (/?sort=oldest&by=2,5&only=series) so a filtered feed and a profile can be
// linked; on a profile the person comes from the route (/users/5) instead of
// "by". See DESIGN-SYSTEM.md §6 (Filter panel) and §8 (Feed, Profile).
import type { PhotosFilter, PostQuery, PostSort } from "../api/postsApi";

export type FeedFilter = {
    sort: PostSort;
    /** Author user ids; empty = everyone. */
    authors: number[];
    photos: PhotosFilter;
};

export const DEFAULT_FILTER: FeedFilter = { sort: "newest", authors: [], photos: "any" };

const SORTS: PostSort[] = ["newest", "oldest", "most"];
const PHOTOS: PhotosFilter[] = ["any", "single", "series"];

/** Reads the rules from a query string; anything unknown falls back to the default. */
export function parseFilter(search: URLSearchParams): FeedFilter {
    const sort = search.get("sort") as PostSort | null;
    const only = search.get("only") as PhotosFilter | null;
    const authors = (search.get("by") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n, i, all) => Number.isInteger(n) && n > 0 && all.indexOf(n) === i);
    return {
        sort: sort && SORTS.includes(sort) ? sort : "newest",
        authors,
        photos: only && PHOTOS.includes(only) ? only : "any",
    };
}

/** The query string for the rules, without the defaults ("" for none). */
export function filterSearch(f: FeedFilter, { withAuthors = true } = {}): string {
    const q = new URLSearchParams();
    if (f.sort !== "newest") q.set("sort", f.sort);
    if (withAuthors && f.authors.length > 0) q.set("by", f.authors.join(","));
    if (f.photos !== "any") q.set("only", f.photos);
    const s = q.toString();
    return s ? `?${s}` : "";
}

/**
 * How many rules narrow the set. Sort only reorders, so it never makes
 * "10 of 10 works", a filter line or a "Clear all".
 */
export function activeFilters(f: FeedFilter): number {
    return f.authors.length + (f.photos !== "any" ? 1 : 0);
}

/** Stable key: the reel re-mounts (back to the top) when the rules change. */
export function filterKey(f: FeedFilter): string {
    return [f.sort, f.authors.join(","), f.photos].join("|");
}

/** The rules as the API's list/count filter. */
export function toPostQuery(f: FeedFilter): PostQuery {
    return { userIds: f.authors, photos: f.photos };
}

/** Clearing filters keeps the sort. */
export function clearedFilter(f: FeedFilter): FeedFilter {
    return { ...DEFAULT_FILTER, sort: f.sort };
}
