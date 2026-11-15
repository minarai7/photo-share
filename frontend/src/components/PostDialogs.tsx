import { useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { deletePostById, updatePostById } from "../api/postsApi";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useLanguage } from "../lang/useLanguage";
import type { Post, UpdatePostRequest } from "../types/post";
import { imageTotal } from "./postImages";
import { FormError, TextField } from "./TextField";

/** Edit: the post's text and gear (its photos are fixed), in a dialog. */
export function EditPostDialog({ post, className, onSaved }: { post: Post; className?: string; onSaved: (post: Post) => void }) {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const [open, setOpen] = useState(false);
    const [caption, setCaption] = useState("");
    const [location, setLocation] = useState("");
    const [camera, setCamera] = useState("");
    const [lens, setLens] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function openChange(next: boolean) {
        if (next) {
            // Start from the post as it is now.
            setCaption(post.caption ?? "");
            setLocation(post.location ?? "");
            setCamera(post.camera_body ?? "");
            setLens(post.lens ?? "");
            setError(null);
        }
        if (!saving) setOpen(next);
    }

    async function save(e: FormEvent) {
        e.preventDefault();
        const data: UpdatePostRequest = { caption: caption.trim() };
        if (location.trim()) data.location = location.trim();
        if (camera.trim()) data.camera_body = camera.trim();
        if (lens.trim()) data.lens = lens.trim();
        setSaving(true);
        setError(null);
        try {
            const updated = await updatePostById(post.id, data);
            setOpen(false);
            onSaved(updated);
        } catch (err) {
            setError(toApiErrorMessage(err, { fallbackMessage: t.editPost.failed }));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog.Root open={open} onOpenChange={openChange}>
            <Dialog.Trigger className={className}>{t.post.edit}</Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Backdrop className="dialog-backdrop" />
                <Dialog.Popup className="dialog">
                    <Dialog.Title className="dialog-title">{t.editPost.title}</Dialog.Title>
                    <form className="dialog-form" onSubmit={save} noValidate>
                        {error && <FormError>{error}</FormError>}
                        <TextField label={t.editPost.caption} value={caption} onChange={setCaption} disabled={saving} />
                        <TextField label={t.editPost.place} value={location} onChange={setLocation} disabled={saving} />
                        <TextField label={t.editPost.camera} value={camera} onChange={setCamera} disabled={saving} />
                        <TextField label={t.editPost.lens} value={lens} onChange={setLens} disabled={saving} />
                        <div className="dialog-actions">
                            <Dialog.Close className="dialog-link" disabled={saving}>{t.editPost.cancel}</Dialog.Close>
                            <button type="submit" className="dialog-confirm" disabled={saving}>
                                {saving ? t.editPost.saving : t.editPost.save}
                            </button>
                        </div>
                    </form>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/** Delete always confirms in a dialog. */
export function ConfirmDeleteDialog({ post, className, onDeleted }: { post: Post; className?: string; onDeleted: () => void }) {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const [open, setOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function confirm() {
        setDeleting(true);
        setError(null);
        try {
            await deletePostById(post.id);
            setOpen(false);
            onDeleted();
        } catch (err) {
            setError(toApiErrorMessage(err, { fallbackMessage: t.deletePost.failed }));
        } finally {
            setDeleting(false);
        }
    }

    return (
        <AlertDialog.Root
            open={open}
            onOpenChange={(next) => {
                if (deleting) return;
                setError(null);
                setOpen(next);
            }}
        >
            <AlertDialog.Trigger className={className}>{t.post.delete}</AlertDialog.Trigger>
            <AlertDialog.Portal>
                <AlertDialog.Backdrop className="dialog-backdrop" />
                <AlertDialog.Popup className="dialog is-narrow">
                    <AlertDialog.Title className="dialog-title">{t.deletePost.title}</AlertDialog.Title>
                    <AlertDialog.Description className="dialog-desc">
                        {t.deletePost.description(post.caption || t.reel.untitled, imageTotal(post))}
                    </AlertDialog.Description>
                    {error && <FormError>{error}</FormError>}
                    <div className="dialog-actions">
                        <AlertDialog.Close className="dialog-link" disabled={deleting}>{t.deletePost.cancel}</AlertDialog.Close>
                        <button type="button" className="dialog-confirm is-danger" onClick={confirm} disabled={deleting}>
                            {deleting ? t.deletePost.deleting : t.deletePost.confirm}
                        </button>
                    </div>
                </AlertDialog.Popup>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
