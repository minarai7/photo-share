import { useCallback, useEffect, useState } from "react";
import { getPosts } from "../api/postsApi";
import { FEED_PAGE_SIZE } from "../config/images";
import { filterKey, toPostQuery, type FeedFilter } from "../feed/filter";
import { useFeedState } from "../feed/useFeedState";

/**
 * Pages through GET /posts for the rules in `filter` (memoize it per rules):
 * the first page when the rules change, the next one on loadMore(), which
 * the reel calls as its end nears. The loaded pages live in the feed state
 * above the routes, so coming back from a post shows them at once, with no
 * refetch. Errors are kept raw, so the caller translates them at render and
 * a language switch doesn't refetch and drop loaded pages.
 */
export function usePostPages(filter: FeedFilter, { enabled = true } = {}) {
    const { pages, setPages, generation } = useFeedState();
    const key = filterKey(filter);
    const loaded = pages?.key === key ? pages : null;
    const have = loaded !== null;

    const [error, setError] = useState<{ key: string; error: unknown } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [more, setMore] = useState<{ key: string; loading: boolean; error: unknown } | null>(null);

    useEffect(() => {
        if (!enabled || have) {
            return;
        }
        let live = true;
        getPosts({ ...toPostQuery(filter), sort: filter.sort, limit: FEED_PAGE_SIZE })
            .then((page) => {
                if (live) {
                    setPages(() => ({ key, posts: page, hasMore: page.length === FEED_PAGE_SIZE }));
                }
            })
            .catch((err: unknown) => {
                if (live) {
                    console.error(err);
                    setError({ key, error: err });
                }
            });
        return () => {
            live = false;
        };
    }, [filter, key, enabled, have, attempt, generation, setPages]);

    const currentError = error?.key === key ? error.error : null;
    const moreState = more?.key === key ? more : null;
    const loadingMore = moreState?.loading ?? false;

    const loadMore = useCallback(async () => {
        const last = loaded?.posts[loaded.posts.length - 1];
        if (!loaded?.hasMore || !last || loadingMore) {
            return;
        }
        setMore({ key, loading: true, error: null });
        try {
            const page = await getPosts({ ...toPostQuery(filter), sort: filter.sort, limit: FEED_PAGE_SIZE, after: last });
            setPages((current) => {
                if (current?.key !== key) return current;
                // The cursor never repeats a post; this only guards the keys.
                const seen = new Set(current.posts.map((p) => p.id));
                return { key, posts: [...current.posts, ...page.filter((p) => !seen.has(p.id))], hasMore: page.length === FEED_PAGE_SIZE };
            });
            setMore({ key, loading: false, error: null });
        } catch (err) {
            console.error(err);
            setMore({ key, loading: false, error: err });
        }
    }, [loaded, loadingMore, key, filter, setPages]);

    const retry = useCallback(() => {
        setError(null);
        setAttempt((a) => a + 1);
    }, []);

    return {
        posts: loaded?.posts ?? [],
        isLoading: enabled && !have && currentError == null,
        error: currentError,
        hasMore: loaded?.hasMore ?? false,
        isLoadingMore: loadingMore,
        loadMoreError: moreState?.error ?? null,
        loadMore,
        retry,
    };
}
