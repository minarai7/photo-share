import { useRef, useState, type KeyboardEvent } from "react";
import type { PostImage } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";
import { useLanguage } from "../lang/useLanguage";

type ImageCarouselProps = {
    /** The images known so far, in order. */
    images: PostImage[];
    /**
     * How many images the post has. It can exceed images.length while the
     * page only has the feed's copy of the post (cover + image_count): the
     * missing slides show as placeholders until the full post arrives, so
     * the layout and controls don't jump.
     */
    total?: number;
    alt: string;
};

// After a button/dot/key scrolls the track, scroll events report the slides
// passed on the way; ignore them until the target is reached (or this long).
const PROGRAMMATIC_SCROLL_MS = 800;

/**
 * Shows a post's original images one at a time. The slides sit in a
 * horizontal scroll-snap track, so phones swipe natively (the photo follows
 * the finger, with momentum); buttons, dots and ←/→ scroll the same track.
 * A slide's image loads once it is shown or next in line. With a single
 * image it is just that image. Render it with key={post.id}.
 */
export function ImageCarousel({ images, total: totalProp, alt }: ImageCarouselProps) {
    const { t } = useLanguage();
    const [index, setIndex] = useState(0);
    // The furthest slide shown so far; slides up to one past it load.
    const [reached, setReached] = useState(0);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrollTarget = useRef<{ index: number; until: number } | null>(null);

    const total = Math.max(totalProp ?? images.length, images.length, 1);
    const current = Math.min(index, total - 1);

    if (total === 1) {
        return (
            <img
                className="post-detail-image"
                src={getImageUrl(images[0].image_path)}
                alt={alt}
                // The page's main image (its LCP element): fetch it first.
                fetchPriority="high"
            />
        );
    }

    function show(next: number) {
        setIndex(next);
        setReached((r) => Math.max(r, next));
    }

    function go(next: number) {
        const target = Math.max(0, Math.min(next, total - 1));
        show(target);
        const track = trackRef.current;
        if (track && typeof track.scrollTo === "function") {
            scrollTarget.current = { index: target, until: Date.now() + PROGRAMMATIC_SCROLL_MS };
            track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
        }
    }

    // A swipe (or trackpad scroll) moved the track: follow it.
    function handleScroll() {
        const track = trackRef.current;
        if (!track || track.clientWidth === 0) {
            return;
        }
        const shown = Math.max(0, Math.min(Math.round(track.scrollLeft / track.clientWidth), total - 1));
        const target = scrollTarget.current;
        if (target) {
            if (shown !== target.index && Date.now() < target.until) {
                return;
            }
            scrollTarget.current = null;
        }
        if (shown !== current) {
            show(shown);
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(current - 1);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            go(current + 1);
        }
    }

    return (
        <div
            className="image-carousel"
            role="region"
            aria-roledescription="carousel"
            aria-label={alt}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div className="image-carousel-frame">
                <div className="image-carousel-track" ref={trackRef} onScroll={handleScroll}>
                    {Array.from({ length: total }, (_, i) => {
                        const image = images[i];
                        return (
                            <div
                                key={i}
                                className="image-carousel-slide"
                                aria-hidden={i !== current}
                            >
                                {image && i <= reached + 1 && (
                                    <img
                                        className="image-carousel-image"
                                        src={getImageUrl(image.image_path)}
                                        alt={alt}
                                        fetchPriority={i === 0 ? "high" : undefined}
                                        decoding="async"
                                        draggable={false}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    className="image-carousel-button image-carousel-prev"
                    onClick={() => go(current - 1)}
                    disabled={current === 0}
                    aria-label={t.posts.previousImage}
                >
                    ‹
                </button>
                <button
                    type="button"
                    className="image-carousel-button image-carousel-next"
                    onClick={() => go(current + 1)}
                    disabled={current === total - 1}
                    aria-label={t.posts.nextImage}
                >
                    ›
                </button>

                <span className="image-carousel-counter" aria-live="polite">
                    {t.posts.imagePosition(current + 1, total)}
                </span>
            </div>

            <div className="image-carousel-dots">
                {Array.from({ length: total }, (_, i) => (
                    <button
                        key={i}
                        type="button"
                        className={i === current ? "image-carousel-dot is-active" : "image-carousel-dot"}
                        onClick={() => go(i)}
                        aria-label={t.posts.imagePosition(i + 1, total)}
                        aria-current={i === current ? "true" : undefined}
                    />
                ))}
            </div>
        </div>
    );
}
