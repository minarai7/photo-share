import { Link, useParams } from "react-router";

export function PostDetailPage() {
    const { postId } = useParams();

    return (
        <main>
            <h1>Post detail</h1>
            <p>Showing post ID: {postId}</p>

            <Link to={`/posts/${postId}/edit`}>Edit this post</Link>
        </main>
    )
}