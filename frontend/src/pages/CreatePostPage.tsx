import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type FormEvent } from "react";
import clsx from "clsx";
import { arrayMove } from "@dnd-kit/sortable";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { createPost } from "../api/postsApi";
import { uploadImage } from "../api/uploadsApi";
import { useAuth } from "../auth/useAuth";
import { MAX_IMAGES_PER_POST, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../config/upload";
import { useFeedState } from "../feed/useFeedState";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useDocumentKeys } from "../hooks/useReelKeys";
import { useLanguage } from "../lang/useLanguage";
import { useGo } from "../navigation/viewTransition";
import type { CreatePostRequest, PostImage } from "../types/post";
import type { UploadImageResponse } from "../types/upload";
import { readGear, type Gear } from "../utils/exif";
import { previewTint } from "../utils/previewTint";
import { Count } from "../components/Count";
import { CloseButton, Header } from "../components/Header";
import { VerticalTitle } from "../components/Reel";
import { SortablePhotos } from "../components/SortablePhotos";
import { FormError, TextField } from "../components/TextField";
import "./CreatePostPage.css";

type SelectedPhoto = {
    key: string;
    file: File;
    previewUrl: string;
    /** Camera and lens read from the photo in the browser; null until read. */
    gear: Gear | null;
};

type Progress = { current: number; total: number };

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * New post: a live preview of the slide it will become. The typed title runs
 * up the margin, the cover sits on its own colour, your name, place and gear
 * form the credit line beneath, and the page turns the cover's colour. The
 * fields sit in a side panel. Photos upload one at a time at Publish (a retry
 * doesn't re-upload what already went through); camera and lens are read
 * from the photos in the browser, so the placeholders show them at once.
 */
export function CreatePostPage() {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const { user } = useAuth();
    const { invalidate } = useFeedState();
    const location = useLocation();
    const go = useGo();

    // In display order; the first is the cover.
    const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
    const [caption, setCaption] = useState("");
    const [place, setPlace] = useState("");
    const [camera, setCamera] = useState("");
    const [lens, setLens] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [coverTint, setCoverTint] = useState<{ url: string; tint: string } | null>(null);

    const fileInput = useRef<HTMLInputElement>(null);
    const nextKey = useRef(0);
    // Uploads that already succeeded, so a retry after a failed create (or a
    // failed later upload) does not send the same file again.
    const uploaded = useRef(new Map<File, UploadImageResponse>());
    // Every preview URL still alive, revoked on removal and on unmount.
    const previewUrls = useRef(new Set<string>());

    useEffect(() => {
        const urls = previewUrls.current;
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    // Close (and Esc): back to wherever the visitor came from (the links to
    // this page pass returnTo), else the feed.
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    const cameFrom = returnTo != null && location.key !== "default";
    const leave = () => (cameFrom ? go(-1) : go("/"));
    const closeLabel = !cameFrom
        ? t.header.closeToFeed
        : returnTo.startsWith("/posts/")
          ? t.header.closeToPost
          : returnTo.startsWith("/users/")
            ? t.header.closeToProfile
            : t.header.closeToFeed;
    useDocumentKeys((e) => {
        // Esc also cancels a keyboard drag in the filmstrip: never leave mid-drag.
        if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role=dialog], [data-dragging]")) {
            e.preventDefault();
            leave();
        }
    });

    function addFiles(chosen: File[]) {
        if (chosen.length === 0) return;
        let nextError: string | null = null;
        let accepted = chosen.filter((file) => ACCEPTED_TYPES.includes(file.type));
        if (accepted.length < chosen.length) nextError = t.validation.photoWrongType;
        const small = accepted.filter((file) => file.size <= MAX_UPLOAD_BYTES);
        if (small.length < accepted.length) nextError = t.validation.photoTooLarge(MAX_UPLOAD_MB);
        accepted = small;
        const room = MAX_IMAGES_PER_POST - photos.length;
        if (accepted.length > room) {
            accepted = accepted.slice(0, Math.max(room, 0));
            nextError = t.validation.tooManyPhotos(MAX_IMAGES_PER_POST);
        }
        setError(nextError);

        const added = accepted.map((file) => {
            const previewUrl = URL.createObjectURL(file);
            previewUrls.current.add(previewUrl);
            return { key: String(nextKey.current++), file, previewUrl, gear: null };
        });
        setPhotos((current) => [...current, ...added]);
        for (const photo of added) {
            void readGear(photo.file).then((gear) =>
                setPhotos((current) => current.map((p) => (p.key === photo.key ? { ...p, gear } : p))),
            );
        }
    }

    function onPick(e: ChangeEvent<HTMLInputElement>) {
        const chosen = Array.from(e.target.files ?? []);
        // Clear the input so choosing the same file again still fires onChange.
        e.target.value = "";
        addFiles(chosen);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        if (!publishing) addFiles(Array.from(e.dataTransfer.files));
    }

    function remove(key: string) {
        const removed = photos.find((p) => p.key === key);
        if (removed) {
            URL.revokeObjectURL(removed.previewUrl);
            previewUrls.current.delete(removed.previewUrl);
        }
        setPhotos((current) => current.filter((p) => p.key !== key));
        setError(null);
    }

    function reorder(activeKey: string, overKey: string) {
        setPhotos((current) => {
            const from = current.findIndex((p) => p.key === activeKey);
            const to = current.findIndex((p) => p.key === overKey);
            return from < 0 || to < 0 ? current : arrayMove(current, from, to);
        });
    }

    async function publish(e: FormEvent) {
        e.preventDefault();
        if (photos.length === 0) {
            setError(t.validation.photoRequired);
            return;
        }
        setError(null);
        setPublishing(true);
        try {
            // One file at a time: the server decodes one image at a time anyway,
            // and the user sees which file failed.
            const results: UploadImageResponse[] = [];
            for (const [i, photo] of photos.entries()) {
                setProgress({ current: i + 1, total: photos.length });
                let result = uploaded.current.get(photo.file);
                if (!result) {
                    result = await uploadImage(photo.file);
                    uploaded.current.set(photo.file, result);
                }
                results.push(result);
            }
            setProgress(null);

            const images: PostImage[] = results.map((r) =>
                r.thumbnail_path ? { image_path: r.image_path, thumbnail_path: r.thumbnail_path } : { image_path: r.image_path },
            );
            const data: CreatePostRequest = { images, caption: caption.trim() };
            if (place.trim()) data.location = place.trim();
            // What the user typed wins; blank fields fall back to the photos'
            // EXIF data (read here, else as the server read it).
            const cameraName = camera.trim() || detected.camera || results.find((r) => r.camera_body)?.camera_body;
            if (cameraName) data.camera_body = cameraName;
            const lensName = lens.trim() || detected.lens || results.find((r) => r.lens)?.lens;
            if (lensName) data.lens = lensName;

            const post = await createPost(data);
            invalidate();
            toast(t.toast.published, { description: post.caption || undefined });
            go(`/posts/${post.id}`, { replace: true, state: { post, returnTo: user ? `/users/${user.id}` : "/" } });
        } catch (err) {
            setError(toApiErrorMessage(err, { fallbackMessage: t.compose.failed }));
        } finally {
            setProgress(null);
            setPublishing(false);
        }
    }

    // The first photo that records a camera (and lens) gives the placeholders.
    const withGear = photos.find((p) => p.gear?.camera || p.gear?.lens)?.gear;
    const detected: Gear = { camera: withGear?.camera ?? null, lens: withGear?.lens ?? null };
    const cover = photos[0];
    const title = caption.trim() || t.compose.untitled;
    const gearLine = [camera.trim() || detected.camera, lens.trim() || detected.lens].filter(Boolean).join(" · ");
    const canAddMore = photos.length < MAX_IMAGES_PER_POST && !publishing;
    const tint = cover && coverTint?.url === cover.previewUrl ? coverTint.tint : null;
    const pageStyle = { "--page": tint ?? "var(--paper)" } as CSSProperties;

    return (
        <div className="page is-compose" style={pageStyle}>
            <Header right={<CloseButton onClick={leave} aria-label={closeLabel} />} />
            <form className="compose" onSubmit={publish} noValidate>
                <section className="compose-stage" aria-label={t.compose.preview} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
                    <VerticalTitle as="p" caption={title} year={new Date().getFullYear()} />
                    <p className="compose-kicker">{t.compose.preview}</p>
                    {cover ? (
                        <figure className="compose-work">
                            <img
                                src={cover.previewUrl}
                                alt={t.compose.coverAlt(cover.file.name)}
                                onLoad={(e) => {
                                    const tinted = previewTint(e.currentTarget);
                                    if (tinted) setCoverTint({ url: cover.previewUrl, tint: tinted });
                                }}
                            />
                        </figure>
                    ) : (
                        <button type="button" className="compose-empty" onClick={() => fileInput.current?.click()}>
                            <span className="compose-empty-title">{t.compose.choosePhotos}</span>
                            <span className="compose-empty-sub">{t.compose.limits(MAX_IMAGES_PER_POST, MAX_UPLOAD_MB)}</span>
                        </button>
                    )}
                    <p className="credit-line">
                        {user && <span className="author is-plain">{user.username}</span>}
                        {place.trim() && <span>{place.trim()}</span>}
                        {gearLine && <span className="gear">{gearLine}</span>}
                    </p>
                    {photos.length > 0 && (
                        <div className="filmstrip">
                            <SortablePhotos
                                photos={photos.map((p) => ({ key: p.key, name: p.file.name, previewUrl: p.previewUrl }))}
                                onReorder={reorder}
                                onRemove={remove}
                                disabled={publishing}
                                addSlot={
                                    canAddMore ? (
                                        <li className="add-tile">
                                            <button type="button" onClick={() => fileInput.current?.click()} aria-label={t.compose.addPhotos}>+</button>
                                        </li>
                                    ) : undefined
                                }
                            />
                            <p className="hint">{t.compose.reorderHint}</p>
                        </div>
                    )}
                    <input
                        ref={fileInput}
                        type="file"
                        accept={ACCEPTED_TYPES.join(",")}
                        multiple
                        hidden
                        onChange={onPick}
                        disabled={!canAddMore}
                        aria-label={t.compose.choosePhotos}
                    />
                </section>
                <section className="compose-panel" aria-label={t.compose.title}>
                    <h1 className="form-title">{t.compose.title}</h1>
                    {error && <FormError>{error}</FormError>}
                    <TextField label={t.compose.caption} value={caption} onChange={setCaption} placeholder={t.compose.untitled} disabled={publishing} name="caption" />
                    <TextField label={t.compose.place} value={place} onChange={setPlace} placeholder={t.compose.optional} disabled={publishing} name="location" />
                    <TextField label={t.compose.camera} value={camera} onChange={setCamera} placeholder={detected.camera ?? t.compose.fromPhoto} disabled={publishing} name="camera" />
                    <TextField label={t.compose.lens} value={lens} onChange={setLens} placeholder={detected.lens ?? t.compose.fromPhoto} disabled={publishing} name="lens" />
                    {(detected.camera || detected.lens) && <p className="hint">{t.compose.gearHint}</p>}
                    <button type="submit" className={clsx("btn is-block")} disabled={publishing}>
                        {progress ? (
                            <>
                                {t.compose.uploading}
                                <Count value={progress.current} total={progress.total} className="inline-count" label={`${progress.current} / ${progress.total}`} />
                            </>
                        ) : publishing ? t.compose.publishing : t.compose.publish}
                    </button>
                </section>
            </form>
        </div>
    );
}
