import { useState } from "react";
import clsx from "clsx";
import { motion, type MotionStyle } from "motion/react";
import { useAuth } from "../auth/useAuth";
import { useLanguage } from "../lang/useLanguage";
import type { Post } from "../types/post";
import { formatDateDots, isJa, yearOf } from "../utils/motion";
import { AuthorLink } from "./AuthorLink";
import { GearLink } from "./GearLink";
import { JaText } from "./JaText";
import { ConfirmDeleteDialog, EditPostDialog } from "./PostDialogs";
import "./WallLabel.css";

export type OwnerHandlers = { onSaved: (post: Post) => void; onDeleted: () => void };

/**
 * The owner's Edit / Delete: one quiet "Manage" that opens to Edit · Delete
 * in place. Delete still confirms in a dialog.
 */
function OwnerActions({ post, onSaved, onDeleted }: { post: Post } & OwnerHandlers) {
    const { t } = useLanguage();
    const { user, isAuthenticated } = useAuth();
    const [open, setOpen] = useState(false);
    if (!isAuthenticated || user?.id !== post.user_id) return null;
    return (
        <p className="owner-line">
            {open ? (
                <>
                    <EditPostDialog post={post} className="quietlink" onSaved={onSaved} />
                    <ConfirmDeleteDialog post={post} className="quietlink" onDeleted={onDeleted} />
                </>
            ) : (
                <button type="button" className="quietlink" onClick={() => setOpen(true)} aria-expanded={false}>
                    {t.post.manage}
                </button>
            )}
        </p>
    );
}

/**
 * The wall label: the card beside a print. Author, title and year, place,
 * camera and lens (each with Find), the date, then owner actions. Ink on the
 * page colour in the post view; white on black in lights out (`dark`).
 */
export function WallLabel({ post, titleStyle, dark = false, owner }: { post: Post; titleStyle?: MotionStyle; dark?: boolean; owner?: OwnerHandlers }) {
    const { t } = useLanguage();
    const caption = post.caption || t.reel.untitled;
    return (
        <div className={clsx("wall-label", dark && "is-dark")}>
            <AuthorLink userId={post.user_id} username={post.username} />
            <motion.p className={clsx("wall-title", isJa(caption) && "is-ja")} style={titleStyle}>
                {/* A Japanese title takes a full-width space before its year, not an English comma. */}
                {caption}{isJa(caption) ? "　" : ", "}<em>{yearOf(post.created_at)}</em>
            </motion.p>
            {post.location && <p className="wall-place"><JaText text={post.location} /></p>}
            {(post.camera_body || post.lens) && (
                <ul className="wall-medium">
                    {post.camera_body && <li>{post.camera_body} <GearLink kind="camera" name={post.camera_body} className="find" /></li>}
                    {post.lens && <li>{post.lens} <GearLink kind="lens" name={post.lens} className="find" /></li>}
                </ul>
            )}
            <p className="wall-meta">
                <time dateTime={post.created_at}>{formatDateDots(post.created_at)}</time>
            </p>
            {owner && <OwnerActions post={post} {...owner} />}
        </div>
    );
}
