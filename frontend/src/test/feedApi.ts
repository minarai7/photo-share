import type { Author } from "../types/auth";
import type { Post } from "../types/post";
import { makeListPost } from "./fixtures";
import { ok, type RecordedCall } from "./mockApi";

/**
 * The feed's routes for mockApi: GET /posts and /posts/count filter `posts`
 * by user_ids and photos like the API (sort is left to the caller's order),
 * and GET /users lists `authors`. Spread more routes over it as needed.
 */
export function feedRoutes(posts: Post[], authors: Author[] = []) {
    const matching = (call: RecordedCall) => {
        const ids = call.query.get("user_ids")?.split(",").map(Number);
        const photos = call.query.get("photos");
        return posts.filter(
            (p) =>
                (!ids || ids.includes(p.user_id)) &&
                (photos !== "single" || (p.image_count ?? 1) === 1) &&
                (photos !== "series" || (p.image_count ?? 1) >= 2),
        );
    };
    return {
        "GET /posts": (call: RecordedCall) => ok(matching(call).map((p) => makeListPost(p))),
        "GET /posts/count": (call: RecordedCall) => ok({ count: matching(call).length }),
        "GET /users": ok(authors),
    };
}
