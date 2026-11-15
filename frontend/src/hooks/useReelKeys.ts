import { useEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "../utils/motion";

/** Keys pressed while nothing editable has focus; handlers that act call preventDefault. */
export function useDocumentKeys(handler: (e: KeyboardEvent) => void) {
    const ref = useRef(handler);
    useEffect(() => {
        ref.current = handler;
    });
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const el = e.target as HTMLElement | null;
            if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            ref.current(e);
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);
}

/**
 * Which element (by data-key) is crossing the viewport's middle line.
 * `version` re-observes when the elements change (a reel loading more works).
 */
export function useInViewKey(selector: string, root: HTMLElement | null, version: unknown = 0) {
    const [key, setKey] = useState<string | null>(null);
    useEffect(() => {
        if (!root) return;
        const els = Array.from(root.querySelectorAll<HTMLElement>(selector));
        if (els.length === 0) return;
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) setKey((e.target as HTMLElement).dataset.key ?? null);
                }
            },
            { root, rootMargin: "-50% 0px -50% 0px" },
        );
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [selector, root, version]);
    return key;
}

/** Scroll the reel to the neighbouring child (slide, hero or end card). */
export function stepReel(reel: HTMLElement, dir: 1 | -1): boolean {
    const kids = Array.from(reel.children) as HTMLElement[];
    let current = 0;
    let best = Infinity;
    kids.forEach((k, i) => {
        const d = Math.abs(k.offsetTop - reel.scrollTop);
        if (d < best) {
            best = d;
            current = i;
        }
    });
    const next = current + dir;
    if (next < 0 || next >= kids.length) return false;
    reel.scrollTo({ top: kids[next].offsetTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    return true;
}

/** Wheel input with no gap longer than this is one gesture (trackpad momentum included). */
const GESTURE_GAP_MS = 220;
/** A track that moved sideways this recently may have latched the gesture. */
const LATCH_MS = 600;

/**
 * One record per reel, shared by every photo track in it. (Round 4 bug: each
 * track kept its own record, so after one step the same swipe arriving on the
 * next work's track looked new and stepped again, skipping works.)
 */
const reelGestures = new WeakMap<HTMLElement, { last: number; handling: boolean; busyUntil: number }>();

/**
 * A trackpad gesture that started sideways stays latched to the photo track,
 * swallowing later vertical movement. Hand it over, and only then: a
 * mostly-vertical gesture that begins while the track is (or just was)
 * moving sideways steps the reel once; the rest of that gesture is
 * swallowed, wherever the pointer ends up. Everything else is native snap
 * (DESIGN-SYSTEM.md §7.1).
 */
export function useWheelToPage(trackRef: RefObject<HTMLElement | null>, enabled: boolean, reel: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const track = trackRef.current;
        if (!enabled || !track) return;
        let movedSideways = -Infinity;
        const onTrackScroll = (e: Event) => {
            movedSideways = e.timeStamp;
        };
        const vertical = (e: WheelEvent) => !e.ctrlKey && Math.abs(e.deltaY) > Math.abs(e.deltaX);

        function onWheel(e: WheelEvent) {
            const el = reel.current;
            if (!el) return;
            let g = reelGestures.get(el);
            if (!g) {
                g = { last: -Infinity, handling: false, busyUntil: 0 };
                reelGestures.set(el, g);
            }
            const continuing = e.timeStamp - g.last < GESTURE_GAP_MS;
            g.last = e.timeStamp;
            if (!continuing) {
                g.handling = e.cancelable && vertical(e) && e.timeStamp - movedSideways < LATCH_MS;
                if (g.handling && e.timeStamp >= g.busyUntil) {
                    stepReel(el, e.deltaY > 0 ? 1 : -1);
                    g.busyUntil = e.timeStamp + 700;
                }
            }
            if (g.handling && e.cancelable) e.preventDefault();
        }
        track.addEventListener("scroll", onTrackScroll, { passive: true });
        track.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            track.removeEventListener("scroll", onTrackScroll);
            track.removeEventListener("wheel", onWheel);
        };
    }, [trackRef, enabled, reel]);
}
