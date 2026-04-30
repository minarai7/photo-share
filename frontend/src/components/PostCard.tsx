import { Link } from "react-router";
import type { Post } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";

type PostCardProps = {
    post: Post;
}

export function PostCard({ post }: PostCardProps) {
    const createdAt = new Date(post.created_at).toLocaleString();

    return (
        <article className="post-card">
            <Link to={`/posts/${post.id}`} className="post-card-image-link">
                <img
                    src={getImageUrl(post.image_path)}
                    alt={post.caption || "Post image"}
                    className="post-card-image"
                />
            </Link>

            <div className="post-card-body">
                <div className="post-card-header">
                    <span className="post-card-author">
                        User #{post.user_id}
                    </span>
                    <span className="post-card-date">{createdAt}</span>
                </div>

                <p className="post-card-caption">{post.caption}</p>

                <dl className="post-card-meta">
                    {post.location && (
                        <div>
                            <dt>Location</dt>
                            <dd>{post.location}</dd>
                        </div>
                    )}

                    {post.camera_body && (
                        <div>
                        <dt>Camera</dt>
                        <dd>{post.camera_body}</dd>
                        </div>
                    )}

                    {post.lens && (
                        <div>
                        <dt>Lens</dt>
                        <dd>{post.lens}</dd>
                        </div>
                    )}
                </dl>
            </div>
        </article>
    )
}