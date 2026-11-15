// Behaviour-only building blocks shared by every prototype variant. They
// carry structure, accessibility and interaction (Base UI, dnd kit, Sonner,
// NumberFlow) and stable class names; each variant's stylesheet decides how
// they look. This mirrors the split the real revamp would use: specialist
// components own behaviour, the design layer owns appearance.
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Field } from "@base-ui/react/field";
import { Menu } from "@base-ui/react/menu";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import NumberFlow from "@number-flow/react";
import { Toaster, toast } from "sonner";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    horizontalListSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ME, mockGearLink, type ProtoGearResult, type ProtoPost } from "../data";
import { useProto } from "../protoContext";
import type { Draft, DraftPhoto } from "./hooks";

// ---------------------------------------------------------------- Text field

type TextFieldProps = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    hint?: ReactNode;
    type?: "text" | "email" | "password";
    placeholder?: string;
    autoComplete?: string;
    className?: string;
};

export function TextField({ label, value, onChange, error, hint, type = "text", placeholder, autoComplete, className }: TextFieldProps) {
    return (
        <Field.Root className={clsx("tf", className)} invalid={!!error}>
            <Field.Label className="tf-label">{label}</Field.Label>
            <Field.Control
                className="tf-input"
                type={type}
                value={value}
                placeholder={placeholder}
                autoComplete={autoComplete}
                onChange={(e) => onChange(e.target.value)}
            />
            {hint && !error && <Field.Description className="tf-hint">{hint}</Field.Description>}
            {error && (
                <Field.Error className="tf-error" match>
                    {error}
                </Field.Error>
            )}
        </Field.Root>
    );
}

// ---------------------------------------------------------------- Counter

export function Count({ value, total, pad = false, className }: { value: number; total: number; pad?: boolean; className?: string }) {
    return (
        <span className={clsx("count", className)} role="status" aria-label={`Photo ${value} of ${total}`}>
            <span className="count-now" aria-hidden="true">
                <NumberFlow value={value} format={pad ? { minimumIntegerDigits: 2 } : undefined} />
            </span>
            <span className="count-sep" aria-hidden="true">/</span>
            <span className="count-total" aria-hidden="true">{pad ? String(total).padStart(2, "0") : total}</span>
        </span>
    );
}

// ---------------------------------------------------------------- Gear lookup (POST /ai/gear-link)

export function GearLink({ name, label = "Find", className }: { name: string; label?: ReactNode; className?: string }) {
    const { portal, signedIn, go } = useProto();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ProtoGearResult | null>(null);

    async function find() {
        if (!signedIn) {
            go({ screen: "login" });
            return;
        }
        setLoading(true);
        await new Promise((r) => setTimeout(r, 900));
        setResult(mockGearLink(name));
        setLoading(false);
        setOpen(true);
    }

    return (
        <>
            <button
                type="button"
                className={clsx("gl-trigger", className)}
                onClick={find}
                disabled={loading}
                aria-label={`Find product pages for ${name}`}
            >
                {loading ? "Finding…" : label}
            </button>
            <Dialog.Root open={open} onOpenChange={setOpen}>
                <Dialog.Portal container={portal}>
                    <Dialog.Backdrop className="gl-backdrop" />
                    <Dialog.Popup className="gl-popup">
                        <p className="gl-kicker">Gear lookup · AI</p>
                        <Dialog.Title className="gl-title">{result?.name}</Dialog.Title>
                        <Dialog.Description className="gl-summary">{result?.summary}</Dialog.Description>
                        <ul className="gl-list">
                            {result?.suggestions.map((s) => (
                                <li key={s.url} className="gl-item">
                                    <a href={s.url} target="_blank" rel="noreferrer" className="gl-link">
                                        {s.title}
                                    </a>
                                    <span className="gl-confidence" data-level={s.confidence}>
                                        {s.confidence}
                                    </span>
                                    <p className="gl-reason">{s.reason}</p>
                                </li>
                            ))}
                        </ul>
                        <p className="gl-note">Suggestions are generated by AI and can be wrong. Check the page before you buy.</p>
                        <Dialog.Close className="gl-close">Close</Dialog.Close>
                    </Dialog.Popup>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}

// ---------------------------------------------------------------- Delete (owner)

export function ConfirmDelete({ post, className, children = "Delete" }: { post: ProtoPost; className?: string; children?: ReactNode }) {
    const { portal, go } = useProto();
    const count = post.images.length;
    return (
        <AlertDialog.Root>
            <AlertDialog.Trigger className={clsx("cd-trigger", className)}>{children}</AlertDialog.Trigger>
            <AlertDialog.Portal container={portal}>
                <AlertDialog.Backdrop className="cd-backdrop" />
                <AlertDialog.Popup className="cd-popup">
                    <AlertDialog.Title className="cd-title">Delete this post?</AlertDialog.Title>
                    <AlertDialog.Description className="cd-desc">
                        “{post.caption}” and its {count === 1 ? "photo" : `${count} photos`} will be removed from Photo Share. This can’t be undone.
                    </AlertDialog.Description>
                    <div className="cd-actions">
                        <AlertDialog.Close className="cd-cancel">Cancel</AlertDialog.Close>
                        <AlertDialog.Close
                            className="cd-confirm"
                            onClick={() => {
                                toast("Post deleted", { description: post.caption });
                                go({ screen: "profile", userId: ME.id });
                            }}
                        >
                            Delete post
                        </AlertDialog.Close>
                    </div>
                </AlertDialog.Popup>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}

// ---------------------------------------------------------------- Edit (owner)

export function EditPost({ post, className, children = "Edit" }: { post: ProtoPost; className?: string; children?: ReactNode }) {
    const { portal } = useProto();
    const [open, setOpen] = useState(false);
    const [caption, setCaption] = useState(post.caption);
    const [location, setLocation] = useState(post.location ?? "");
    const [camera, setCamera] = useState(post.camera_body ?? "");
    const [lens, setLens] = useState(post.lens ?? "");

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className={clsx("ep-trigger", className)}>{children}</Dialog.Trigger>
            <Dialog.Portal container={portal}>
                <Dialog.Backdrop className="ep-backdrop" />
                <Dialog.Popup className="ep-popup">
                    <Dialog.Title className="ep-title">Edit post</Dialog.Title>
                    <form
                        className="ep-form"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setOpen(false);
                            toast("Changes saved", { description: caption });
                        }}
                    >
                        <TextField label="Title" value={caption} onChange={setCaption} />
                        <TextField label="Location" value={location} onChange={setLocation} />
                        <TextField label="Camera" value={camera} onChange={setCamera} />
                        <TextField label="Lens" value={lens} onChange={setLens} />
                        <div className="ep-actions">
                            <Dialog.Close className="ep-cancel">Cancel</Dialog.Close>
                            <button type="submit" className="ep-save">
                                Save changes
                            </button>
                        </div>
                    </form>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// ---------------------------------------------------------------- Sortable photos (create post)

function SortablePhoto({ photo, index, total, draft }: { photo: DraftPhoto; index: number; total: number; draft: Draft }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.key });
    return (
        <li
            ref={setNodeRef}
            className="sp-item"
            data-dragging={isDragging ? "" : undefined}
            data-orientation={photo.image.w > photo.image.h ? "landscape" : photo.image.w < photo.image.h ? "portrait" : "square"}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            {...attributes}
            {...listeners}
            aria-label={`Photo ${index + 1} of ${total}, ${photo.name}. Drag, or press space then arrow keys, to reorder.`}
        >
            <img className="sp-img" src={photo.image.src} alt="" draggable={false} />
            {index === 0 && <span className="sp-cover">Cover</span>}
            <span className="sp-index" aria-hidden="true">
                {index + 1}
            </span>
            <button
                type="button"
                className="sp-remove"
                aria-label={`Remove photo ${index + 1}`}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={() => draft.remove(photo.key)}
            >
                ×
            </button>
        </li>
    );
}

export function SortablePhotos({
    draft,
    direction = "grid",
    addSlot,
    className,
}: {
    draft: Draft;
    direction?: "grid" | "row";
    addSlot?: ReactNode;
    className?: string;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    function onDragEnd({ active, over }: DragEndEvent) {
        if (over && active.id !== over.id) draft.reorder(String(active.id), String(over.id));
    }
    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
                items={draft.photos.map((p) => p.key)}
                strategy={direction === "row" ? horizontalListSortingStrategy : rectSortingStrategy}
            >
                <ol className={clsx("sp-list", className)} data-direction={direction}>
                    {draft.photos.map((p, i) => (
                        <SortablePhoto key={p.key} photo={p} index={i} total={draft.photos.length} draft={draft} />
                    ))}
                    {addSlot}
                </ol>
            </SortableContext>
        </DndContext>
    );
}

// ---------------------------------------------------------------- Language toggle

export function LangToggle({ className }: { className?: string }) {
    const [lang, setLang] = useState<string>("en");
    return (
        <ToggleGroup
            className={clsx("lt", className)}
            value={[lang]}
            onValueChange={(v) => v[0] && setLang(v[0])}
            aria-label="Language"
        >
            <Toggle value="en" className="lt-item" aria-label="English">
                EN
            </Toggle>
            <Toggle value="ja" className="lt-item" aria-label="日本語">
                JA
            </Toggle>
        </ToggleGroup>
    );
}

// ---------------------------------------------------------------- Account menu

export function AccountMenu({ children, className }: { children: ReactNode; className?: string }) {
    const { portal, go, signOut } = useProto();
    return (
        <Menu.Root>
            <Menu.Trigger className={clsx("am-trigger", className)} aria-label={`Account: ${ME.username}`}>
                {children}
            </Menu.Trigger>
            <Menu.Portal container={portal}>
                <Menu.Positioner className="am-positioner" sideOffset={10} align="end">
                    <Menu.Popup className="am-popup">
                        <Menu.Item className="am-item" onClick={() => go({ screen: "profile", userId: ME.id })}>
                            Your profile
                        </Menu.Item>
                        <Menu.Item className="am-item" onClick={() => go({ screen: "create" })}>
                            New post
                        </Menu.Item>
                        <Menu.Separator className="am-sep" />
                        <Menu.Item
                            className="am-item"
                            onClick={() => {
                                signOut();
                                toast("Signed out");
                            }}
                        >
                            Log out
                        </Menu.Item>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

// ---------------------------------------------------------------- Toasts

export function Toasts({ position = "bottom-right" }: { position?: "bottom-right" | "top-center" | "bottom-left" | "top-right" }) {
    return (
        <Toaster
            position={position}
            offset={24}
            toastOptions={{
                unstyled: true,
                classNames: { toast: "ts", title: "ts-title", description: "ts-desc" },
            }}
        />
    );
}
