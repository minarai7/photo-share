import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { PostCard } from "../components/PostCard";
import { LoadMore } from "../components/LoadMore";
import { useAuth } from "../auth/useAuth";
import { getUserById } from "../api";
import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { usePostPages } from "../hooks/usePostPages";
import { EAGER_GRID_IMAGES } from "../config/images";

type ForUser<T> = { userId: number; value: T };

export function ProfilePage() {
  const { t } = useLanguage();
  const toApiErrorMessage = useApiErrorMessage();
  const { userId } = useParams<{userId: string}>();
  const { user } = useAuth();

  // Derived during render (not stored in state) so they always match the
  // current URL and session; the effects only fetch.
  const numericUserId = userId ? Number(userId) : NaN;
  const idError = !userId
    ? t.validation.userIdMissing
    : Number.isNaN(numericUserId)
      ? t.validation.invalidUserId
      : null;
  const isOwnProfile = user !== null && user.id === numericUserId;
  const ownUsername = isOwnProfile ? user.username : null;

  // Only this user's posts, a page at a time (GET /posts?user_id=).
  const { posts, isLoading, error, hasMore, isLoadingMore, loadMoreError, loadMore } = usePostPages({
    userId: idError ? undefined : numericUserId,
    enabled: !idError,
  });

  // Another user's name comes from GET /users/{id}; your own from the session.
  // Results are tagged with the id they belong to, so after navigating to
  // another profile the previous user's name or error is never shown.
  const [fetchedUser, setFetchedUser] = useState<ForUser<string> | null>(null);
  const [userError, setUserError] = useState<ForUser<unknown> | null>(null);

  useEffect(() => {
    if (idError || ownUsername) {
      return
    }

    let isMounted = true;

    getUserById(numericUserId)
      .then((u) => {
        if (isMounted) {
          setFetchedUser({ userId: numericUserId, value: u.username });
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error(err);
          setUserError({ userId: numericUserId, value: err });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [idError, numericUserId, ownUsername])

  const username = ownUsername ?? (fetchedUser?.userId === numericUserId ? fetchedUser.value : null);
  const lookupError = userError?.userId === numericUserId ? userError.value : null;
  const loadError = lookupError ?? error;

  if (idError || loadError != null) {
    return (
      <main className="feed-page">
        <p className="feed-error">
          {idError ?? toApiErrorMessage(loadError, { fallbackMessage: t.profile.loadProfileFailed, shouldLog: false })}
        </p>
      </main>
    )
  }

  if (isLoading || username === null) {
    return (
      <main className="feed-page">
        <p className="feed-status">{t.posts.loadingPosts}</p>
      </main>
    )
  }


  return (
    <main className="feed-page">
      <header className="feed-header">
        <h1>{t.profile.userPostsTitle(username)}</h1>
        <p>{hasMore ? t.profile.postCountAtLeast(posts.length) : t.profile.postCount(posts.length)}</p>
      </header>

      {posts.length === 0 ? (
        <>
          <p className="feed-status">
            {isOwnProfile
            ? (
              <>
              {t.profile.ownEmptyPostsMessage}{" "}
                <Link to="/posts/new" className="form-link">
                  {t.profile.createFirstPost}
                </Link>
              </>
            ) : t.posts.noPosts}
          </p>
        </>
      ) : (
        <>
          <div className="post-grid">
            {posts.map((post, index) => (
              <PostCard
                key={post.id}
                post={post}
                eager={index < EAGER_GRID_IMAGES}
                showAuthor={false}
                returnTo={{
                  pathname: `/users/${userId}`,
                  labelKey: "backToProfile",
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
  );
}
