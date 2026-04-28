import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main>
      <h1>404 Not Found</h1>
      <p>The page you are looking for does not exist.</p>

      <Link to="/">Go back to feed</Link>
    </main>
  );
}