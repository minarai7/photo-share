import { PostCard } from "../components/PostCard";
import { LoadMore } from "../components/LoadMore";
import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { usePostPages } from "../hooks/usePostPages";
import { EAGER_GRID_IMAGES } from "../config/images";

export function FeedPage() {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const { posts, isLoading, error, hasMore, isLoadingMore, loadMoreError, loadMore } = usePostPages();

    if(isLoading) {
        return (
            <main className="feed-page">
                <p className="feed-status">{t.posts.loadingPosts}</p>
            </main>
        )
    }

    if (error != null) {
        return (
            <main className="feed-page">
                <p className="feed-error">
                    {toApiErrorMessage(error, { fallbackMessage: t.posts.loadPostsFailed, shouldLog: false })}
                </p>
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
                <>
                    <div className="post-grid">
                        {posts.map((post, index) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                eager={index < EAGER_GRID_IMAGES}
                                returnTo={{
                                    pathname: "/",
                                    labelKey: "backToFeed",
                                }}
                            />
                        ))}
                    </div>
                    <LoadMore
                        hasMore={hasMore}
                        isLoading={isLoadingMore}
                        error={loadMoreError}
                        onLoadMore={loadMore}
                    />
                </>
            )}
        </main>
    )
}
