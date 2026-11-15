import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * A horizontal scroll-snap track of photos: phones swipe natively, and the
 * pager and ←/→ scroll the same track. `index` follows scrollLeft.
 */
export function useSnapTrack(total: number, initial = 0) {
    const [index, setIndex] = useState(() => Math.max(0, Math.min(initial, total - 1)));
    const trackRef = useRef<HTMLDivElement>(null);
    const target = useRef<{ index: number; until: number } | null>(null);

    // Open on the requested photo without animating (e.g. the 2nd of 3,
    // carried over from the feed into the post view).
    const startAt = useRef(index);
    useLayoutEffect(() => {
        const track = trackRef.current;
        if (track && startAt.current > 0) {
            track.scrollTo({ left: startAt.current * track.clientWidth, behavior: "instant" });
        }
    }, []);

    const go = useCallback(
        (next: number) => {
            const i = Math.max(0, Math.min(next, total - 1));
            setIndex(i);
            const track = trackRef.current;
            if (track) {
                target.current = { index: i, until: Date.now() + 800 };
                track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
            }
        },
        [total],
    );

    function onScroll() {
        const track = trackRef.current;
        if (!track || track.clientWidth === 0) return;
        const shown = Math.max(0, Math.min(Math.round(track.scrollLeft / track.clientWidth), total - 1));
        const t = target.current;
        if (t) {
            if (shown !== t.index && Date.now() < t.until) return;
            target.current = null;
        }
        setIndex(shown);
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "ArrowLeft" && index > 0) {
            e.preventDefault();
            go(index - 1);
        } else if (e.key === "ArrowRight" && index < total - 1) {
            e.preventDefault();
            go(index + 1);
        }
    }

    return { index, go, trackRef, onScroll, onKeyDown };
}
