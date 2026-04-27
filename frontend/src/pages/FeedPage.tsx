import { Link } from "react-router";

export function FeedPage() {
    return (
        <main>
            <h1>Feed</h1>
            <p>Latest photo posts will appear here.</p>
            <ul>
                <li>
                    <Link to="/posts/1">Example post detail</Link>
                </li>
                <li>
                    <Link to="/users/1">Example user profile</Link>
                </li>
            </ul>
        </main>
    )
}