import type { CSSProperties } from "react";

/** Motion values JavaScript needs; each mirrors a token in src/design/tokens.css. Change both together. */
export const IDLE_FADE_MS = 2600; // --idle-fade: the post view's header and bar fade when idle at the top
export const IDLE_CURSOR_MS = 1500; // --idle-cursor: lights out hides the cursor
/** Feed motion "Settle": a work arrives at 98.5% and 55% and is flat and full when centred. */
export const SETTLE = { at: [0.2, 0.45, 0.55, 0.8], scale: [0.985, 1, 1, 0.985], opacity: [0.55, 1, 1, 0.55] };

export function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");

/**
 * The name a work's photograph carries through a screen change (View
 * Transitions): the photo on screen moves into its place on the next screen
 * instead of cutting. Give it only to the shown photo of a series, so the
 * name is unique on the page.
 */
export const workPhoto = (postId: number): CSSProperties => ({ viewTransitionName: `work-${postId}` });

/** Japanese titles switch face and drop uppercase and italics (DESIGN-SYSTEM.md §3.3). */
export const isJa = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const yearOf = (iso: string) => new Date(iso).getFullYear();

/** The wall label's date: 2026.08.14. */
export function formatDateDots(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}
