// Every screen of the Combined prototype, the reference implementation of
// DESIGN-SYSTEM.md (components in §6, screens in §8, production mapping in
// §11.2). Styles: immersive.css, which reads only src/design/tokens.css.
//
// One work at a time. The feed is a vertical scroll-snapped reel of slides
// under the landing hero; a profile is the same reel filtered to one person
// (PinnedAuthor) under their hero. One link ("4 of 10 works") opens the Index:
// the contact sheet with sort and filter built in. A post (PostView) is two
// snapped screens, the photograph and its wall label; a click on the photo
// turns the lights out (LightsOut). Log in, sign up and new post stage a work
// like a slide, in that work's colour. Screen changes crossfade (View
// Transitions, Harness.tsx) with the header holding still and the photo on
// screen moving into place (workPhoto).
//
// Tuning "b" (the only one Combined uses) snaps one work / photo per gesture
// and hands vertical wheel to the reel when a photo track has latched the
// gesture (useWheelToPage).
import {
    useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
    type ComponentProps, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, type UIEvent,
} from "react";
import { flushSync } from "react-dom";
import clsx from "clsx";
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Dialog } from "@base-ui/react/dialog";
import { Tooltip } from "@base-ui/react/tooltip";
import { toast } from "sonner";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import {
    ME, POSTS, USERS, formatDateDots, gearLine, getPost, getUser, postsByUser, yearOf,
    type ProtoPost, type ProtoUser,
} from "../data";
import { useProto } from "../protoContext";
import { useAuthForm, useDocumentKeys, useDraft, useInViewKey, useSnapTrack, type AuthMode } from "../shared/hooks";
import { ConfirmDelete, Count, EditPost, GearLink, LangToggle, SortablePhotos, TextField, Toasts } from "../shared/ui";
import {
    DEFAULT_FILTER, FeedStateContext, ReelContainerContext, SORT_LABELS, activeFilters, applyFilter, filterKey, useFeedState,
    type FeedFilter, type PhotoCount, type SortKey, type Tuning,
} from "./feedState";

/** Motion values JavaScript needs; each mirrors a token in src/design/tokens.css. */
const IDLE_FADE_MS = 2600; // --idle-fade: the post view's header and bar fade when idle at the top
const IDLE_CURSOR_MS = 1500; // --idle-cursor: lights out hides the cursor
const SETTLE = { at: [0.2, 0.45, 0.55, 0.8], scale: [0.985, 1, 1, 0.985], opacity: [0.55, 1, 1, 0.55] }; // feed motion "Settle"

const isJa = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad2 = (n: number) => String(n).padStart(2, "0");

export function Immersive() {
    const { route } = useProto();
    return (
        <FeedStateProvider>
            <MotionConfig reducedMotion="user">
                {route.screen === "feed" && <ImmersiveFeed />}
                {route.screen === "post" && <ImmersivePost post={getPost(route.postId)} key={route.postId} />}
                {route.screen === "profile" && <ImmersiveProfile userId={route.userId ?? ME.id} key={route.userId} />}
                {(route.screen === "login" || route.screen === "signup") && <ImmersiveAuth mode={route.screen} key={route.screen} />}
                {route.screen === "create" && <ImmersiveCreate />}
                <Toasts position="top-center" />
            </MotionConfig>
        </FeedStateProvider>
    );
}

export function FeedStateProvider({ children, tuning = "original" }: { children: ReactNode; tuning?: Tuning }) {
    const [filter, setFilter] = useState<FeedFilter>(DEFAULT_FILTER);
    const [lastViewed, setLastViewed] = useState<number | null>(null);
    const [inView, setInView] = useState<number | null>(null);
    const value = useMemo(
        () => ({
            tuning,
            filter,
            // New rules start the reel from the top, not at the last opened post.
            setFilter: (f: FeedFilter) => {
                setFilter(f);
                setLastViewed(null);
            },
            lastViewed,
            setLastViewed,
            inView,
            setInView,
        }),
        [tuning, filter, lastViewed, inView],
    );
    return <FeedStateContext.Provider value={value}>{children}</FeedStateContext.Provider>;
}

// ------------------------------------------------------------------ header

function Header({
    onImage = false, lead, right,
}: {
    onImage?: boolean;
    /** First item of the nav (the Index link, or Back to feed). */
    lead?: ReactNode;
    /** Replaces the whole nav (the post view's Close). */
    right?: ReactNode;
}) {
    const { go, signedIn, route } = useProto();

    // The wordmark goes to the feed; on the feed it goes back to its top (the
    // landing hero, where the account controls live).
    function home() {
        const reel = document.querySelector<HTMLElement>(".i-reel");
        if (route.screen === "feed" && reel) reel.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        else go({ screen: "feed" });
    }

    // The header holds one action and the Index link (round 12): + New for a
    // member, Log in for a visitor (not on the log-in / sign-up pages, which are
    // that already). Your profile, Log out, Sign up and EN / JA live in the heroes.
    const onAuth = route.screen === "login" || route.screen === "signup";
    const action = signedIn ? (
        <button type="button" className="i-hlink i-new" onClick={() => go({ screen: "create" })}>+ New</button>
    ) : onAuth ? null : (
        <button type="button" className="i-hlink" onClick={() => go({ screen: "login" })}>Log in</button>
    );
    return (
        <header className={clsx("i-header", onImage && "is-on-image")}>
            <button type="button" className="i-wordmark" onClick={home}>
                Photo Share
            </button>
            {right ?? (
                <nav className="i-header-nav" aria-label="Primary">
                    {action}
                    {lead}
                </nav>
            )}
        </header>
    );
}

function signOutWithToast(signOut: () => void) {
    signOut();
    toast("Signed out");
}

// ------------------------------------------------------------------ Close (one component everywhere)

/**
 * The one Close: a diagonal hairline over the word. Used by the Index sheet,
 * and the post view (where it means "back to feed"). Base UI
 * parts take it through `render`, e.g. <Dialog.Close render={<CloseButton />} />.
 */
function CloseButton({ label = "Close", className, ...rest }: ComponentProps<"button"> & { label?: string }) {
    // "− Close", the counterpart of "+ New" (round 15): a header link in display
    // caps with a minus sign, no line, fading on hover like every ink link.
    return (
        <button type="button" className={clsx("i-hlink i-close", className)} {...rest}>
            <span aria-hidden="true">−&nbsp;</span>
            {label}
        </button>
    );
}

/**
 * Leaving a post, as in production: back to the feed, or to the profile it
 * was opened from. Walks history when that is where the visitor came from, so
 * the reel lands on the same work.
 */
function useLeavePost() {
    const { previous, back, go } = useProto();
    const toProfile = previous?.screen === "profile";
    return {
        label: toProfile ? "back to profile" : "back to feed",
        leave: () => (previous && (previous.screen === "feed" || toProfile) ? back() : go({ screen: "feed" })),
    };
}

/**
 * Leaving the new-post page (round 14): the same Close, back to wherever the
 * visitor came from (feed, a profile or a post), else the feed. Esc does the
 * same unless a field or dialog has it.
 */
function CreateClose() {
    const { previous, back, go } = useProto();
    const where = previous?.screen === "profile" ? "profile" : previous?.screen === "post" ? "the post" : "feed";
    const leave = () => (previous ? back() : go({ screen: "feed" }));
    useDocumentKeys((e) => {
        // Esc also cancels a keyboard drag in the photo strip: never leave mid-drag.
        if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role=dialog], [data-dragging]")) {
            e.preventDefault();
            leave();
        }
    });
    return <CloseButton onClick={leave} aria-label={`Close, back to ${where}`} />;
}

function PostClose() {
    const { label, leave } = useLeavePost();
    return <CloseButton onClick={leave} aria-label={`Close, ${label}`} />;
}

// ------------------------------------------------------------------ the drifting full-bleed photograph

/**
 * The name a work's photograph carries through a screen change (View
 * Transitions): the photo on screen in the feed moves into place on the post,
 * log in or sign up page instead of cutting. Unique per page by construction.
 */
const workPhoto = (postId: number): CSSProperties => ({ viewTransitionName: `work-${postId}` });

/**
 * The drift hero: a full-bleed photograph drifting sideways with scroll, its
 * text bottom left. Corner shade (round 14): a radial shade from the text's
 * corner, deepest where the words are and gone elsewhere, plus a soft halo
 * under the letters. The header above it carries the same halo and no shade
 * (Halo only, round 15).
 */
function DriftHero({ src, children }: { src: string; children?: ReactNode }) {
    const container = useContext(ReelContainerContext);
    const ref = useRef<HTMLElement>(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end start"] });
    const x = useTransform(scrollYProgress, [0, 1], ["-10%", "2%"]);
    return (
        <section ref={ref} className="i-hero" data-key="intro">
            <div className="i-hero-media">
                <motion.img src={src} alt="" className="i-hero-img" style={reduce ? undefined : { x }} fetchPriority="high" />
            </div>
            <div className="i-hero-body">{children}</div>
        </section>
    );
}

/**
 * "Scroll" under a hero, over a hairline that draws itself down and fades, on
 * repeat (the owner's pick, round 5). With reduced motion it draws once and stays.
 */
function ScrollCue() {
    return (
        <span className="i-scroll is-drawn" aria-hidden="true">
            Scroll
        </span>
    );
}

// ------------------------------------------------------------------ shared pieces

/** Scroll the reel to the neighbouring child (slide, hero or end card). */
function stepReel(reel: HTMLElement, dir: 1 | -1): boolean {
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
 * swallowing later vertical movement. Hand it over, and only then: in a reel
 * (feed, profile, post view, lights out), a mostly-vertical gesture that begins
 * while the track is (or just was) moving sideways steps the reel once; the
 * rest of that gesture is swallowed, wherever the pointer ends up. Everything
 * else is native snap, so the tempo stays the browser's.
 */
function useWheelToPage(trackRef: RefObject<HTMLElement | null>, enabled: boolean, reel: RefObject<HTMLElement | null>) {
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

function Pager({ shown, total, show }: { shown: number; total: number; show: (i: number) => void }) {
    if (total < 2) return null;
    return (
        <div className="i-pager">
            <button type="button" className="i-chev is-prev" onClick={() => show(shown - 1)} disabled={shown === 0} aria-label="Previous photo" />
            <Count value={shown + 1} total={total} className="i-count" />
            <button type="button" className="i-chev is-next" onClick={() => show(shown + 1)} disabled={shown === total - 1} aria-label="Next photo" />
        </div>
    );
}

function AuthorLink({ post }: { post: ProtoPost }) {
    const { go } = useProto();
    return (
        <button type="button" className="i-author" onClick={() => go({ screen: "profile", userId: post.user_id })}>
            {post.username}
        </button>
    );
}

// ------------------------------------------------------------------ one work, full screen (feed, profile)

/** One work on a reel (feed and profile): vertical title, the photo track, credit line and pager. */
function Slide({ post, index, container }: { post: ProtoPost; index: number; container: RefObject<HTMLElement | null> }) {
    const { go } = useProto();
    const { setLastViewed, tuning } = useFeedState();
    const ref = useRef<HTMLElement>(null);
    const reduce = useReducedMotion();
    const total = post.images.length;
    const b = tuning === "b";
    const { index: shown, go: show, trackRef, onScroll, onKeyDown } = useSnapTrack(total, 0);
    const { scrollYProgress: p } = useScroll({ container, target: ref, offset: ["start end", "end start"] });

    // Settle (the owner's pick, round 11): p runs 0 → 1 while the slide crosses
    // the screen. The work arrives a shade small (98.5%) and faint (55%) and
    // settles into place; centred, it is flat and full. Nothing moves sideways.
    const settleScale = useTransform(p, SETTLE.at, SETTLE.scale);
    const settleFade = useTransform(p, SETTLE.at, SETTLE.opacity);
    const stageStyle = reduce ? undefined : { scale: settleScale, opacity: settleFade };

    // Vertical wheel over a series scrolls the reel when the photo track has latched the gesture.
    useWheelToPage(trackRef, b && total > 1, container);

    function open() {
        setLastViewed(post.id);
        // Carry the photo being looked at (2 of 3 stays 2 of 3).
        go({ screen: "post", postId: post.id, image: shown || undefined });
    }

    const frames = post.images.map((im, i) => (
        <figure key={im.src} className="i-frame" aria-hidden={i !== shown}>
            <button type="button" onClick={open} aria-label={`Open ${post.caption}`} tabIndex={i === shown ? 0 : -1}>
                <img
                    src={im.src}
                    alt={post.caption}
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    style={i === shown ? workPhoto(post.id) : undefined}
                />
            </button>
        </figure>
    ));

    return (
        <section ref={ref} className="i-slide" data-key={post.id} aria-label={post.caption}>
            <h2 className={clsx("i-vtitle", isJa(post.caption) && "is-ja")}>
                <span>{post.caption}</span>
                <em>{yearOf(post.created_at)}</em>
            </h2>

            <motion.div className="i-stage" style={stageStyle}>
                <div className="i-stage-inner">
                    <div
                        className={clsx("i-track", b && "is-stop")}
                        ref={trackRef}
                        onScroll={onScroll}
                        onKeyDown={onKeyDown}
                        tabIndex={total > 1 ? 0 : -1}
                        aria-roledescription={total > 1 ? "carousel" : undefined}
                        aria-label={total > 1 ? `${post.caption}, ${total} photos` : undefined}
                    >
                        {frames}
                    </div>
                </div>
            </motion.div>

            <footer className="i-credit">
                <p className="i-credit-line">
                    <AuthorLink post={post} />
                    {post.location && <span>{post.location}</span>}
                    {gearLine(post) && <span className="i-gear">{gearLine(post)}</span>}
                </p>
                <Pager shown={shown} total={total} show={show} />
            </footer>
        </section>
    );
}

// ------------------------------------------------------------------ the reel (feed and profile)

function Reel({
    posts,
    intro,
    startPastIntro = false,
    header,
    empty,
    end,
}: {
    posts: ProtoPost[];
    intro?: ReactNode;
    /** Open on the first work, with the intro waiting above it (signed-in landing hero). */
    startPastIntro?: boolean;
    header: (onIntro: boolean) => ReactNode;
    empty?: ReactNode;
    /** Replaces the end card's contents. */
    end?: ReactNode;
}) {
    const { lastViewed, tuning, setInView } = useFeedState();
    const reelRef = useRef<HTMLDivElement | null>(null);
    const [reel, setReel] = useState<HTMLDivElement | null>(null);
    const inView = useInViewKey(".i-slide[data-key], .i-hero[data-key]", reel);
    const position = posts.findIndex((p) => String(p.id) === inView);
    const current = position >= 0 ? posts[position] : null;
    const onIntro = !!intro && (inView === null || inView === "intro");

    // Remember the work on screen (log in / sign up open around it).
    const currentId = current?.id ?? null;
    useEffect(() => {
        setInView(currentId);
    }, [currentId, setInView]);

    // A member's feed opens on the first work; scrolling up finds the landing hero.
    // Read once, on mount: the reel re-mounts when the rules change.
    const startPast = useRef(startPastIntro && intro != null && lastViewed == null);
    useLayoutEffect(() => {
        const el = reelRef.current;
        if (!el || !startPast.current) return;
        const first = el.querySelector<HTMLElement>(".i-slide[data-key]");
        if (first) el.scrollTo({ top: first.offsetTop, behavior: "instant" });
    }, []);

    // Coming back from a post: land on it, not at the top.
    useEffect(() => {
        const el = reelRef.current;
        if (!el || lastViewed == null) return;
        const target = el.querySelector<HTMLElement>(`[data-key="${lastViewed}"]`);
        if (target) el.scrollTo({ top: target.offsetTop });
    }, [lastViewed]);

    useDocumentKeys((e) => {
        const el = reelRef.current;
        if (!el || document.querySelector("[role=dialog]")) return;
        if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j" || e.key === " ") {
            e.preventDefault();
            stepReel(el, 1);
        } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
            e.preventDefault();
            stepReel(el, -1);
        }
    });

    return (
        <div className="i-page" style={{ "--page": onIntro ? "#141414" : current?.tint ?? posts[0]?.tint ?? "#ece9e2" } as CSSProperties}>
            {header(onIntro)}
            <div
                className={clsx("i-reel", tuning === "b" && "is-stop")}
                ref={(el) => {
                    reelRef.current = el;
                    setReel(el);
                }}
            >
                <ReelContainerContext.Provider value={reelRef}>{intro}</ReelContainerContext.Provider>
                {posts.length === 0 && empty}
                {posts.map((p, i) => (
                    <Slide key={p.id} post={p} index={i} container={reelRef} />
                ))}
                {posts.length > 0 && (
                    <section className="i-end">
                        {end ?? <p className="i-end-title">That’s everything here.</p>}
                        <button type="button" className="i-textlink" onClick={() => reelRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
                            Back to the top
                        </button>
                    </section>
                )}
            </div>

            {!onIntro && position >= 0 && (
                <div className="i-progress" aria-hidden="true">
                    <Count value={position + 1} total={posts.length} pad />
                </div>
            )}
        </div>
    );
}

// ------------------------------------------------------------------ feed

/**
 * The feed, and every profile: one reel (round 12). Whenever the rules come
 * down to exactly one person (their profile, or the Index filtered to them)
 * the reel opens on that person's hero and ends on "That's everything by …".
 * Otherwise it opens on the landing hero: a visitor starts there, a member
 * lands on the first work with the hero (their buttons) one scroll up.
 */
export function ImmersiveFeed() {
    const { signedIn, go, signOut } = useProto();
    const { filter, setFilter, setLastViewed } = useFeedState();
    const [indexOpen, setIndexOpen] = useState(false);
    const posts = useMemo(() => applyFilter(POSTS, filter), [filter]);
    const narrowed = activeFilters(filter) > 0;
    const person = filter.authors.length === 1 ? getUser(filter.authors[0]) : undefined;
    const clearFilters = () => setFilter({ ...DEFAULT_FILTER, sort: filter.sort });

    // The one way into the Index (contact sheet + sort/filter): the link names
    // the set being shown, so it doubles as the filter state. Sort only
    // reorders, so it never makes "10 of 10".
    const count = narrowed ? `${posts.length} of ${POSTS.length} works` : `All ${POSTS.length} works`;
    const indexLink = (
        <button
            type="button"
            className={clsx("i-hlink i-indexlink", narrowed && "is-on")}
            onClick={() => setIndexOpen(true)}
            aria-haspopup="dialog"
            aria-label={`${count}: index, sort and filter`}
        >
            <span className="i-grid-icon" aria-hidden="true" />
            {count}
        </button>
    );

    // The landing hero mirrors the person hero: the main action, the way to the
    // other set of works, then the quiet ones.
    const intro: ReactNode = person ? (
        <PersonHero user={person} />
    ) : (
        <DriftHero src={getPost(103).images[0].src}>
            <p className="i-hero-mark">Photo Share</p>
            <p className="i-hero-sub">One photograph at a time.</p>
            <div className="i-hero-actions">
                {signedIn ? (
                    <>
                        <button type="button" className="i-btn is-light" onClick={() => go({ screen: "create" })}>New post</button>
                        <button type="button" className="i-textlink is-light" onClick={() => go({ screen: "profile", userId: ME.id })}>Your profile</button>
                        <button type="button" className="i-quietlink is-light" onClick={() => signOutWithToast(signOut)}>Log out</button>
                    </>
                ) : (
                    <>
                        <button type="button" className="i-btn is-light" onClick={() => go({ screen: "login" })}>Log in</button>
                        <button type="button" className="i-textlink is-light" onClick={() => go({ screen: "signup" })}>Sign up</button>
                    </>
                )}
                <LangToggle className="i-lang is-light" />
            </div>
            <ScrollCue />
        </DriftHero>
    );

    return (
        <>
            <Reel
                key={filterKey(filter)}
                posts={posts}
                header={(onIntro) => (
                    <>
                        <Header onImage={onIntro} lead={indexLink} />
                        {/* Never over the hero's photo: the hero already says who, or nothing is narrowed. */}
                        {narrowed && !onIntro && <FilterLine filter={filter} onClear={clearFilters} />}
                    </>
                )}
                intro={intro}
                // Members land on the first work; the landing hero waits above it.
                startPastIntro={signedIn && !person}
                end={
                    person && (
                        <>
                            <p className="i-end-title">That’s everything by {person.username}.</p>
                            {/* On a profile, clearing the person is leaving it for the feed (PinnedAuthor). */}
                            <button type="button" className="i-textlink" onClick={clearFilters}>All works</button>
                        </>
                    )
                }
                empty={
                    <section className="i-end is-empty">
                        <p className="i-end-title">No works match these rules.</p>
                        <button type="button" className="i-textlink" onClick={clearFilters}>Clear filters</button>
                    </section>
                }
            />
            <IndexSheet
                open={indexOpen}
                onOpenChange={setIndexOpen}
                posts={posts}
                onPick={(id) => {
                    setIndexOpen(false);
                    setLastViewed(id);
                    // Wait for the sheet to close, then land on that work.
                    requestAnimationFrame(() =>
                        document.querySelector<HTMLElement>(`.i-reel [data-key="${id}"]`)?.scrollIntoView(),
                    );
                }}
            />
        </>
    );
}

/**
 * "by a", "by a and b", or "by a, b and 3 others", where "3 others" opens a
 * small sheet listing everyone (Base UI Tooltip, round 12: the system's own
 * surface rather than the browser's tooltip). Never a long list under the wordmark.
 */
function ByNames({ names }: { names: string[] }) {
    const { portal } = useProto();
    if (names.length <= 2) return <>by {names.join(" and ")}</>;
    const rest = names.length - 2;
    return (
        <>
            by {names[0]}, {names[1]} and{" "}
            <Tooltip.Root>
                <Tooltip.Trigger className="i-names-more" delay={200} aria-label={`and ${rest} more: ${names.slice(2).join(", ")}`}>
                    {rest} other{rest === 1 ? "" : "s"}
                </Tooltip.Trigger>
                <Tooltip.Portal container={portal}>
                    <Tooltip.Positioner className="i-names-positioner" side="bottom" align="start" sideOffset={10}>
                        <Tooltip.Popup className="i-names">
                            <span className="i-names-label">By</span>
                            <ul className="i-names-list">
                                {names.map((n) => <li key={n}>{n}</li>)}
                            </ul>
                        </Tooltip.Popup>
                    </Tooltip.Positioner>
                </Tooltip.Portal>
            </Tooltip.Root>
        </>
    );
}

/**
 * Which filters are on, quietly, under the wordmark, with Clear (round 11:
 * filters only, never the sort; Clear is the quietest thing on the line).
 * Not a link: the header's "4 of 10 works" is the one way into the Index.
 */
function FilterLine({ filter, onClear }: { filter: FeedFilter; onClear: () => void }) {
    const names = filter.authors.map((id) => getUser(id).username);
    const only = filter.photos === "series" ? "series only" : filter.photos === "single" ? "single photos only" : null;
    return (
        <p className="i-filterline">
            <span>
                {names.length > 0 && <ByNames names={names} />}
                {names.length > 0 && only && " · "}
                {only}
            </span>
            <button type="button" className="i-quietlink" onClick={onClear}>Clear</button>
        </p>
    );
}

function FilterPanel() {
    const { filter, setFilter } = useFeedState();
    const sorts = Object.keys(SORT_LABELS) as SortKey[];
    return (
        <div className="i-filters">
            <div className="i-frow">
                <span className="i-flabel" id="f-sort">Sort</span>
                <ToggleGroup className="i-fopts" aria-labelledby="f-sort" value={[filter.sort]} onValueChange={(v) => v[0] && setFilter({ ...filter, sort: v[0] as SortKey })}>
                    {sorts.map((k) => <Toggle key={k} value={k} className="i-fopt">{SORT_LABELS[k]}</Toggle>)}
                </ToggleGroup>
            </div>
            <div className="i-frow">
                <span className="i-flabel" id="f-by">By</span>
                <ToggleGroup className="i-fopts" aria-labelledby="f-by" multiple value={filter.authors.map(String)} onValueChange={(v) => setFilter({ ...filter, authors: v.map(Number) })}>
                    {USERS.map((u) => <Toggle key={u.id} value={String(u.id)} className="i-fopt">{u.username}</Toggle>)}
                </ToggleGroup>
            </div>
            <div className="i-frow">
                <span className="i-flabel" id="f-only">Only</span>
                {/* Either or neither: pressing one releases the other; pressing it again clears it. */}
                <ToggleGroup
                    className="i-fopts"
                    aria-labelledby="f-only"
                    value={filter.photos === "any" ? [] : [filter.photos]}
                    onValueChange={(v) => setFilter({ ...filter, photos: (v[0] as PhotoCount | undefined) ?? "any" })}
                >
                    <Toggle value="single" className="i-fopt">Single photo</Toggle>
                    <Toggle value="series" className="i-fopt">Series of 2+</Toggle>
                </ToggleGroup>
            </div>
            {/* Like the filter line's Clear: only for filters, never for a sort (round 12). */}
            {activeFilters(filter) > 0 && (
                <p className="i-fsummary">
                    <button type="button" className="i-quietlink" onClick={() => setFilter({ ...DEFAULT_FILTER, sort: filter.sort })}>Clear all</button>
                </p>
            )}
        </div>
    );
}

/** Index: the contact sheet, with sort and filter beside it; the grid updates as rules change. */
function IndexSheet({
    open, onOpenChange, posts, onPick,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    posts: ProtoPost[];
    onPick: (id: number) => void;
}) {
    const { portal } = useProto();
    const { filter, setFilter } = useFeedState();
    const narrowed = activeFilters(filter) > 0;
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal container={portal}>
                <Dialog.Popup className="i-index">
                    <div className="i-index-head">
                        <Dialog.Title className="i-index-title">Index</Dialog.Title>
                        <span className="i-index-count" role="status">
                            {narrowed ? `${posts.length} of ${POSTS.length} works` : `${POSTS.length} works`}
                        </span>
                        <Dialog.Close render={<CloseButton />} />
                    </div>
                    <div className="i-index-body">
                        <section className="i-index-rules" aria-labelledby="ix-rules">
                            <h2 className="i-index-sub" id="ix-rules">Sort · Filter</h2>
                            <FilterPanel />
                        </section>
                        <section aria-label="Works">
                            {posts.length === 0 ? (
                                <p className="i-index-empty">
                                    Nothing matches these rules.{" "}
                                    <button type="button" className="i-textlink" onClick={() => setFilter({ ...DEFAULT_FILTER, sort: filter.sort })}>Clear all</button>
                                </p>
                            ) : (
                                <ol className="i-index-grid">
                                    {posts.map((p, i) => (
                                        <li key={p.id}>
                                            <button type="button" className="i-index-item" onClick={() => onPick(p.id)}>
                                                <img src={p.images[0].src} alt="" loading="lazy" />
                                                <span className="i-index-no">{pad2(i + 1)}</span>
                                                <span className={clsx("i-index-cap", isJa(p.caption) && "is-ja")}>{p.caption}</span>
                                                <span className="i-index-by">{p.username}{p.images.length > 1 && ` · ${p.images.length} photos`}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// ------------------------------------------------------------------ post

export function ImmersivePost({ post }: { post: ProtoPost }) {
    const { leave } = useLeavePost();

    // Esc leaves the post, unless a dialog or the details (back to the photo) handled it first.
    useDocumentKeys((e) => {
        if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role=dialog]")) {
            e.preventDefault();
            leave();
        }
    });

    // Text never sits on the photo: the header keeps its own band above it.
    const header = <Header right={<PostClose />} />;
    const page = { "--page": post.tint } as CSSProperties;
    return <PostView post={post} header={header} style={page} />;
}

type ViewerProps = { post: ProtoPost; header: ReactNode; style: CSSProperties };

/** Scroll smoothly to an element (instantly under reduced motion). */
function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** The post view's photo track, opening on the photo carried from the feed. */
function useViewer(post: ProtoPost, reel: RefObject<HTMLElement | null>) {
    const { route } = useProto();
    const { tuning } = useFeedState();
    const total = post.images.length;
    const { index, go, trackRef, onScroll, onKeyDown } = useSnapTrack(total, route.image ?? 0);
    // A vertical swipe the photo track latched still turns the page (photo ↔ label).
    useWheelToPage(trackRef, total > 1, reel);

    // ←/→ page through the series from anywhere (and never switch prototype variants).
    useDocumentKeys((e) => {
        // The focused track already handled it (React's listener runs before the document's).
        if (e.defaultPrevented || document.querySelector("[role=dialog]")) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            go(index + (e.key === "ArrowRight" ? 1 : -1));
        }
    });
    return { shown: index, show: go, total, trackRef, onScroll, onKeyDown, stop: tuning === "b" };
}

/**
 * The post view's photo track. Each photo is a button that opens the
 * distraction-free view (round 7: no "Full screen" text). `named` is off while
 * that view is open, so the photo's transition name is never on the page twice.
 */
function Photos({
    post, shown, trackRef, onScroll, onKeyDown, stop, onOpen, named = true,
}: {
    post: ProtoPost;
    shown: number;
    trackRef: RefObject<HTMLDivElement | null>;
    onScroll: (e: UIEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    stop: boolean;
    onOpen: () => void;
    named?: boolean;
}) {
    const total = post.images.length;
    return (
        <div
            className={clsx("i-track i-post-track", stop && "is-stop")}
            ref={trackRef}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={total > 1 ? 0 : -1}
            aria-roledescription={total > 1 ? "carousel" : undefined}
            aria-label={total > 1 ? `${post.caption}, ${total} photos` : undefined}
        >
            {post.images.map((im, i) => {
                const alt = total > 1 ? `${post.caption}, photo ${i + 1} of ${total}` : post.caption;
                return (
                    <figure key={im.src} className="i-post-frame" aria-hidden={i !== shown}>
                        <button
                            type="button"
                            className="i-post-open"
                            onClick={onOpen}
                            tabIndex={i === shown ? 0 : -1}
                            aria-label={`View full screen: ${alt}`}
                        >
                            <img src={im.src} alt="" decoding="async" style={i === shown && named ? workPhoto(post.id) : undefined} />
                        </button>
                    </figure>
                );
            })}
        </div>
    );
}

/**
 * The post view (rounds 6–9): two screens on a snapped reel, like the feed and
 * like lights out. Top: nothing but the photograph, between the header band
 * and a caption bar (title and author | Info, ‹ 1/n ›), so no text ever lies on
 * the picture; controls fade after a few idle seconds. Bottom: the wall label,
 * alone. One swipe (or Info, or I) moves between them; Esc comes back up. The
 * bar's caption fades out as the label's title arrives, so the title is never
 * on screen twice. A click on the photo (or F) turns the lights out (LightsOut).
 */
function PostView({ post, header, style }: ViewerProps) {
    const reelRef = useRef<HTMLDivElement>(null);
    const { shown, show, total, trackRef, onScroll, onKeyDown, stop } = useViewer(post, reelRef);
    const [idle, setIdle] = useState(false);
    const [atTop, setAtTop] = useState(true);
    const [reading, setReading] = useState(false);
    const [full, setFull] = useState(false);
    const detailsRef = useRef<HTMLElement>(null);

    // The bar's caption gives way to the label's title as it comes up the screen.
    const { scrollYProgress: arrive } = useScroll({ container: reelRef, target: detailsRef, offset: ["start end", "start start"] });
    const capOut = useTransform(arrive, [0, 0.3], [1, 0]);
    const capVisibility = useTransform(capOut, (v) => (v < 0.02 ? "hidden" : "visible"));
    const titleIn = useTransform(arrive, [0.2, 0.55], [0, 1]);

    useEffect(() => {
        const reel = reelRef.current;
        if (!reel) return;
        const sync = () => {
            setAtTop(reel.scrollTop < 8);
            setReading(reel.scrollTop > reel.clientHeight * 0.4);
        };
        sync();
        reel.addEventListener("scroll", sync, { passive: true });
        window.addEventListener("resize", sync);
        return () => {
            reel.removeEventListener("scroll", sync);
            window.removeEventListener("resize", sync);
        };
    }, []);

    useEffect(() => {
        const reel = reelRef.current;
        let t = window.setTimeout(() => setIdle(true), IDLE_FADE_MS);
        function wake() {
            setIdle(false);
            window.clearTimeout(t);
            t = window.setTimeout(() => setIdle(true), IDLE_FADE_MS);
        }
        const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
        events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
        reel?.addEventListener("scroll", wake, { passive: true });
        return () => {
            window.clearTimeout(t);
            events.forEach((ev) => window.removeEventListener(ev, wake));
            reel?.removeEventListener("scroll", wake);
        };
    }, []);

    /** Lights out is a screen change: the photo moves out to fill the window and back (View Transitions). */
    function morph(update: () => void) {
        if (!prefersReducedMotion() && "startViewTransition" in document) document.startViewTransition(() => flushSync(update));
        else update();
    }

    function openFull() {
        morph(() => setFull(true));
    }

    function closeFull(at: number) {
        // Land on the photo the view ended on, without a slide behind the scenes.
        const track = trackRef.current;
        if (track) track.scrollTo({ left: at * track.clientWidth, behavior: "instant" });
        show(at);
        morph(() => setFull(false));
        // Back on the photo it opened from, ready for the keyboard again.
        window.requestAnimationFrame(() => trackRef.current?.querySelectorAll<HTMLElement>(".i-post-open")[at]?.focus({ preventScroll: true }));
    }

    function backToPhoto() {
        reelRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }

    function toggleInfo() {
        if (reading) backToPhoto();
        else scrollToId("post-details");
    }

    useDocumentKeys((e) => {
        if (document.querySelector("[role=dialog]")) return;
        if (e.key === "i" || e.key === "I") {
            e.preventDefault();
            toggleInfo();
        } else if (e.key === "f" || e.key === "F") {
            e.preventDefault();
            openFull();
        } else if (e.key === "Escape" && reading) {
            e.preventDefault();
            backToPhoto();
        }
    });

    const ja = isJa(post.caption);
    const caption = (
        <motion.div
            className="i-post-caption"
            style={{ opacity: capOut, visibility: capVisibility }}
        >
            <h1 className={clsx(ja && "is-ja")}>{post.caption}</h1>
            <AuthorLink post={post} />
        </motion.div>
    );
    const bar = (
        <div className="i-post-bar">
            {caption}
            <div className="i-post-tools">
                <button
                    type="button"
                    className="i-hlink i-info-link"
                    onClick={toggleInfo}
                    aria-controls="post-details"
                    aria-label={reading ? "Info: back to the photo" : "Info: details below"}
                >
                    Info
                    <span className={clsx("i-info-chev", reading && "is-up")} aria-hidden="true" />
                </button>
                <Pager shown={shown} total={total} show={show} />
            </div>
        </div>
    );
    const photos = (
        <Photos
            post={post} shown={shown} trackRef={trackRef} onScroll={onScroll} onKeyDown={onKeyDown} stop={stop}
            onOpen={openFull} named={!full}
        />
    );
    const lightsOut = full && <LightsOut post={post} start={shown} onClose={closeFull} />;
    const pageClass = clsx("i-page is-scroll is-post", idle && atTop && "is-idle", reading && "is-reading");

    return (
        <div className={pageClass} style={style}>
            {header}
            <div className="i-reel is-stop i-post-reel" ref={reelRef}>
                <div className="i-post-screen">
                    <div className="i-post-stage">{photos}</div>
                    {bar}
                </div>
                <section className="i-post-label" id="post-details" ref={detailsRef} aria-label="About this work">
                    <WallLabel post={post} titleStyle={{ opacity: titleIn }} />
                </section>
            </div>
            {lightsOut}
        </div>
    );
}

// ------------------------------------------------------------------ the wall label (round 8)

type TitleStyle = ComponentProps<typeof motion.p>["style"];


/**
 * The owner's Edit / Delete on the wall label (round 12): one quiet "Manage"
 * that opens to Edit · Delete in place, both as quiet links. Delete still
 * confirms in a dialog: blending in never means one click deletes.
 */
function OwnerActions({ post }: { post: ProtoPost }) {
    const { signedIn } = useProto();
    const [open, setOpen] = useState(false);
    if (!(signedIn && post.user_id === ME.id)) return null;
    return (
        <p className="i-owner-line">
            {open ? (
                <>
                    <EditPost post={post} className="i-quietlink" />
                    <ConfirmDelete post={post} className="i-quietlink" />
                </>
            ) : (
                <button type="button" className="i-quietlink" onClick={() => setOpen(true)} aria-expanded={false}>Manage</button>
            )}
        </p>
    );
}

/**
 * The wall label: the card beside a print in a gallery. Artist, title and
 * year, place, medium (the gear), extent and date, left-aligned in a small
 * block. The post view sets it in ink on the page colour; lights out sets the
 * same label white on black (`dark`).
 */
function WallLabel({ post, titleStyle, dark = false }: { post: ProtoPost; titleStyle?: TitleStyle; dark?: boolean }) {
    return (
        <div className={clsx("i-wall-label", dark && "is-dark")}>
            <AuthorLink post={post} />
            <motion.p className={clsx("i-wall-title", isJa(post.caption) && "is-ja")} style={titleStyle}>
                {post.caption}, <em>{yearOf(post.created_at)}</em>
            </motion.p>
            {post.location && <p className="i-wall-place">{post.location}</p>}
            {(post.camera_body || post.lens) && (
                <ul className="i-wall-medium">
                    {post.camera_body && <li>{post.camera_body} <GearLink name={post.camera_body} label="Find" className="i-find" /></li>}
                    {post.lens && <li>{post.lens} <GearLink name={post.lens} label="Find" className="i-find" /></li>}
                </ul>
            )}
            <p className="i-wall-meta">{formatDateDots(post.created_at)}</p>
            <OwnerActions post={post} />
        </div>
    );
}

// ------------------------------------------------------------------ lights out (rounds 7–8)

/**
 * A click on the photo turns the lights out, inside the window (no browser
 * full screen or its "Press Esc" notice): the page goes dark and the photograph
 * moves out to fill it. Nothing else is on screen, not even the cursor once the
 * pointer rests. Scrolling down brings up the same wall label, white on black;
 * scrolling up is the photo again. A click on the photo or Esc turns the
 * lights back on; ←/→ or a swipe pages a series.
 */
function LightsOut({ post, start, onClose }: { post: ProtoPost; start: number; onClose: (at: number) => void }) {
    const total = post.images.length;
    const { index, go, trackRef, onScroll, onKeyDown } = useSnapTrack(total, start);
    const rootRef = useRef<HTMLDivElement>(null);
    const [idle, setIdle] = useState(false);
    // A vertical swipe the photo track latched still turns to the label (and back).
    useWheelToPage(trackRef, total > 1, rootRef);

    useEffect(() => {
        trackRef.current?.focus({ preventScroll: true });
        // The page behind must not scroll while the view is up.
        const html = document.documentElement;
        const before = html.style.overflow;
        html.style.overflow = "hidden";
        return () => {
            html.style.overflow = before;
        };
    }, [trackRef]);

    // The cursor hides once the pointer rests.
    useEffect(() => {
        let t = window.setTimeout(() => setIdle(true), IDLE_CURSOR_MS);
        function wake() {
            setIdle(false);
            window.clearTimeout(t);
            t = window.setTimeout(() => setIdle(true), IDLE_CURSOR_MS);
        }
        window.addEventListener("pointermove", wake, { passive: true });
        return () => {
            window.clearTimeout(t);
            window.removeEventListener("pointermove", wake);
        };
    }, []);

    function exit() {
        // From the label the photo is off screen: let it fade with the rest
        // instead of flying in from above.
        const view = rootRef.current;
        if (view && view.scrollTop > 0) view.querySelectorAll("img").forEach((img) => (img.style.viewTransitionName = "none"));
        onClose(index);
    }

    useDocumentKeys((e) => {
        // A dialog opened from the label (Find, Edit, Delete) handles its own keys.
        if (document.querySelector("[role=dialog]:not(.i-lights), [role=alertdialog]")) return;
        if (e.key === "Escape") {
            e.preventDefault();
            exit();
        } else if (!e.defaultPrevented && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            go(index + (e.key === "ArrowRight" ? 1 : -1));
        }
    });

    return (
        <div
            ref={rootRef}
            className={clsx("i-lights", idle && "is-idle")}
            role="dialog"
            aria-modal="true"
            aria-label={`${post.caption}, lights out. Scroll for the label; Escape to close.`}
        >
            <div className="i-lights-photo" onClick={exit}>
                <div
                    className="i-track i-lights-track is-stop"
                    ref={trackRef}
                    onScroll={onScroll}
                    onKeyDown={onKeyDown}
                    tabIndex={0}
                    aria-roledescription={total > 1 ? "carousel" : undefined}
                >
                    {post.images.map((im, i) => (
                        <figure key={im.src} className="i-lights-frame" aria-hidden={i !== index}>
                            <img
                                src={im.src}
                                alt={total > 1 ? `${post.caption}, photo ${i + 1} of ${total}` : post.caption}
                                style={i === index ? workPhoto(post.id) : undefined}
                            />
                        </figure>
                    ))}
                </div>
            </div>
            <section className="i-lights-label" aria-label="About this work">
                <WallLabel post={post} dark />
            </section>
        </div>
    );
}

// ------------------------------------------------------------------ profile

/**
 * A profile is the feed filtered to that person (One reel, round 12): their
 * hero, their works, "That's everything by …", with the Index link, filter
 * line and end card carrying on from the feed. Author links and "Your
 * profile" lead here.
 */
export function ImmersiveProfile({ userId }: { userId: number }) {
    return (
        <PinnedAuthor userId={userId}>
            <ImmersiveFeed />
        </PinnedAuthor>
    );
}

/**
 * The feed's rules with the author pinned to the profile's person. The author
 * lives in the route, not in the rules: sort and "Only" set here carry over
 * to the feed, while choosing other people (or Clear) goes to the feed with
 * those rules, since that is no longer this person's profile.
 */
function PinnedAuthor({ userId, children }: { userId: number; children: ReactNode }) {
    const state = useFeedState();
    const { go } = useProto();
    const value = useMemo(() => {
        const { filter, setFilter } = state;
        return {
            ...state,
            filter: { ...filter, authors: [userId] },
            setFilter: (f: FeedFilter) => {
                const stillThisPerson = f.authors.length === 1 && f.authors[0] === userId;
                setFilter(stillThisPerson ? { ...f, authors: [] } : f);
                if (!stillThisPerson) go({ screen: "feed" });
            },
        };
    }, [state, userId, go]);
    return <FeedStateContext.Provider value={value}>{children}</FeedStateContext.Provider>;
}

/**
 * A person's hero: their first work drifting behind the name, bio and counts.
 * Yours mirrors the landing hero (New post · Your profile · Log out · EN / JA)
 * with All works in the middle: the way to the other set of works (round 12).
 */
function PersonHero({ user }: { user: ProtoUser }) {
    const { go, signedIn, signOut } = useProto();
    const { filter, setFilter } = useFeedState();
    const posts = postsByUser(user.id);
    const own = signedIn && user.id === ME.id;
    const photos = posts.reduce((n, p) => n + p.images.length, 0);
    return (
        <DriftHero src={posts[0]?.images[0].src ?? POSTS[0].images[0].src}>
            <h1 className="i-hero-mark">{user.username}</h1>
            <p className="i-hero-sub">{user.bio}</p>
            <p className="i-hero-stats">{posts.length} works · {photos} photographs</p>
            {own && (
                <div className="i-hero-actions">
                    <button type="button" className="i-btn is-light" onClick={() => go({ screen: "create" })}>New post</button>
                    {/* Clearing the person: on a profile that leaves for the feed (PinnedAuthor). */}
                    <button type="button" className="i-textlink is-light" onClick={() => setFilter({ ...DEFAULT_FILTER, sort: filter.sort })}>
                        All works
                    </button>
                    <button type="button" className="i-quietlink is-light" onClick={() => signOutWithToast(signOut)}>Log out</button>
                    <LangToggle className="i-lang is-light" />
                </div>
            )}
            <ScrollCue />
        </DriftHero>
    );
}

// ------------------------------------------------------------------ auth

/**
 * The work log in / sign up is staged around: the one the visitor was looking
 * at (the post they came from, else the work on screen in the feed), so the
 * screen change keeps the same photograph and colour. A default otherwise.
 */
function useDoorWork(mode: AuthMode): { post: ProtoPost; image: number } {
    const { previous } = useProto();
    const { inView } = useFeedState();
    if (previous?.screen === "post" && previous.postId) {
        const post = getPost(previous.postId);
        return { post, image: Math.min(previous.image ?? 0, post.images.length - 1) };
    }
    if (inView != null) return { post: getPost(inView), image: 0 };
    return { post: getPost(mode === "login" ? 104 : 108), image: 0 };
}

/**
 * Log in / sign up, built like a feed slide: the work named in the left
 * margin, staged on its own colour with its credit line beneath, and the form
 * where the slide's right margin would be. Header and photo stay put through
 * the change from the feed or a post; the form is what arrives.
 */
export function ImmersiveAuth({ mode }: { mode: AuthMode }) {
    const { go } = useProto();
    const f = useAuthForm(mode);
    const isLogin = mode === "login";
    const { post: feature, image } = useDoorWork(mode);
    return (
        <div className="i-page is-door" style={{ "--page": feature.tint } as CSSProperties}>
            <Header />
            <main className="i-door">
                <p className={clsx("i-vtitle", isJa(feature.caption) && "is-ja")}>
                    <span>{feature.caption}</span>
                    <em>{yearOf(feature.created_at)}</em>
                </p>
                <figure className="i-door-work">
                    <img src={feature.images[image].src} alt={feature.caption} style={workPhoto(feature.id)} />
                    <figcaption className="i-credit-line">
                        <AuthorLink post={feature} />
                        {feature.location && <span>{feature.location}</span>}
                    </figcaption>
                </figure>
                <form className="i-form" onSubmit={f.submit} noValidate>
                    <h1 className="i-form-title">{isLogin ? "Log in" : "Sign up"}</h1>
                    <p className="i-form-sub">{isLogin ? "Welcome back." : "Your work, one photograph at a time."}</p>
                    {f.formError && <p className="i-form-error" role="alert">{f.formError}</p>}
                    {!isLogin && (
                        <TextField label="Username" value={f.username} onChange={f.setUsername} error={f.errors.username} autoComplete="username" className="i-field" />
                    )}
                    <TextField label="Email" type="email" value={f.email} onChange={f.setEmail} error={f.errors.email} autoComplete="email" className="i-field" />
                    <TextField label="Password" type="password" value={f.password} onChange={f.setPassword} error={f.errors.password} autoComplete={isLogin ? "current-password" : "new-password"} className="i-field" hint={isLogin ? undefined : "At least 8 characters."} />
                    <button type="submit" className="i-btn is-block" disabled={f.pending}>
                        {f.pending ? "One moment…" : isLogin ? "Log in" : "Create account"}
                    </button>
                    <p className="i-form-alt">
                        {isLogin ? "No account yet?" : "Have an account?"}{" "}
                        <button type="button" className="i-textlink" onClick={() => go({ screen: isLogin ? "signup" : "login" })}>
                            {isLogin ? "Sign up" : "Log in"}
                        </button>
                    </p>
                    <p className="i-proto-note">Prototype: the password “wrong” shows the error state.</p>
                </form>
            </main>
        </div>
    );
}

// ------------------------------------------------------------------ create (composer)

/**
 * New post as a live preview of the slide it will become: the title you type
 * runs up the margin, the cover sits on its own colour, your name, place and
 * gear form the credit line beneath, and the page turns the cover's colour.
 * The fields sit in a side panel.
 */
export function ImmersiveCreate() {
    const d = useDraft();
    const cover = d.photos[0];
    const title = d.caption.trim() || "Untitled";
    const camera = d.camera.trim() || d.detected?.camera;
    const lens = d.lens.trim() || d.detected?.lens;
    const gear = [camera, lens].filter(Boolean).join(" · ");
    return (
        <div className="i-page is-compose" style={{ "--page": cover?.tint ?? "var(--paper)" } as CSSProperties}>
            {/* Not "+ New" on the page that is New: the one Close, like the post view. */}
            <Header right={<CreateClose />} />
            <form className="i-compose" onSubmit={d.submit} noValidate>
                <section className="i-compose-stage" aria-label="Preview">
                    <p className={clsx("i-vtitle", isJa(title) && "is-ja")} aria-hidden="true">
                        <span>{title}</span>
                        <em>{new Date().getFullYear()}</em>
                    </p>
                    <p className="i-compose-kicker">Preview</p>
                    {cover ? (
                        <figure className="i-compose-work">
                            <img src={cover.image.src} alt={`Cover: ${cover.name}`} />
                        </figure>
                    ) : (
                        <button type="button" className="i-compose-empty" onClick={d.addPhotos}>
                            <span className="i-compose-empty-title">Choose photos</span>
                            <span className="i-compose-empty-sub">Up to ten. JPEG, PNG or WebP, 32 MB each.</span>
                        </button>
                    )}
                    <p className="i-credit-line">
                        <span className="i-author">{ME.username}</span>
                        {d.location.trim() && <span>{d.location.trim()}</span>}
                        {gear && <span className="i-gear">{gear}</span>}
                    </p>
                    {d.photos.length > 0 && (
                        <div className="i-filmstrip">
                            <SortablePhotos
                                draft={d}
                                direction="row"
                                className="i-sortable"
                                addSlot={d.canAddMore ? <li className="i-add"><button type="button" onClick={d.addPhotos} aria-label="Add photos">+</button></li> : undefined}
                            />
                            <p className="i-hint">Drag to reorder. The first photo is the cover.</p>
                        </div>
                    )}
                </section>
                <section className="i-compose-panel" aria-label="Details">
                    <h1 className="i-form-title">New post</h1>
                    {d.error && <p className="i-form-error" role="alert">{d.error}</p>}
                    <TextField label="Title" value={d.caption} onChange={d.setCaption} className="i-field" placeholder="Untitled" />
                    <TextField label="Place" value={d.location} onChange={d.setLocation} className="i-field" placeholder="Optional" />
                    <TextField label="Camera" value={d.camera} onChange={d.setCamera} className="i-field" placeholder={d.detected?.camera ?? "From your photo"} />
                    <TextField label="Lens" value={d.lens} onChange={d.setLens} className="i-field" placeholder={d.detected?.lens ?? "From your photo"} />
                    {d.detected?.camera && <p className="i-hint">Camera and lens come from the photo unless you type your own.</p>}
                    <button type="submit" className="i-btn is-block" disabled={d.publishing}>
                        {d.progress ? <>Uploading <Count value={d.progress.current} total={d.progress.total} className="i-inline-count" /></> : d.publishing ? "Publishing…" : "Publish"}
                    </button>
                </section>
            </form>
        </div>
    );
}
