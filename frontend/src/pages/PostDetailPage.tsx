import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router";
import { getImageUrl } from "../utils/imageUrl";
import { getPostById } from "../api/postsApi";
import type { Post } from "../types/post";

export function PostDetailPage() {
    const { postId } = useParams<{postId: string}>();

    const location = useLocation();
    const returnTo = location.state?.returnTo ?? {
        pathname: "/",
        label: "Back to feed",
    };

    const [post, setPost] = useState<Post | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

            <Link to={returnTo.pathname}>{returnTo.label}</Link>
            </div>
        </article>
        </main>
    )
}