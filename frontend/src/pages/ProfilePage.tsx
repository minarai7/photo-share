import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getPostsByUserId } from "../api/postsApi";
import { PostCard } from "../components/PostCard";
import { useAuth } from "../auth/AuthContext";
import type { GetPostsResponse } from "../types/post";
import { getUserById } from "../api";
import { useLanguage } from "../lang/LanguageContext";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

export function ProfilePage() {
  const { t } = useLanguage();
  const toApiErrorMessage = useApiErrorMessage();
  const { userId } = useParams<{userId: string}>();
  const { user } = useAuth();

  const [posts, setPosts] = useState<GetPostsResponse>([]);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError(t.validation.userIdMissing);
      setIsLoading(false);
      return
    }

    const numericUserId = Number(userId);

    if (Number.isNaN(numericUserId)) {
      setError(t.validation.invalidUserId);
      setIsLoading(false);
      return
    }

    setIsOwnProfile(user?.id === numericUserId);

    let isMounted = true;

    async function loadProfilePosts() {
      try {
        setIsLoading(true);
        setError(null);

        const profilePosts = await getPostsByUserId(numericUserId);

        if (isOwnProfile) {
          setUsername(user!.username)
        } else {
          const currentlyViewingUser = await getUserById(numericUserId);
          setUsername(currentlyViewingUser.username)
        }

        if (isMounted) {
            setPosts(profilePosts);
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
  }, [userId])

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
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
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