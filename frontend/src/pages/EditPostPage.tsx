import { useParams } from "react-router";

export function EditPostPage() {
  const { postId } = useParams();

  return (
    <main>
      <h1>Edit post</h1>
      <p>Editing post ID: {postId}</p>
    </main>
  );
}