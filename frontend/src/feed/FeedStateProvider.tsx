import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Author } from "../types/auth";
import type { Post } from "../types/post";
import { FeedStateContext, type FeedState, type LoadedPages } from "./useFeedState";

export function FeedStateProvider({ children }: { children: ReactNode }) {
    const [pages, setPagesState] = useState<LoadedPages | null>(null);
    const [lastViewed, setLastViewed] = useState<number | null>(null);
    const [inView, setInView] = useState<Post | null>(null);
    const [authors, setAuthors] = useState<Author[] | null>(null);
    const [generation, setGeneration] = useState(0);

    const setPages = useCallback((update: (current: LoadedPages | null) => LoadedPages | null) => setPagesState(update), []);

    const invalidate = useCallback(() => {
        setPagesState(null);
        setAuthors(null);
        setLastViewed(null);
        setGeneration((g) => g + 1);
    }, []);

    const patchPost = useCallback((post: Post) => {
        setPagesState((current) =>
            current && {
                ...current,
                // A list item carries no images: keep the list's shape.
                posts: current.posts.map((p) => (p.id === post.id ? { ...p, ...post, images: p.images } : p)),
            },
        );
    }, []);

    const value = useMemo<FeedState>(
        () => ({
            pages, setPages, lastViewed, setLastViewed, inView, setInView, authors, setAuthors, generation, invalidate, patchPost,
        }),
        [pages, setPages, lastViewed, inView, authors, generation, invalidate, patchPost],
    );
    return <FeedStateContext.Provider value={value}>{children}</FeedStateContext.Provider>;
}
