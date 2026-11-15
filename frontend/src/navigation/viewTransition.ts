import { useCallback, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, type NavigateOptions, type To } from "react-router";
import { prefersReducedMotion } from "../utils/motion";

// Screen changes go through the View Transitions API (DESIGN-SYSTEM.md §7.3):
// the old screen crossfades into the new one, the header (view-transition-name
// "header") holds still and the shown photo (workPhoto) moves into place.
// Without the API, or with reduced motion, the change is instant.
//
// A navigation's new screen is ready once the router has committed the new
// location. useSettleViewTransition (in Layout) tells the waiting transition
// so; history moves (Back, Close) only commit after popstate, so a promise is
// the one way to cover both.

let settle: (() => void) | null = null;

/** Longest a transition waits for the new screen before animating anyway. */
const SETTLE_TIMEOUT_MS = 500;

function canTransition(): boolean {
    return !prefersReducedMotion() && typeof document.startViewTransition === "function";
}

/** Runs a navigation inside a view transition that ends once the new location has rendered. */
export function navigateWithTransition(update: () => void) {
    if (!canTransition()) {
        update();
        return;
    }
    document.startViewTransition(
        () =>
            new Promise<void>((resolve) => {
                const timer = window.setTimeout(done, SETTLE_TIMEOUT_MS);
                function done() {
                    window.clearTimeout(timer);
                    if (settle === done) settle = null;
                    resolve();
                }
                settle = done;
                update();
            }),
    );
}

/** A state change on the same screen (lights out) as a view transition. */
export function morph(update: () => void) {
    if (canTransition()) document.startViewTransition(() => flushSync(update));
    else update();
}

/** Mount once inside the router: ends a waiting transition when the new location has committed. */
export function useSettleViewTransition() {
    const location = useLocation();
    useLayoutEffect(() => {
        settle?.();
    }, [location.key]);
}

/** navigate() through a view transition. A number moves through history (-1 = Back). */
export function useGo() {
    const navigate = useNavigate();
    return useCallback(
        (to: To | number, options?: NavigateOptions) =>
            navigateWithTransition(() => {
                if (typeof to === "number") void navigate(to);
                else void navigate(to, options);
            }),
        [navigate],
    );
}
