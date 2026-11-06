import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getPostsByUserId } from "../api/postsApi";
import { PostCard } from "../components/PostCard";
import { useAuth } from "../auth/useAuth";
import type { GetPostsResponse } from "../types/post";
import { getUserById } from "../api";
import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { EAGER_GRID_IMAGES } from "../config/images";

export function ProfilePage() {
  const { t } = useLanguage();
  const toApiErrorMessage = useApiErrorMessage();
  const { userId } = useParams<{userId: string}>();
  const { user } = useAuth();

  const [posts, setPosts] = useState<GetPostsResponse>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived during render (not stored in state) so they always match the
  // current URL and session; the effect only fetches.
  const numericUserId = userId ? Number(userId) : NaN;
  const idError = !userId
    ? t.validation.userIdMissing
    : Number.isNaN(numericUserId)
      ? t.validation.invalidUserId
      : null;
  const isOwnProfile = user !== null && user.id === numericUserId;
  const ownUsername = isOwnProfile ? user.username : null;

  useEffect(() => {
    if (idError) {
      return
    }

    let isMounted = true;

    async function loadProfilePosts() {
      try {
        setIsLoading(true);
        setError(null);

        const [profilePosts, profileUsername] = await Promise.all([
          getPostsByUserId(numericUserId),
          ownUsername ?? getUserById(numericUserId).then((u) => u.username),
        ]);

        if (isMounted) {
          setPosts(profilePosts);
          setUsername(profileUsername);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            toApiErrorMessage(err, {
              fallbackMessage: t.profile.loadProfileFailed,
            })
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProfilePosts();

    return () => {
      isMounted = false;
    };
  }, [idError, numericUserId, ownUsername, toApiErrorMessage, t.profile.loadProfileFailed])

  const shownError = idError ?? error;

  if (shownError) {
    return (
      <main className="feed-page">
        <p className="feed-error">{shownError}</p>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="feed-page">
        <p className="feed-status">{t.posts.loadingPosts}</p>
      </main>
    )
  }


  return (
    <main className="feed-page">
      <header className="feed-header">
        <h1>{username ?  t.profile.userPostsTitle(username) : t.profile.title}</h1>
        <p>{t.profile.postCount(posts.length)}</p>
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
      )}
    </main>
  );
}