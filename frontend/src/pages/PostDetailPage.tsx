import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, type UIEvent } from "react";
import clsx from "clsx";
import { motion, useScroll, useTransform } from "motion/react";
import { useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "../api/apiError";
import { getPostById } from "../api/postsApi";
import { useAuth } from "../auth/useAuth";
import { useFeedState } from "../feed/useFeedState";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useDocumentKeys, useWheelToPage } from "../hooks/useReelKeys";
import { useSnapTrack } from "../hooks/useSnapTrack";
import { useLanguage } from "../lang/useLanguage";
import { morph, useGo } from "../navigation/viewTransition";
import type { Post, PostImage } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";
import { IDLE_FADE_MS, isJa, scrollBehavior, workPhoto } from "../utils/motion";
import { AuthorLink } from "../components/AuthorLink";
import { CloseButton, Header } from "../components/Header";
import { JaText } from "../components/JaText";
import { LightsOut } from "../components/LightsOut";
import { Pager } from "../components/Pager";
import { forgetImages, imageTotal, knownImages, rememberImages } from "../components/postImages";
import type { PostRouteState } from "../components/Reel";
import { WallLabel, type OwnerHandlers } from "../components/WallLabel";
import "./PostDetailPage.css";

/**
 * A post (/posts/:postId): two snapped screens, the photograph and then its
 * wall label. It renders at once from the post a reel passed in router state
 * (cover + image_count, placeholders for the rest) and refreshes it from the
 * API.
 */
export function PostDetailPage() {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const { postId } = useParams<{ postId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const go = useGo();
    const { user } = useAuth();
    const { patchPost, invalidate } = useFeedState();

    const routeState = (location.state ?? {}) as PostRouteState;
    const id = Number(postId);
    const validId = Number.isInteger(id) && id > 0;

    const preview = routeState.post?.id === id ? routeState.post : null;
    const hasPreview = preview !== null;
    // The latest copy from the API or from a save; it wins over the preview.
    const [loaded, setLoaded] = useState<Post | null>(null);
    const post = loaded?.id === id ? loaded : preview;
    const [error, setError] = useState<unknown>(null);

    useEffect(() => {
        if (!validId) return;
        let live = true;
        getPostById(id)
            .then((p) => {
                if (!live) return;
                rememberImages(p);
                setLoaded(p);
                setError(null);
            })
            .catch((err: unknown) => {
                // A failed background refresh keeps the post on screen, unless
                // the post is gone (deleted since the reel loaded).
                if (live && (!hasPreview || (err instanceof ApiError && err.status === 404))) setError(err);
            });
        return () => {
            live = false;
        };
    }, [id, validId, hasPreview]);

    const returnTo = routeState.returnTo;
    const toProfile = returnTo?.startsWith("/users/") ?? false;
    // Back through history when the visitor came from a reel, so it lands on the
    // same work; otherwise to the feed.
    const leave = () => (returnTo && location.key !== "default" ? go(-1) : go(returnTo ?? "/"));

    const owner: OwnerHandlers = {
        onSaved: (updated) => {
            setLoaded(updated);
            patchPost(updated);
            // Keep the history entry in step, so Back to this page previews the edited post.
            if (hasPreview) navigate(location, { replace: true, state: { ...routeState, post: updated } });
            toast(t.toast.updated, { description: updated.caption ? <JaText text={updated.caption} /> : undefined });
        },
        onDeleted: () => {
            const caption = post?.caption;
            forgetImages(id);
            invalidate();
            toast(t.toast.deleted, { description: caption ? <JaText text={caption} /> : undefined });
            go(returnTo ?? (user ? `/users/${user.id}` : "/"), { replace: true });
        },
    };

    const header = <Header right={<CloseButton onClick={leave} aria-label={toProfile ? t.header.closeToProfile : t.header.closeToFeed} />} />;

    // Gone (also when a preview was on screen), a bad id, or a first load that failed.
    const notFound = !validId || (error instanceof ApiError && error.status === 404);
    if (notFound || (error != null && !post)) {
        return (
            <div className="page is-paper">
                {header}
                <main className="notice">
                    <p className="notice-text" role="alert">
                        {notFound ? t.apiErrors.postNotFound : toApiErrorMessage(error, { fallbackMessage: t.post.loadFailed, shouldLog: false })}
                    </p>
                </main>
            </div>
        );
    }
    if (!post) {
        return (
            <div className="page">
                {header}
                <main className="notice">
                    <p className="notice-text" role="status">{t.post.loading}</p>
                </main>
            </div>
        );
    }

    return <PostView key={post.id} post={post} header={header} start={routeState.image ?? 0} onLeave={leave} owner={owner} />;
}

/**
 * The post view: two screens on a snapped reel. Top: the photograph between
 * the header band and a caption bar (title and author | Info, ‹ 1/n ›), no
 * text on the picture; the controls fade after a few idle seconds. Bottom:
 * the wall label, alone. Info, I or one swipe move between them; Esc comes
 * back up, and Esc at the top (or Close) leaves. A click on the photo (or F)
 * turns the lights out.
 */
function PostView({ post, header, start, onLeave, owner }: { post: Post; header: ReactNode; start: number; onLeave: () => void; owner: OwnerHandlers }) {
    const { t } = useLanguage();
    const reelRef = useRef<HTMLDivElement>(null);
    const detailsRef = useRef<HTMLElement>(null);
    const total = imageTotal(post);
    const images = knownImages(post);
    const { index: shown, go: show, trackRef, onScroll, onKeyDown } = useSnapTrack(total, start);
    const [idle, setIdle] = useState(false);
    const [atTop, setAtTop] = useState(true);
    const [reading, setReading] = useState(false);
    const [full, setFull] = useState(false);
    const caption = post.caption || t.reel.untitled;

    // A vertical swipe the photo track latched still turns the page (photo ↔ label).
    useWheelToPage(trackRef, total > 1, reelRef);

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
        reel.addEventListener("scroll", sync, { passive: true });
        window.addEventListener("resize", sync);
        return () => {
            reel.removeEventListener("scroll", sync);
            window.removeEventListener("resize", sync);
        };
    }, []);

    // Idle at the top: the header and bar fade, and return on any input.
    useEffect(() => {
        const reel = reelRef.current;
        let timer = window.setTimeout(() => setIdle(true), IDLE_FADE_MS);
        function wake() {
            setIdle(false);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setIdle(true), IDLE_FADE_MS);
        }
        const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
        events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
        reel?.addEventListener("scroll", wake, { passive: true });
        return () => {
            window.clearTimeout(timer);
            events.forEach((ev) => window.removeEventListener(ev, wake));
            reel?.removeEventListener("scroll", wake);
        };
    }, []);

    function openFull() {
        if (!images[shown]) return; // still a placeholder
        morph(() => setFull(true));
    }

    function closeFull(at: number) {
        // Land on the photo the view ended on, without a slide behind the scenes.
        const track = trackRef.current;
        if (track) track.scrollTo({ left: at * track.clientWidth, behavior: "instant" });
        show(at);
        morph(() => setFull(false));
        window.requestAnimationFrame(() => trackRef.current?.querySelectorAll<HTMLElement>(".post-open")[at]?.focus({ preventScroll: true }));
    }

    const backToPhoto = () => reelRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
    const toggleInfo = () => (reading ? backToPhoto() : detailsRef.current?.scrollIntoView({ behavior: scrollBehavior() }));

    useDocumentKeys((e) => {
        if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
        if (e.key === "i" || e.key === "I") {
            e.preventDefault();
            toggleInfo();
        } else if (e.key === "f" || e.key === "F") {
            e.preventDefault();
            openFull();
        } else if (e.key === "Escape" && !e.defaultPrevented) {
            e.preventDefault();
            if (reading) backToPhoto();
            else onLeave();
        } else if (!e.defaultPrevented && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            // The focused track already handled it (React's listener runs before the document's).
            e.preventDefault();
            show(shown + (e.key === "ArrowRight" ? 1 : -1));
        }
    });

    const page = { "--page": post.tint ?? "var(--tint-default)" } as CSSProperties;
    return (
        <div className={clsx("page is-scroll is-post", idle && atTop && "is-idle", reading && "is-reading")} style={page}>
            {header}
            <div className="reel is-stop post-reel" ref={reelRef}>
                <div className="post-screen">
                    <div className="post-stage">
                        <Photos
                            post={post} images={images} total={total} shown={shown} trackRef={trackRef}
                            onScroll={onScroll} onKeyDown={onKeyDown} onOpen={openFull} named={!full}
                        />
                    </div>
                    <div className="post-bar">
                        <motion.div className="post-caption" style={{ opacity: capOut, visibility: capVisibility }}>
                            <h1 className={clsx(isJa(caption) && "is-ja")}>{caption}</h1>
                            <AuthorLink userId={post.user_id} username={post.username} />
                        </motion.div>
                        <div className="post-tools">
                            <button
                                type="button"
                                className="hlink info-link"
                                onClick={toggleInfo}
                                aria-controls="post-details"
                                aria-label={reading ? t.post.infoUp : t.post.infoDown}
                            >
                                {t.post.info}
                                <span className={clsx("info-chev", reading && "is-up")} aria-hidden="true" />
                            </button>
                            <Pager shown={shown} total={total} show={show} />
                        </div>
                    </div>
                </div>
                <section className="post-label" id="post-details" ref={detailsRef} aria-label={t.post.about}>
                    <WallLabel post={post} titleStyle={{ opacity: titleIn }} owner={owner} />
                </section>
            </div>
            {full && <LightsOut post={post} images={images} start={shown} onClose={closeFull} owner={owner} />}
        </div>
    );
}

/**
 * The post view's photo track. Each photo is a button into lights out.
 * `named` is off while lights out is up, so the photo's transition name is
 * never on the page twice. Photos not known yet are placeholders.
 */
function Photos({
    post, images, total, shown, trackRef, onScroll, onKeyDown, onOpen, named,
}: {
    post: Post;
    images: PostImage[];
    total: number;
    shown: number;
    trackRef: RefObject<HTMLDivElement | null>;
    onScroll: (e: UIEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onOpen: () => void;
    named: boolean;
}) {
    const { t } = useLanguage();
    const caption = post.caption || t.reel.untitled;
    // A photo loads once it is shown or next in line.
    const [reached, setReached] = useState(shown);
    if (shown > reached) setReached(shown);
    return (
        <div
            className="track post-track is-stop"
            ref={trackRef}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={total > 1 ? 0 : -1}
            aria-roledescription={total > 1 ? "carousel" : undefined}
            aria-label={total > 1 ? t.reel.photos(caption, total) : undefined}
        >
            {Array.from({ length: total }, (_, i) => {
                const image = images[i];
                const alt = total > 1 ? t.post.photoOf(caption, i + 1, total) : caption;
                return (
                    <figure key={i} className="post-frame" aria-hidden={i !== shown}>
                        {image && i <= reached + 1 ? (
                            <button type="button" className="post-open" onClick={onOpen} tabIndex={i === shown ? 0 : -1} aria-label={t.post.viewFull(alt)}>
                                <img
                                    src={getImageUrl(image.image_path)}
                                    alt={alt}
                                    decoding="async"
                                    fetchPriority={i === shown ? "high" : undefined}
                                    style={i === shown && named ? workPhoto(post.id) : undefined}
                                />
                            </button>
                        ) : (
                            <span className="frame-wait" />
                        )}
                    </figure>
                );
            })}
        </div>
    );
}
