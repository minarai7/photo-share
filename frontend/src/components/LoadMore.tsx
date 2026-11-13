import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

type LoadMoreProps = {
    hasMore: boolean;
    isLoading: boolean;
    /** The last load-more failure, shown above the button (which retries). */
    error: unknown;
    onLoadMore: () => void;
};

/** The "Load more" button under a post grid, with its error. */
export function LoadMore({ hasMore, isLoading, error, onLoadMore }: LoadMoreProps) {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();

    if (!hasMore) {
        return null;
    }

    return (
        <div className="load-more">
            {error != null && (
                <p className="feed-error">
                    {toApiErrorMessage(error, { fallbackMessage: t.posts.loadPostsFailed, shouldLog: false })}
                </p>
            )}
            <button type="button" className="load-more-button" onClick={onLoadMore} disabled={isLoading}>
                {isLoading ? t.posts.loadingMore : t.posts.loadMore}
            </button>
        </div>
    );
}
