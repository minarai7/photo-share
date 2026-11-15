import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, activeFilters, clearedFilter, filterKey, filterSearch, parseFilter } from "./filter";

const parse = (s: string) => parseFilter(new URLSearchParams(s));

describe("feed filter in the URL", () => {
    it("reads sort, by and only", () => {
        expect(parse("sort=oldest&by=2,5&only=series")).toEqual({ sort: "oldest", authors: [2, 5], photos: "series" });
    });

    it("falls back to the defaults for anything unknown", () => {
        expect(parse("sort=popular&by=x,-1,0,3,3&only=many")).toEqual({ sort: "newest", authors: [3], photos: "any" });
        expect(parse("")).toEqual(DEFAULT_FILTER);
    });

    it("writes only what differs from the default, and round-trips", () => {
        expect(filterSearch(DEFAULT_FILTER)).toBe("");
        const f = { sort: "most" as const, authors: [4, 1], photos: "single" as const };
        expect(filterSearch(f)).toBe("?sort=most&by=4%2C1&only=single");
        expect(parse(filterSearch(f).slice(1))).toEqual(f);
        expect(filterSearch(f, { withAuthors: false })).toBe("?sort=most&only=single");
    });

    it("counts filters but never the sort", () => {
        expect(activeFilters({ ...DEFAULT_FILTER, sort: "oldest" })).toBe(0);
        expect(activeFilters({ sort: "newest", authors: [1, 2], photos: "series" })).toBe(3);
    });

    it("clears filters but keeps the sort", () => {
        expect(clearedFilter({ sort: "oldest", authors: [1], photos: "single" })).toEqual({ ...DEFAULT_FILTER, sort: "oldest" });
    });

    it("keys differ for different rules", () => {
        expect(filterKey(DEFAULT_FILTER)).not.toBe(filterKey({ ...DEFAULT_FILTER, authors: [1] }));
    });
});
