import { useEffect, useState, type SubmitEvent  } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router";
import { getImageUrl } from "../utils/imageUrl";
import { deletePostById, getPostById, updatePostById } from "../api/postsApi";
import { ApiError } from "../api/apiError";
import type { Post, UpdatePostRequest } from "../types/post";
import { useAuth } from "../auth/useAuth";
import { FormField } from "../components/FormField";
import { GearLinkAction } from "../components/GearLinkAction";
import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { getLocaleFromLanguage } from "../utils/locale";

type ReturnToLabelKey = "backToFeed" | "backToProfile";

type ReturnTo = {
    pathname: string;
    labelKey: ReturnToLabelKey;
};

export function PostDetailPage() {
    const { t, language } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();

    function getReturnToLabel(labelKey: ReturnToLabelKey): string {
        switch (labelKey) {
            case "backToFeed":
            return t.posts.backToFeed;

            case "backToProfile":
            return t.posts.backToProfile;
        }
    }

    const { postId } = useParams<{postId: string}>();
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();

    const returnTo: ReturnTo = location.state?.returnTo ?? {
        pathname: "/",
        labelKey: "backToFeed",
    };

    // Validate the URL param during render; the effect only fetches.
    const numericPostId = postId ? Number(postId) : NaN;
    const idError = !postId
        ? t.posts.postIdMissing
        : Number.isNaN(numericPostId)
            ? t.posts.invalidPostId
            : null;

    // A PostCard passes the post it showed, so the page can render at once.
    // Deep links and new tabs have no state and show the loading state.
    const statePost: Post | undefined = location.state?.post;
    const previewPost = statePost?.id === numericPostId ? statePost : null;
    const hasPreview = previewPost !== null;

    // The latest copy from the API or from a save. It wins over the preview,
    // so re-running the fetch effect (e.g. on a language switch) can only
    // refresh the post, never put the older router-state copy back.
    const [loadedPost, setLoadedPost] = useState<Post | null>(null);
    const post = loadedPost?.id === numericPostId ? loadedPost : previewPost;

    const [error, setError] = useState<string | null>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [caption, setCaption] = useState("");
    const [photoLocation, setPhotoLocation] = useState("");
    const [cameraBody, setCameraBody] = useState("");
    const [lens, setLens] = useState("");

    useEffect(() => {
        if (idError) {
            return
        }

        let isMounted = true;

        async function loadPost() {
            try {
                setError(null);
                const post = await getPostById(numericPostId);
                if (isMounted) {
                    setLoadedPost(post);
                }
            }  catch (err) {
                // A failed background refresh keeps the post on screen, unless
                // the post is gone (deleted since the feed loaded).
                if (isMounted && (!hasPreview || (err instanceof ApiError && err.status === 404))) {
                    setError(
                        toApiErrorMessage(err, {
                            fallbackMessage: t.posts.loadPostFailed,
                        })
                    );
                }
            }
        }

        loadPost();

        return () => {
            isMounted = false;
        };
    }, [
        idError,
        numericPostId,
        hasPreview,
        t.posts.loadPostFailed,
        toApiErrorMessage
    ]);

    function startEditing() {
        if (!isAuthenticated) {
            navigate("/login", {
                replace: true,
                state: { from: location },
            });
            return
        }
        if (!post) {
            return
        }

        setCaption(post.caption ?? "");
        setPhotoLocation(post.location ?? "");
        setCameraBody(post.camera_body ?? "");
        setLens(post.lens ?? "");
        setEditError(null);
        setIsEditing(true);
    }

    function cancelEditing() {
        setIsEditing(false);
        setEditError(null);
    }

    async function handleUpdatePost(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!postId) {
            setEditError(t.posts.postIdMissing);
            return
        }

        const numericPostId = Number(postId);

        if (Number.isNaN(numericPostId)) {
            setEditError(t.posts.invalidPostId);
            return
        }

        try {
            setIsSaving(true);
            setEditError(null);

            const data: UpdatePostRequest = {
                caption: caption.trim()
            }

            if (photoLocation.trim() !== "") {
                data.location = photoLocation.trim();
            }
            if (cameraBody.trim() !== "") {
                data.camera_body = cameraBody.trim();
            }
            if (lens.trim() !== "") {
                data.lens = lens.trim();
            }

            const updatedPost = await updatePostById(numericPostId, data)

            setLoadedPost(updatedPost);
            setIsEditing(false);
            // Keep the history entry in step, so Back to this page or a reload
            // previews the edited post rather than the one the feed passed in.
            if (hasPreview) {
                navigate(
                    { pathname: location.pathname, search: location.search, hash: location.hash },
                    { replace: true, state: { ...location.state, post: updatedPost } },
                );
            }
        } catch (err) {
            setEditError(
                toApiErrorMessage(err, {
                    fallbackMessage: t.posts.updatePostFailed,
                })
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDeletePost() {
        if (!post) {
            return
        }

        const confirmed = window.confirm(t.posts.deleteConfirm);

        if (!confirmed) {
            return;
        }

        try {
            setDeleteError(null);
            setIsDeleting(true);

            await deletePostById(post.id);

            navigate(returnTo.pathname, { replace: true });
        } catch (err) {
            setDeleteError(
                toApiErrorMessage(err, {
                    fallbackMessage: t.posts.deletePostFailed,
                })
            );
        } finally {
            setIsDeleting(false);
        }
    }

    const shownError = idError ?? error;

    if (shownError) {
        return (
            <main className="page">
                <p className="error-message">{shownError}</p>
                <Link to={returnTo.pathname}>
                    {getReturnToLabel(returnTo.labelKey)}
                </Link>
            </main>
        )
    }

    // No post yet and no error: the first fetch is still in flight (there was
    // no matching post in the router state). A missing post arrives as a 404 error.
    if (!post) {
        return (
            <main className="page">
                <p>{t.posts.loadingPost}</p>
            </main>
        )
    }

    const isOwner = user?.id === post.user_id;

    const createdAt = new Date(post.created_at).toLocaleString(
        getLocaleFromLanguage(language)
    );
    
    return (
        <main className="page">
        <article className="post-detail-card">
            <img
                className="post-detail-image"
                src={getImageUrl(post.image_path)}
                alt={post.caption || t.posts.postImageAlt}
                // The page's main image (its LCP element): fetch it first.
                fetchPriority="high"
            />

            <div className="post-detail-content">
            <p className="post-detail-author">{post.username}</p>
            {isEditing ? (
                <>
                    {editError && <div className="form-error">{editError}</div>}
            
                    <form className="create-post-form" onSubmit={handleUpdatePost}>
                        <FormField
                            id="caption"
                            label={t.posts.title}
                            type="text"
                            value={caption}
                            setValue={setCaption}
                        />
            
                        <FormField
                            id="location"
                            label={t.posts.location}
                            type="text"
                            value={photoLocation}
                            setValue={setPhotoLocation}
                        />
            
                        <FormField
                            id="camera-body"
                            label={t.posts.camera}
                            type="text"
                            value={cameraBody}
                            setValue={setCameraBody}
                        />
            
                        <FormField
                            id="lens"
                            label={t.posts.lens}
                            type="text"
                            value={lens}
                            setValue={setLens}
                        />

                        <div className="post-detail-actions">
                            <button
                                type="button"
                                className="text-button"
                                onClick={cancelEditing}
                                disabled={isSaving || isDeleting}
                            >
                                {t.common.cancel}
                            </button>
                            <button
                                type="button"
                                className="danger-button"
                                onClick={handleDeletePost}
                                disabled={isSaving || isDeleting}
                            >
                                {isDeleting ? t.posts.deleting : t.posts.delete}
                            </button>
                            <button
                                type="submit"
                                className="text-button"
                                disabled={isSaving || isDeleting}>
                                {isSaving ? t.posts.saving : t.posts.save}
                            </button>
                        </div>
                    </form>
                </>
            ) : (
            <>
                {deleteError && <div className="form-error">{deleteError}</div>}

                <h1 className="post-detail-caption">{post.caption}</h1>

                <dl className="post-detail-meta">
                    <div>
                    <dt>{t.posts.location}</dt>
                    <dd>{post.location || t.posts.notSpecified}</dd>
                    </div>

                    <div>
                    <dt>{t.posts.camera}</dt>
                    <dd>
                        {post.camera_body ? <GearLinkAction kind="camera" name={post.camera_body}/> : t.posts.notSpecified}
                    </dd>
                    </div>

                    <div>
                    <dt>{t.posts.lens}</dt>
                    <dd>
                        {post.lens ? <GearLinkAction kind="lens" name={post.lens}/> : t.posts.notSpecified}
                    </dd>
                    </div>

                    <div>
                    <dt>{t.posts.created}</dt>
                    <dd>{createdAt}</dd>
                    </div>
                </dl>
                <div className="post-detail-actions">
                    <Link className="post-detail-return-link" to={returnTo.pathname}>
                        {getReturnToLabel(returnTo.labelKey)}
                    </Link>

                    {isOwner && (
                        <button
                            type="button"
                            className="text-button"
                            onClick={startEditing}
                            disabled={isDeleting}
                        >
                            {t.posts.edit}
                        </button>
                    )}
                </div>
            </>
        )}
        </div>
        </article>
        </main>
    )
}