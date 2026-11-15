import { createContext, useContext } from "react";
import type { Post } from "../types/post";
import type { Author } from "../types/auth";

/** The loaded pages of the reel for one set of rules (filterKey). */
export type LoadedPages = { key: string; posts: Post[]; hasMore: boolean };

/**
 * Held above the routes (FeedStateProvider in Layout), so it survives going
 * to a post and back: returning lands on the work that was opened, without
 * refetching.
 */
export type FeedState = {
    pages: LoadedPages | null;
    setPages: (update: (current: LoadedPages | null) => LoadedPages | null) => void;
    /** The post last opened from a reel, so returning lands on it. */
    lastViewed: number | null;
    setLastViewed: (id: number | null) => void;
    /** The work on screen in a reel, so log in / sign up can stage the same photograph. */
    inView: Post | null;
    setInView: (post: Post | null) => void;
    /** People who have posted (GET /users), once loaded. */
    authors: Author[] | null;
    setAuthors: (authors: Author[]) => void;
    /** Bumped when posts change (publish, edit, delete), so counts and lists reload. */
    generation: number;
    /** A post was published or deleted: drop the loaded pages and counts. */
    invalidate: () => void;
    /** A post was edited: replace it in the loaded pages. */
    patchPost: (post: Post) => void;
};

export const FeedStateContext = createContext<FeedState | null>(null);

export function useFeedState(): FeedState {
    const v = useContext(FeedStateContext);
    if (!v) throw new Error("useFeedState needs <FeedStateProvider>");
    return v;
}
