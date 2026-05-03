import { useEffect, useState, type SubmitEvent  } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router";
import { getImageUrl } from "../utils/imageUrl";
import { deletePostById, getPostById, updatePostById } from "../api/postsApi";
import type { Post, UpdatePostRequest } from "../types/post";
import { useAuth } from "../auth/AuthContext";
import { FormField } from "../components/FormField";

export function PostDetailPage() {
    const { postId } = useParams<{postId: string}>();
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();

    const returnTo = location.state?.returnTo ?? {
        pathname: "/",
        label: "Back to feed",
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
            setError("Post ID is missing.");
            setIsLoading(false);
            return
        }

        const numericPostId = Number(postId);

        if (Number.isNaN(numericPostId)) {
            setError("Invalid post ID.");
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
                        err instanceof Error ? err.message : "Failed to load post."
                    );
            } finally {
                setIsLoading(false);
            }
        }

        loadPost();
    }, [postId]);

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
            setEditError("Post ID is missing.");
            return
        }

        const numericPostId = Number(postId);

        if (Number.isNaN(numericPostId)) {
            setEditError("Invalid post ID.");
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
                err instanceof Error ? err.message : "Failed to update post."
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDeletePost() {
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

        const confirmed = window.confirm(
            "Delete this post? This action cannot be undone."
        );

        if (!confirmed) {
            return;
        }

        try {
            setDeleteError(null);
            setIsDeleting(true);

            await deletePostById(post.id);

            navigate(returnTo.pathname, { replace: true });
        } catch (err) {
            setEditError(
                err instanceof Error ? err.message : "Failed to delete post."
            );
        } finally {
            setIsDeleting(false);
        }
    }

    if (isLoading) {
        return (
            <main className="page">
                <p>Loading post...</p>
            </main>
        )
    }

    if (error) {
        return (
            <main className="page">
                <p className="error-message">{error}</p>
                <Link to={returnTo.pathname}>{returnTo.label}</Link>
            </main>
        )
    }

    if (!post) {
        return (
        <main className="page">
            <p>Post not found.</p>
            <Link to={returnTo.pathname}>{returnTo.label}</Link>
        </main>
        );
    }

    const isOwner = user?.id === post.user_id;
    
    return (
        <main className="page">
        <article className="post-detail-card">
            <img
            className="post-detail-image"
            src={getImageUrl(post.image_path)}
            alt={post.caption || "Post image"}
            />

            <div className="post-detail-content">
            <p className="post-detail-author">User #{post.user_id}</p>
            {isEditing ? (
                <>
                    {editError && <div className="form-error">{editError}</div>}
            
                    <form className="create-post-form" onSubmit={handleUpdatePost}>
                        <FormField
                            id="caption"
                            label="Title"
                            type="text"
                            value={caption}
                            setValue={setCaption}
                        />
            
                        <FormField
                            id="location"
                            label="Location"
                            type="text"
                            value={photoLocation}
                            setValue={setPhotoLocation}
                        />
            
                        <FormField
                            id="camera-body"
                            label="Camera Body"
                            type="text"
                            value={cameraBody}
                            setValue={setCameraBody}
                        />
            
                        <FormField
                            id="lens"
                            label="Lens"
                            type="text"
                            value={lens}
                            setValue={setLens}
                        />

                        <div className="post-detail-actions">
                            <button
                                type="button"
                                className="text-button"
                                onClick={cancelEditing}
                                disabled={isSaving}
                            >
                            Cancel
                            </button>
                            <button
                                type="submit"
                                className="text-button"
                                disabled={isSaving}>
                                {isSaving ? "Saving..." : "Save"}
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
                    <dt>Location</dt>
                    <dd>{post.location || "Not specified"}</dd>
                    </div>

                    <div>
                    <dt>Camera body</dt>
                    <dd>{post.camera_body || "Not specified"}</dd>
                    </div>

                    <div>
                    <dt>Lens</dt>
                    <dd>{post.lens || "Not specified"}</dd>
                    </div>

                    <div>
                    <dt>Created</dt>
                    <dd>{new Date(post.created_at).toLocaleString()}</dd>
                    </div>
                </dl>
                <div className="post-detail-actions">
                    <Link className="post-detail-return-link" to={returnTo.pathname}>{returnTo.label}</Link>

                    {isOwner && (
                        <button
                            type="button"
                            className="text-button"
                            onClick={startEditing}
                            disabled={isDeleting}
                        >
                            Edit
                        </button>
                    )}

                    {isOwner && (
                        <button
                            type="button"
                            className="danger-button"
                            onClick={handleDeletePost}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
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