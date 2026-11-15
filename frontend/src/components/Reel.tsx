import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import clsx from "clsx";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useLocation } from "react-router";
import { useFeedState } from "../feed/useFeedState";
import { useDocumentKeys, useInViewKey, stepReel, useWheelToPage } from "../hooks/useReelKeys";
import { useSnapTrack } from "../hooks/useSnapTrack";
import { useLanguage } from "../lang/useLanguage";
import { TransitionLink } from "../navigation/TransitionLink";
import type { Post } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";
import { SETTLE, isJa, scrollBehavior, workPhoto, yearOf } from "../utils/motion";
import { AuthorLink } from "./AuthorLink";
import { Count } from "./Count";
import { Pager } from "./Pager";
import { imageTotal, useSeriesImages } from "./postImages";
import { ReelContainerContext } from "./reelContext";
import "./Reel.css";

/** Where a post opened from a reel goes back to, and which photo it opens on. */
export type PostRouteState = { post?: Post; image?: number; returnTo?: string };

/** "Author · place · gear", in that order. */
export function CreditLine({ post, children }: { post: Post; children?: ReactNode }) {
    const gear = [post.camera_body, post.lens].filter(Boolean).join(" · ");
    return (
        <p className="credit-line">
            <AuthorLink userId={post.user_id} username={post.username} />
            {post.location && <span>{post.location}</span>}
            {gear && <span className="gear">{gear}</span>}
            {children}
        </p>
    );
}

/** The work's title up the left margin, with its year. */
export function VerticalTitle({ caption, year, as: Tag = "h2" }: { caption: string; year: number; as?: "h2" | "p" }) {
    return (
        <Tag className={clsx("vtitle", isJa(caption) && "is-ja")}>
            <span>{caption}</span>
            <em>{year}</em>
        </Tag>
    );
}

/** One work on a reel: vertical title, the photo track, credit line and pager. */
function Slide({ post, index, near, container }: { post: Post; index: number; near: boolean; container: RefObject<HTMLElement | null> }) {
    const { t } = useLanguage();
    const location = useLocation();
    const { setLastViewed } = useFeedState();
    const ref = useRef<HTMLElement>(null);
    const reduce = useReducedMotion();
    const total = imageTotal(post);
    const images = useSeriesImages(post, near);
    const { index: shown, go: show, trackRef, onScroll, onKeyDown } = useSnapTrack(total, 0);
    const [reached, setReached] = useState(0);
    const { scrollYProgress: p } = useScroll({ container, target: ref, offset: ["start end", "end start"] });
    const caption = post.caption || t.reel.untitled;

    // Settle: the work arrives a shade small (98.5%) and faint (55%) and
    // settles into place; centred, it is flat and full. Nothing moves sideways.
    const settleScale = useTransform(p, SETTLE.at, SETTLE.scale);
    const settleFade = useTransform(p, SETTLE.at, SETTLE.opacity);
    const stageStyle = reduce ? undefined : { scale: settleScale, opacity: settleFade };

    // Vertical wheel over a series scrolls the reel when the photo track has latched the gesture.
    useWheelToPage(trackRef, total > 1, container);

    // A slide's photo loads once it is shown or next in line.
    if (shown > reached) setReached(shown);

    const state: PostRouteState = { post, image: shown, returnTo: location.pathname + location.search };

    return (
        <section ref={ref} className="slide" data-key={post.id} aria-label={caption}>
            <VerticalTitle caption={caption} year={yearOf(post.created_at)} />

            <motion.div className="stage" style={stageStyle}>
                <div className="stage-inner">
                    <div
                        className="track is-stop"
                        ref={trackRef}
                        onScroll={onScroll}
                        onKeyDown={onKeyDown}
                        tabIndex={total > 1 ? 0 : -1}
                        aria-roledescription={total > 1 ? "carousel" : undefined}
                        aria-label={total > 1 ? t.reel.photos(caption, total) : undefined}
                    >
                        {Array.from({ length: total }, (_, i) => {
                            const image = images[i];
                            return (
                                <figure key={i} className="frame" aria-hidden={i !== shown}>
                                    {image && i <= reached + 1 ? (
                                        <TransitionLink
                                            to={`/posts/${post.id}`}
                                            state={state}
                                            onClick={() => setLastViewed(post.id)}
                                            aria-label={t.reel.openWork(caption)}
                                            tabIndex={i === shown ? 0 : -1}
                                        >
                                            <img
                                                src={getImageUrl(image.image_path)}
                                                alt={caption}
                                                loading={index < 2 && i === 0 ? "eager" : "lazy"}
                                                decoding="async"
                                                style={i === shown ? workPhoto(post.id) : undefined}
                                            />
                                        </TransitionLink>
                                    ) : (
                                        <span className="frame-wait" />
                                    )}
                                </figure>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            <footer className="credit">
                <CreditLine post={post} />
                <Pager shown={shown} total={total} show={show} />
            </footer>
        </section>
    );
}

type ReelProps = {
    posts: Post[];
    /** The hero above the first work. */
    intro?: ReactNode;
    /** Open on the first work, with the intro waiting above it (a member's landing hero). */
    startPastIntro?: boolean;
    header: (onIntro: boolean) => ReactNode;
    /** Shown instead of works when there are none. */
    empty?: ReactNode;
    /** The end card's sentence and link, once every work is loaded. */
    end: ReactNode;
    /** More works exist: the end of the reel is a loading card instead of the end card. */
    hasMore: boolean;
    /** Called as the end of the loaded works nears. */
    onNearEnd: () => void;
    /** The card at the end while more works load, or after loading them failed. */
    more: ReactNode;
    /** Every work these rules cover (the position counter's total), when known. */
    total?: number | null;
    /** Marks the feed's reel, which the wordmark scrolls to the top. */
    feed?: boolean;
};

/**
 * A vertical scroll-snap reel of an optional hero, slides and an end card.
 * It remembers the work on screen and lands on the last opened one when the
 * visitor comes back. Keys: ↓/↑, PgDn/PgUp, J/K, Space.
 */
export function Reel({ posts, intro, startPastIntro = false, header, empty, end, hasMore, onNearEnd, more, total, feed = false }: ReelProps) {
    const { t } = useLanguage();
    const { lastViewed, setInView } = useFeedState();
    const reelRef = useRef<HTMLDivElement | null>(null);
    const [reel, setReel] = useState<HTMLDivElement | null>(null);
    const inView = useInViewKey(".slide[data-key], .hero[data-key]", reel, posts.length);
    const position = posts.findIndex((p) => String(p.id) === inView);
    const current = position >= 0 ? posts[position] : null;
    const onIntro = !!intro && (inView === null || inView === "intro");

    // Remember the work on screen (log in / sign up stage it).
    useEffect(() => {
        setInView(current);
    }, [current, setInView]);

    // Load the next page while a few works are still ahead.
    useEffect(() => {
        if (hasMore && posts.length > 0 && position >= posts.length - 3) onNearEnd();
    }, [hasMore, position, posts.length, onNearEnd]);

    // A member's feed opens on the first work; scrolling up finds the landing hero.
    // Read once, on mount: the reel re-mounts when the rules change.
    const startPast = useRef(startPastIntro && intro != null && lastViewed == null);
    const landOn = useRef(lastViewed);
    useLayoutEffect(() => {
        const el = reelRef.current;
        if (!el) return;
        // Coming back from a post: land on it, not at the top.
        const target = landOn.current != null
            ? el.querySelector<HTMLElement>(`[data-key="${landOn.current}"]`)
            : startPast.current ? el.querySelector<HTMLElement>(".slide[data-key]") : null;
        if (target) el.scrollTo({ top: target.offsetTop, behavior: "instant" });
        else if (startPast.current && posts.length === 0) return; // works not loaded yet: try again when they are
        startPast.current = false;
        landOn.current = null;
    }, [posts.length]);

    useDocumentKeys((e) => {
        const el = reelRef.current;
        if (!el || document.querySelector("[role=dialog], [role=alertdialog]")) return;
        if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j" || e.key === " ") {
            e.preventDefault();
            stepReel(el, 1);
        } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
            e.preventDefault();
            stepReel(el, -1);
        }
    });

    const page = onIntro ? "var(--night)" : (current ?? posts[0])?.tint ?? "var(--tint-default)";
    const counterTotal = Math.max(total ?? 0, posts.length);

    return (
        <div className="page" style={{ "--page": page } as CSSProperties}>
            {header(onIntro)}
            <div
                className="reel is-stop"
                data-feed={feed ? "" : undefined}
                ref={(el) => {
                    reelRef.current = el;
                    setReel(el);
                }}
            >
                <ReelContainerContext.Provider value={reelRef}>{intro}</ReelContainerContext.Provider>
                {posts.length === 0 && !hasMore && empty}
                {posts.map((p, i) => (
                    <Slide key={p.id} post={p} index={i} near={Math.abs(i - Math.max(position, 0)) <= 1} container={reelRef} />
                ))}
                {hasMore ? (
                    <section className="end">{more}</section>
                ) : (
                    posts.length > 0 && (
                        <section className="end">
                            {end}
                            <button type="button" className="textlink" onClick={() => reelRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })}>
                                {t.reel.backToTop}
                            </button>
                        </section>
                    )
                )}
            </div>

            {!onIntro && position >= 0 && (
                <div className="progress" aria-hidden="true">
                    <Count value={position + 1} total={counterTotal} pad label={`${position + 1} / ${counterTotal}`} />
                </div>
            )}
        </div>
    );
}
