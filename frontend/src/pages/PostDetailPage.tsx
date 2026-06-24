import { useEffect, useState, type SubmitEvent  } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router";
import { getImageUrl } from "../utils/imageUrl";
import { deletePostById, getPostById, updatePostById } from "../api/postsApi";
import type { Post, UpdatePostRequest } from "../types/post";
import { useAuth } from "../auth/AuthContext";
import { FormField } from "../components/FormField";
import { GearLinkAction } from "../components/GearLinkAction";
import { useLanguage } from "../lang/LanguageContext";
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
        label: t.posts.backToFeed,
    };

    const [post, setPost] = useState<Post | null>(null);

    const [isLoading, setIsLoading] = useState(true);
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
        if (!postId) {
            setError(t.posts.postIdMissing);
            setIsLoading(false);
            return
        }

        const numericPostId = Number(postId);

        if (Number.isNaN(numericPostId)) {
            setError(t.posts.invalidPostId);
            setIsLoading(false);
            return
        }

        async function loadPost() {
            try {
                setIsLoading(true);
                setError(null);

                const post = await getPostById(numericPostId);
                setPost(post);
            }  catch (err) {
                    setError(
                        toApiErrorMessage(err, {
                            fallbackMessage: t.posts.loadPostFailed,
                        })
                    );
            } finally {
                setIsLoading(false);
            }
        }

        loadPost();
    }, [
        postId,
        t.posts.postIdMissing,
        t.posts.invalidPostId,
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

            setPost(updatedPost);
            setIsEditing(false);
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

    if (isLoading) {
        return (
            <main className="page">
                <p>{t.posts.loadingPost}</p>
            </main>
        )
    }

    if (error) {
        return (
            <main className="page">
                <p className="error-message">{error}</p>
                <Link to={returnTo.pathname}>
                    {getReturnToLabel(returnTo.labelKey)}
                </Link>
            </main>
        )
    }

    if (!post) {
        return (
            <main className="page">
                <p>{t.posts.postNotFound}</p>
                <Link to={returnTo.pathname}>
                    {getReturnToLabel(returnTo.labelKey)}
                </Link>
            </main>
        );
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