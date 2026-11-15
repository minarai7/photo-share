import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { flushSync } from "react-dom";
import { ProtoContext, SCREENS, readOptions, readRoute, writeRoute, type OptionDef, type Proto, type Route } from "./protoContext";
import { Exhibition } from "./variants/Exhibition";
import { WallLabel } from "./variants/WallLabel";
import { Immersive } from "./variants/Immersive";
import { Catalogue } from "./variants/Catalogue";
import { Combined } from "./variants/Combined";
import { COMBINED_OPTIONS } from "./variants/feedState";

// Combined is the chosen direction (with the B scrolling since round 9); the rest are retired looks.
const VARIANTS: { name: string; className: string; Component: ComponentType; options?: OptionDef[] }[] = [
    { name: "Combined", className: "v5", Component: Combined, options: COMBINED_OPTIONS },
    { name: "Exhibition", className: "v1", Component: Exhibition },
    { name: "Wall label", className: "v2", Component: WallLabel },
    { name: "Immersive", className: "v3", Component: Immersive },
    { name: "Catalogue", className: "v4", Component: Catalogue },
];

function initialVariant(): number {
    const v = parseInt(new URLSearchParams(location.search).get("v") ?? "", 10);
    return v >= 1 && v <= VARIANTS.length ? v - 1 : 0;
}

/**
 * Screen changes go through the View Transitions API: the old screen
 * crossfades into the new one, elements with a shared view-transition-name
 * (the header, the photo being looked at) hold still or move into place.
 * Without the API, or with reduced motion, the change is instant.
 */
function withViewTransition(update: () => void) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof document.startViewTransition !== "function") {
        update();
        return;
    }
    document.startViewTransition(() => flushSync(update));
}

function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
}

/**
 * Prototype harness: renders one variant at a time, full size, with the
 * picker (verbatim from emilkowalski/skills prototype/PICKER.md) and a screen
 * bar in the same chrome. State lives in the URL (?v=2&s=post&id=112&auth=1)
 * so every screen can be linked and screenshotted; ?chrome=0 or H hides it.
 */
export function Harness() {
    const [current, setCurrent] = useState(initialVariant);
    const [route, setRoute] = useState<Route>(() => readRoute(new URLSearchParams(location.search)));
    const [signedIn, setSignedIn] = useState(() => new URLSearchParams(location.search).get("auth") !== "0");
    const [chrome, setChrome] = useState(() => new URLSearchParams(location.search).get("chrome") !== "0");
    const [mountKey, setMountKey] = useState(0);
    const [portal, setPortal] = useState<HTMLElement | null>(null);
    // Every variant's options share one map (keys are distinct per variant family).
    const [options, setOptions] = useState<Record<string, string>>(() =>
        readOptions(VARIANTS.flatMap((v) => v.options ?? []), new URLSearchParams(location.search)),
    );

    const pickerRef = useRef<HTMLElement>(null);
    const highlightRef = useRef<HTMLSpanElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Each history entry remembers how deep it is and which screen it came from.
    type Entry = { protoDepth: number; prev: Route | null };
    const entry = (): Entry => ({ protoDepth: 0, prev: null, ...(history.state as Partial<Entry> | null) });
    const [depth, setDepth] = useState<number>(() => entry().protoDepth);
    const [previous, setPrevious] = useState<Route | null>(() => entry().prev);

    // Mirror state into the URL (keeping the entry's history data).
    useEffect(() => {
        const url = new URL(location.href);
        url.searchParams.set("v", String(current + 1));
        writeRoute(url, route);
        url.searchParams.set("auth", signedIn ? "1" : "0");
        for (const [k, v] of Object.entries(options)) url.searchParams.set(k, v);
        history.replaceState({ protoDepth: depth, prev: previous }, "", url);
    }, [current, route, signedIn, depth, previous, options]);

    // Browser back/forward walk the same history.
    useEffect(() => {
        function onPop() {
            const e: Entry = { protoDepth: 0, prev: null, ...(history.state as Partial<Entry> | null) };
            withViewTransition(() => {
                setRoute(readRoute(new URLSearchParams(location.search)));
                setDepth(e.protoDepth);
                setPrevious(e.prev);
                window.scrollTo(0, 0);
            });
        }
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const go = useCallback(
        (next: Route) => {
            const target: Route = next.screen === "create" && !signedIn ? { screen: "login" } : next;
            const url = new URL(location.href);
            writeRoute(url, target);
            const nextDepth = depth + 1;
            history.pushState({ protoDepth: nextDepth, prev: route }, "", url);
            withViewTransition(() => {
                setDepth(nextDepth);
                setPrevious(route);
                setRoute(target);
                window.scrollTo(0, 0);
            });
        },
        [signedIn, depth, route],
    );

    const back = useCallback(() => {
        if (depth > 0) history.back();
        else go({ screen: "feed" });
    }, [depth, go]);

    const proto = useMemo<Proto>(
        () => ({
            route,
            go,
            back,
            canGoBack: depth > 0,
            previous: depth > 0 ? previous : null,
            signedIn,
            signIn: () => setSignedIn(true),
            signOut: () => {
                setSignedIn(false);
                setRoute((r) => (r.screen === "create" ? { screen: "feed" } : r));
            },
            portal,
            options,
        }),
        [route, go, back, depth, previous, signedIn, portal, options],
    );

    function switchTo(i: number) {
        if (i < 0 || i >= VARIANTS.length) return;
        setCurrent(i);
        setMountKey((k) => k + 1);
    }

    // The highlight measures the active button.
    useLayoutEffect(() => {
        function moveHighlight() {
            const el = itemRefs.current[current];
            const hl = highlightRef.current;
            if (!el || !hl) return;
            hl.style.width = `${el.offsetWidth}px`;
            hl.style.transform = `translateX(${el.offsetLeft}px)`;
        }
        moveHighlight();
        window.addEventListener("resize", moveHighlight);
        return () => window.removeEventListener("resize", moveHighlight);
    }, [current, chrome]);

    // Enable the slide only after first paint, so load doesn't animate.
    useEffect(() => {
        const id = requestAnimationFrame(() =>
            requestAnimationFrame(() => pickerRef.current?.setAttribute("data-ready", "")),
        );
        return () => cancelAnimationFrame(id);
    }, [chrome]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            // Variants mark keys they consumed (carousels, viewers) with preventDefault.
            if (e.defaultPrevented || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
            const num = parseInt(e.key, 10);
            if (num >= 1 && num <= VARIANTS.length) switchTo(num - 1);
            else if (e.key === "ArrowRight") switchTo((current + 1) % VARIANTS.length);
            else if (e.key === "ArrowLeft") switchTo((current - 1 + VARIANTS.length) % VARIANTS.length);
            else if (e.key === "r" || e.key === "R") setMountKey((k) => k + 1);
            else if (e.key === "h" || e.key === "H") setChrome((c) => !c);
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [current]);

    const { Component, className, options: optionDefs } = VARIANTS[current];

    return (
        <ProtoContext.Provider value={proto}>
            <div ref={setPortal} className={`proto-stage ${className}`} key={`${current}-${mountKey}`}>
                <Component />
            </div>

            {chrome && (
                <>
                    {optionDefs && optionDefs.length > 0 && (
                        <details className="proto-options" open>
                            <summary>Options</summary>
                            {optionDefs.map((d) => (
                                <div key={d.key} className="proto-options-row" role="group" aria-label={d.label}>
                                    <span className="proto-options-label">{d.label}</span>
                                    {d.choices.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className="proto-picker-item"
                                            data-active={options[d.key] === c.id ? "" : undefined}
                                            aria-pressed={options[d.key] === c.id}
                                            onClick={() => setOptions((o) => ({ ...o, [d.key]: c.id }))}
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </details>
                    )}
                    <nav className="proto-screens" aria-label="Prototype screens">
                        {SCREENS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                className="proto-picker-item"
                                data-active={route.screen === s.id ? "" : undefined}
                                aria-current={route.screen === s.id ? "true" : undefined}
                                onClick={() =>
                                    withViewTransition(() => {
                                        setRoute({ screen: s.id });
                                        window.scrollTo(0, 0);
                                    })
                                }
                            >
                                {s.label}
                            </button>
                        ))}
                        <span className="proto-picker-divider" aria-hidden="true" />
                        <button
                            type="button"
                            className="proto-picker-item"
                            data-active={signedIn ? "" : undefined}
                            aria-pressed={signedIn}
                            onClick={() => (signedIn ? proto.signOut() : setSignedIn(true))}
                        >
                            {signedIn ? "Signed in" : "Signed out"}
                        </button>
                    </nav>

                    <nav className="proto-picker" aria-label="Prototype variants" ref={pickerRef}>
                        <span className="proto-picker-highlight" aria-hidden="true" ref={highlightRef} />
                        {VARIANTS.map((v, i) => (
                            <button
                                key={v.name}
                                type="button"
                                ref={(el) => {
                                    itemRefs.current[i] = el;
                                }}
                                className="proto-picker-item"
                                data-active={i === current ? "" : undefined}
                                aria-current={i === current ? "true" : undefined}
                                onClick={() => switchTo(i)}
                            >
                                {v.name}
                            </button>
                        ))}
                        <span className="proto-picker-divider" aria-hidden="true" />
                        <button
                            type="button"
                            className="proto-picker-item proto-picker-replay"
                            aria-label="Replay animation (R)"
                            onClick={() => setMountKey((k) => k + 1)}
                        >
                            ↻
                        </button>
                    </nav>
                </>
            )}
        </ProtoContext.Provider>
    );
}
