import { useParams } from "react-router";

export function ProfilePage() {
  const { userId } = useParams();

  return (
    <main>
      <h1>Profile</h1>
      <p>Showing profile for user ID: {userId}</p>
    </main>
  );
}