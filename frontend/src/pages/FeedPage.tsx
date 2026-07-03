import { useEffect, useState } from "react";
import { getPosts } from "../api/postsApi";
import { PostCard } from "../components/PostCard";
import type { GetPostsResponse } from "../types/post";
import { useLanguage } from "../lang/LanguageContext";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

export function FeedPage() {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();

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
                        toApiErrorMessage(err, {
                        fallbackMessage: t.posts.loadPostsFailed,
                        })
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
    }, [toApiErrorMessage, t.posts.loadPostsFailed]);

    if(isLoading) {
        return (
            <main className="feed-page">
                <p className="feed-status">{t.posts.loadingPosts}</p>
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
                <h1>{t.posts.feedTitle}</h1>
                <p>{t.posts.feedSubtitle}</p>
            </header>

            {posts.length === 0 ? (
                <p className="feed-status">{t.posts.noPosts}</p>
            ) : (
                <div className="post-grid">
                    {posts.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            returnTo={{
                                pathname: "/",
                                labelKey: "backToFeed",
                            }}
                        />
                    ))}
                </div>
            )}
        </main>
    )
}