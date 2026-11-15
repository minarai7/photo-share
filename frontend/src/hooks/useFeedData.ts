import { useEffect, useState } from "react";
import { getAuthors, getUserById } from "../api/authApi";
import { getPostCount, getPosts } from "../api/postsApi";
import { activeFilters, filterKey, toPostQuery, type FeedFilter } from "../feed/filter";
import { useFeedState } from "../feed/useFeedState";
import type { PublicUser } from "../types/auth";
import type { Post } from "../types/post";

/**
 * The Index link's numbers: every work, and the works the filters keep
 * ("4 of 10 works"). null until known.
 */
export function usePostCounts(filter: FeedFilter) {
    const { generation } = useFeedState();
    const narrowed = activeFilters(filter) > 0;
    const key = `${filterKey(filter)}#${generation}`;
    const [counts, setCounts] = useState<{ key: string; total: number; count: number } | null>(null);

    useEffect(() => {
        let live = true;
        Promise.all([getPostCount(), narrowed ? getPostCount(toPostQuery(filter)) : null])
            .then(([total, count]) => {
                if (live) setCounts({ key, total, count: count ?? total });
            })
            .catch((err: unknown) => console.error(err)); // the link then just reads "Index"
        return () => {
            live = false;
        };
    }, [filter, narrowed, key]);

    return counts?.key === key ? { total: counts.total, count: counts.count, narrowed } : null;
}

/** Everyone who has posted, loaded once when `enabled` and kept in the feed state. */
export function useAuthors(enabled: boolean) {
    const { authors, setAuthors } = useFeedState();
    useEffect(() => {
        if (!enabled || authors) return;
        let live = true;
        getAuthors()
            .then((list) => {
                if (live) setAuthors(list);
            })
            .catch((err: unknown) => console.error(err));
        return () => {
            live = false;
        };
    }, [enabled, authors, setAuthors]);
    return authors;
}

/** A person's public profile (name, counts), or the error loading it. */
export function useUserProfile(userId: number | null) {
    const { generation } = useFeedState();
    const [state, setState] = useState<{ userId: number; user: PublicUser | null; error: unknown } | null>(null);
    useEffect(() => {
        if (userId == null) return;
        let live = true;
        getUserById(userId)
            .then((user) => {
                if (live) setState({ userId, user, error: null });
            })
            .catch((err: unknown) => {
                if (live) setState({ userId, user: null, error: err });
            });
        return () => {
            live = false;
        };
    }, [userId, generation]);
    const mine = state?.userId === userId ? state : null;
    return { user: mine?.user ?? null, error: mine?.error ?? null };
}

/**
 * The landing hero's photograph: the newest post's cover (the owner's
 * decision, DESIGN-SYSTEM.md §14). When the reel already shows the newest
 * posts, its first post is used; otherwise it is fetched once.
 */
export function useNewestPost(reelFirst: Post | null, reelIsNewest: boolean) {
    const { generation } = useFeedState();
    const [fetched, setFetched] = useState<{ generation: number; post: Post | null } | null>(null);
    const need = !reelIsNewest;
    useEffect(() => {
        if (!need) return;
        let live = true;
        getPosts({ limit: 1 })
            .then(([post]) => {
                if (live) setFetched({ generation, post: post ?? null });
            })
            .catch((err: unknown) => console.error(err));
        return () => {
            live = false;
        };
    }, [need, generation]);
    if (reelIsNewest) return reelFirst;
    return fetched?.generation === generation ? fetched.post : null;
}
