import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useDocumentKeys, useWheelToPage } from "../hooks/useReelKeys";
import { useSnapTrack } from "../hooks/useSnapTrack";
import { useLanguage } from "../lang/useLanguage";
import type { Post, PostImage } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";
import { IDLE_CURSOR_MS, workPhoto } from "../utils/motion";
import { WallLabel, type OwnerHandlers } from "./WallLabel";
import "./LightsOut.css";

/**
 * Lights out, inside the window: the page goes dark and the photograph fills
 * it. Nothing else is on screen, not even the cursor once the pointer rests.
 * One scroll down: the same wall label, white on black. A click on the photo
 * or Esc turns the lights back on; ←/→ or a swipe pages a series.
 */
export function LightsOut({
    post, images, start, onClose, owner,
}: { post: Post; images: PostImage[]; start: number; onClose: (at: number) => void; owner: OwnerHandlers }) {
    const { t } = useLanguage();
    const total = images.length;
    const caption = post.caption || t.reel.untitled;
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
        let timer = window.setTimeout(() => setIdle(true), IDLE_CURSOR_MS);
        function wake() {
            setIdle(false);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setIdle(true), IDLE_CURSOR_MS);
        }
        window.addEventListener("pointermove", wake, { passive: true });
        return () => {
            window.clearTimeout(timer);
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
        if (document.querySelector("[role=dialog]:not(.lights), [role=alertdialog]")) return;
        if (e.key === "Escape") {
            e.preventDefault();
            exit();
        } else if (!e.defaultPrevented && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            go(index + (e.key === "ArrowRight" ? 1 : -1));
        }
    });

    return (
        <div ref={rootRef} className={clsx("lights", idle && "is-idle")} role="dialog" aria-modal="true" aria-label={t.post.lightsOut(caption)}>
            <div className="lights-photo" onClick={exit}>
                <div
                    className="track lights-track is-stop"
                    ref={trackRef}
                    onScroll={onScroll}
                    onKeyDown={onKeyDown}
                    tabIndex={0}
                    aria-roledescription={total > 1 ? "carousel" : undefined}
                >
                    {images.map((im, i) => (
                        <figure key={im.image_path} className="lights-frame" aria-hidden={i !== index}>
                            <img
                                src={getImageUrl(im.image_path)}
                                alt={total > 1 ? t.post.photoOf(caption, i + 1, total) : caption}
                                style={i === index ? workPhoto(post.id) : undefined}
                            />
                        </figure>
                    ))}
                </div>
            </div>
            <section className="lights-label" aria-label={t.post.about}>
                <WallLabel post={post} dark owner={owner} />
            </section>
        </div>
    );
}
