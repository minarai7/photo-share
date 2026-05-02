import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getPostsByUserId } from "../api/postsApi";
import { PostCard } from "../components/PostCard";
import { useAuth } from "../auth/AuthContext";
import type { GetPostsResponse } from "../types/post";

export function ProfilePage() {
  const { userId } = useParams<{userId: string}>();
  const { user } = useAuth();

  const [posts, setPosts] = useState<GetPostsResponse>([]);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError("Post ID is missing.");
      setIsLoading(false);
      return
    }

    const numericUserId = Number(userId);

    if (Number.isNaN(numericUserId)) {
      setError("Invalid user ID.");
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

        if (isMounted) {
            setPosts(profilePosts);
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

    loadProfilePosts();

    return () => {
      isMounted = false;
    };
  }, [userId])

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
        <h1>{isOwnProfile ? `${user!.username}'s posts` : `User #${userId}`}</h1>
        <p>{posts.length === 1
            ? "1 post"
            : `${posts.length} posts`}</p>
      </header>

      {posts.length === 0 ? (
        <>
          <p className="feed-status">
            {isOwnProfile
            ? (
            <Link to="/posts/new" className="form-link">
              You have not created any posts yet. Create your first post
            </Link>
            ) : "No posts yet."}
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
                label: "Back to profile",
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}