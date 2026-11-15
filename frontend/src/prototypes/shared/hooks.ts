import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { ME, PICKABLE, type ProtoImage } from "../data";
import { useProto } from "../protoContext";

// ---------------------------------------------------------------------------
// Horizontal scroll-snap track (same model as src/components/ImageCarousel):
// phones swipe natively, buttons and ←/→ scroll the same track.
// ---------------------------------------------------------------------------

export function useSnapTrack(total: number, initial = 0) {
    const [index, setIndex] = useState(() => Math.max(0, Math.min(initial, total - 1)));
    const trackRef = useRef<HTMLDivElement>(null);
    const target = useRef<{ index: number; until: number } | null>(null);

    // Open on the requested photo without animating (e.g. the 2nd of 3,
    // carried over from the feed into the post view).
    const startAt = useRef(index);
    useLayoutEffect(() => {
        const track = trackRef.current;
        if (track && startAt.current > 0) {
            track.scrollTo({ left: startAt.current * track.clientWidth, behavior: "instant" });
        }
    }, []);

    const go = useCallback(
        (next: number) => {
            const i = Math.max(0, Math.min(next, total - 1));
            setIndex(i);
            const track = trackRef.current;
            if (track) {
                target.current = { index: i, until: Date.now() + 800 };
                track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
            }
        },
        [total],
    );

    function onScroll() {
        const track = trackRef.current;
        if (!track || track.clientWidth === 0) return;
        const shown = Math.max(0, Math.min(Math.round(track.scrollLeft / track.clientWidth), total - 1));
        const t = target.current;
        if (t) {
            if (shown !== t.index && Date.now() < t.until) return;
            target.current = null;
        }
        setIndex(shown);
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "ArrowLeft" && index > 0) {
            e.preventDefault();
            go(index - 1);
        } else if (e.key === "ArrowRight" && index < total - 1) {
            e.preventDefault();
            go(index + 1);
        }
    }

    return { index, go, trackRef, onScroll, onKeyDown };
}

// ---------------------------------------------------------------------------
// Create-post draft: a fake file picker (offers PICKABLE), reorder, remove,
// EXIF autofill from the first photo that has gear, staged upload progress.
// ---------------------------------------------------------------------------

export type DraftPhoto = {
    key: string;
    name: string;
    image: ProtoImage;
    tint?: string;
    exif: { camera: string | null; lens: string | null };
};

export function useDraft() {
    const { go } = useProto();
    const [photos, setPhotos] = useState<DraftPhoto[]>([]);
    const [caption, setCaption] = useState("");
    const [location, setLocation] = useState("");
    const [camera, setCamera] = useState("");
    const [lens, setLens] = useState("");
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const detected = photos.find((p) => p.exif.camera)?.exif ?? null;
    const canAddMore = photos.length < PICKABLE.length;

    function addPhotos() {
        const next = PICKABLE.filter((p) => !photos.some((x) => x.name === p.name)).map((p) => ({ key: p.name, ...p }));
        setPhotos((current) => [...current, ...next]);
        setError(null);
    }

    function remove(key: string) {
        setPhotos((current) => current.filter((p) => p.key !== key));
    }

    function reorder(activeKey: string, overKey: string) {
        setPhotos((current) => {
            const from = current.findIndex((p) => p.key === activeKey);
            const to = current.findIndex((p) => p.key === overKey);
            return from < 0 || to < 0 ? current : arrayMove(current, from, to);
        });
    }

    function move(key: string, delta: -1 | 1) {
        setPhotos((current) => {
            const from = current.findIndex((p) => p.key === key);
            const to = from + delta;
            return to < 0 || to >= current.length ? current : arrayMove(current, from, to);
        });
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (photos.length === 0) {
            setError("Add at least one photo.");
            return;
        }
        setError(null);
        setPublishing(true);
        for (let i = 0; i < photos.length; i++) {
            setProgress({ current: i + 1, total: photos.length });
            await new Promise((r) => setTimeout(r, 550));
        }
        setProgress(null);
        await new Promise((r) => setTimeout(r, 300));
        setPublishing(false);
        toast("Post published", { description: caption.trim() || "Untitled" });
        go({ screen: "feed" });
    }

    return {
        photos, addPhotos, remove, reorder, move, canAddMore,
        caption, setCaption, location, setLocation, camera, setCamera, lens, setLens,
        detected, progress, publishing, error, submit,
    };
}

export type Draft = ReturnType<typeof useDraft>;

// ---------------------------------------------------------------------------
// Log in / sign up. Type the password "wrong" to see the server-error state.
// ---------------------------------------------------------------------------

export type AuthMode = "login" | "signup";

export function useAuthForm(mode: AuthMode) {
    const { signIn, go } = useProto();
    const [email, setEmail] = useState(mode === "login" ? "aoi@example.com" : "");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState<Partial<Record<"email" | "username" | "password", string>>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        const next: typeof errors = {};
        if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter an email address like name@example.com.";
        if (mode === "signup" && !/^[a-z0-9._]{3,30}$/.test(username)) {
            next.username = "3–30 characters: lowercase letters, numbers, dots and underscores.";
        }
        if (mode === "signup" ? password.length < 8 : password.length === 0) {
            next.password = mode === "signup" ? "Use at least 8 characters." : "Enter your password.";
        }
        setErrors(next);
        setFormError(null);
        if (Object.keys(next).length) return;

        setPending(true);
        await new Promise((r) => setTimeout(r, 700));
        setPending(false);
        if (password === "wrong") {
            setFormError("Email or password is incorrect.");
            return;
        }
        signIn();
        toast(mode === "signup" ? "Welcome to Photo Share" : "Welcome back", {
            description: mode === "signup" ? `Signed up as ${username}` : `Signed in as ${ME.username}`,
        });
        go({ screen: "feed" });
    }

    return { email, setEmail, username, setUsername, password, setPassword, errors, formError, pending, submit };
}

// ---------------------------------------------------------------------------
// Which element (by data-key) is crossing the viewport's middle line.
// ---------------------------------------------------------------------------

export function useInViewKey(selector: string, root?: HTMLElement | null) {
    const [key, setKey] = useState<string | null>(null);
    useEffect(() => {
        const els = Array.from((root ?? document).querySelectorAll<HTMLElement>(selector));
        if (els.length === 0) return;
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) setKey((e.target as HTMLElement).dataset.key ?? null);
                }
            },
            { root: root ?? null, rootMargin: "-50% 0px -50% 0px" },
        );
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [selector, root]);
    return key;
}

/** Keys pressed while nothing editable has focus; handlers that act call preventDefault. */
export function useDocumentKeys(handler: (e: globalThis.KeyboardEvent) => void) {
    const ref = useRef(handler);
    useEffect(() => {
        ref.current = handler;
    });
    useEffect(() => {
        function onKey(e: globalThis.KeyboardEvent) {
            const el = e.target as HTMLElement | null;
            if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            ref.current(e);
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);
}
