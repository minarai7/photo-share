import { useEffect, useState } from "react";
import { getPosts } from "../api/postsApi";
import { PostCard } from "../components/PostCard";
import type { GetPostsResponse } from "../types/post";

export function FeedPage() {
    const [posts, setPosts] = useState<GetPostsResponse>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function loadPosts() {
            try {
                setIsLoading(true);
                setError(null);

                const posts = await getPosts();

                if (isMounted) {
                    setPosts(posts);
                }
            } catch (err) {
                if (isMounted) {
                    setError(
                        err instanceof Error ? err.message : "Failed to load posts"
                    );
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        loadPosts();

        return () => {
            isMounted = false;
        }
    }, []);

    if(isLoading) {
        return (
            <main className="feed-page">
                <p className="feed-status">Loading posts...</p>
            </main>
        )
    }

    if (error) {
        return (
            <main className="feed-page">
                <p className="feed-error">{error}</p>
            </main>
        )
    }

    return (
        <main className="feed-page">
            <header className="feed-header">
                <h1>Feed</h1>
                <p>See the latest photos shared by users</p>
            </header>

            {posts.length === 0 ? (
                <p className="feed-status">No posts yet.</p>
            ) : (
                <div className="post-grid">
                    {posts.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            returnTo={{
                                pathname: "/",
                                label: "Back to feed",
                            }}
                        />
                    ))}
                </div>
            )}
        </main>
    )
}