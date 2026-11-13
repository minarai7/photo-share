import { useCallback, useEffect, useRef, useState } from "react";
import { getPosts } from "../api/postsApi";
import { FEED_PAGE_SIZE } from "../config/images";
import type { Post } from "../types/post";

type Options = {
    /** Only this user's posts (a profile); all posts when undefined. */
    userId?: number;
    /** When false nothing is fetched (e.g. the profile's id is invalid). */
    enabled?: boolean;
};

/**
 * Pages through GET /posts newest first: the first page on mount (and when
 * userId changes), the next one on loadMore(). Errors are kept raw, so the
 * caller translates them at render and a language switch doesn't refetch.
 */
export function usePostPages({ userId, enabled = true }: Options = {}) {
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(enabled);
    const [error, setError] = useState<unknown>(null);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState<unknown>(null);

    // Bumped whenever the list starts over, so a response for an older list
    // (another profile, or a load-more still in flight) is dropped.
    const generation = useRef(0);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        const current = ++generation.current;

        async function loadFirstPage() {
            try {
                setIsLoading(true);
                setError(null);
                setLoadMoreError(null);
                setIsLoadingMore(false);

                const page = await getPosts({ userId, limit: FEED_PAGE_SIZE });

                if (generation.current === current) {
                    setPosts(page);
                    setHasMore(page.length === FEED_PAGE_SIZE);
                }
            } catch (err) {
                if (generation.current === current) {
                    console.error(err);
                    setPosts([]);
                    setError(err);
                }
            } finally {
                if (generation.current === current) {
                    setIsLoading(false);
                }
            }
        }

        loadFirstPage();
    }, [userId, enabled]);

    const loadMore = useCallback(async () => {
        const last = posts[posts.length - 1];
        if (!last || isLoadingMore) {
            return;
        }
        const current = generation.current;

        try {
            setIsLoadingMore(true);
            setLoadMoreError(null);

            const page = await getPosts({ userId, limit: FEED_PAGE_SIZE, after: last });

            if (generation.current === current) {
                setPosts((loaded) => {
                    // The cursor never repeats a post; this only guards the keys.
                    const seen = new Set(loaded.map((p) => p.id));
                    return [...loaded, ...page.filter((p) => !seen.has(p.id))];
                });
                setHasMore(page.length === FEED_PAGE_SIZE);
            }
        } catch (err) {
            if (generation.current === current) {
                console.error(err);
                setLoadMoreError(err);
            }
        } finally {
            if (generation.current === current) {
                setIsLoadingMore(false);
            }
        }
    }, [posts, isLoadingMore, userId]);

    return { posts, isLoading, error, hasMore, isLoadingMore, loadMoreError, loadMore };
}
