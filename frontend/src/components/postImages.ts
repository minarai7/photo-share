import { useEffect, useState } from "react";
import { getPostById } from "../api/postsApi";
import type { Post, PostImage } from "../types/post";

// Lists carry only a post's cover and image_count. A series on a reel loads
// its other photos when its slide comes near the screen. A post's images
// never change after it is created, so they are kept for the session.
const cache = new Map<number, PostImage[]>();

/** The post's images as known so far: all of them, or just the cover. */
export function knownImages(post: Post): PostImage[] {
    if (post.images?.length) return post.images;
    return cache.get(post.id) ?? [{ image_path: post.image_path, thumbnail_path: post.thumbnail_path }];
}

/** How many photos the post has, known or not. */
export function imageTotal(post: Post): number {
    return Math.max(post.image_count ?? 1, post.images?.length ?? 1, 1);
}

/** Loads a list post's images once `wanted` (its slide is near), for a series. */
export function useSeriesImages(post: Post, wanted: boolean): PostImage[] {
    const total = imageTotal(post);
    const [, setLoaded] = useState(0);
    const need = wanted && total > 1 && !post.images?.length && !cache.has(post.id);
    useEffect(() => {
        if (!need) return;
        let live = true;
        getPostById(post.id)
            .then((full) => {
                if (full.images?.length) cache.set(post.id, full.images);
                if (live) setLoaded((n) => n + 1);
            })
            .catch((err: unknown) => console.error(err)); // the cover stays; the rest show as placeholders
        return () => {
            live = false;
        };
    }, [need, post.id]);
    return knownImages(post);
}

/** Remember a fetched post's images (the post page has them). */
export function rememberImages(post: Post) {
    if (post.images?.length) cache.set(post.id, post.images);
}

/** Forget a deleted post. */
export function forgetImages(postId: number) {
    cache.delete(postId);
}
