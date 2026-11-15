// Mock content for the design prototypes. Shapes follow src/types/post.ts
// (snake_case, optional gear/location, images in display order) plus the
// two things the prototypes need that the API doesn't return yet: each
// image's pixel size and a per-post tint (see DESIGN-INSPIRATION.md §5.5).

const urls = import.meta.glob<string>("./photos/*.jpg", {
    eager: true,
    query: "?url",
    import: "default",
});

function photo(name: string): string {
    const url = urls[`./photos/${name}.jpg`];
    if (!url) {
        throw new Error(`missing prototype photo ${name}`);
    }
    return url;
}

export type ProtoImage = { src: string; w: number; h: number };

export type ProtoUser = {
    id: number;
    username: string;
    // A one-line statement; not in the real API, used only by layouts that
    // want to show what a profile could say.
    bio: string;
};

export type ProtoPost = {
    id: number;
    user_id: number;
    username: string;
    images: ProtoImage[];
    caption: string;
    location: string | null;
    camera_body: string | null;
    lens: string | null;
    created_at: string;
    /** Pale page colour derived from the photo. */
    tint: string;
    /** Deep companion colour, for hover / spotlight states. */
    tintDeep: string;
};

export const USERS: ProtoUser[] = [
    { id: 1, username: "aoi.tanaka", bio: "Weekend walks along the Tama River. Fujifilm, mostly 33mm." },
    { id: 2, username: "lena.ph", bio: "Architecture and long shadows. Based in Milan." },
    { id: 3, username: "kenji.m", bio: "Birds, whales, and the patience in between." },
    { id: 4, username: "mori_sora", bio: "色と光。Colour first, subject second." },
    { id: 5, username: "yui.k", bio: "Deserts and the people who cross them." },
];

/** The signed-in user in every prototype. */
export const ME = USERS[0];

const img = (name: string, w: number, h: number): ProtoImage => ({ src: photo(name), w, h });

function userName(id: number): string {
    return USERS.find((u) => u.id === id)!.username;
}

const RAW: Omit<ProtoPost, "username">[] = [
    {
        id: 112,
        user_id: 2,
        images: [img("street", 1600, 1200), img("street-2", 960, 1600), img("street-3", 1123, 1600)],
        caption: "Galleria, late afternoon",
        location: "Milan, Italy",
        camera_body: "Leica Q2",
        lens: "Summilux 28mm f/1.7 ASPH",
        created_at: "2026-11-14T08:12:00Z",
        tint: "#efe6d6",
        tintDeep: "#7d6440",
    },
    {
        id: 111,
        user_id: 1,
        images: [img("sunflower", 1600, 1067), img("sunflower-2", 1600, 1600), img("sunflower-3", 1600, 1067)],
        caption: "向日葵の道",
        location: "Tama River, Tokyo",
        camera_body: "FUJIFILM X-T5",
        lens: "XF33mmF1.4 R LM WR",
        created_at: "2026-11-13T05:40:00Z",
        tint: "#eef0d8",
        tintDeep: "#5f6b2c",
    },
    {
        id: 110,
        user_id: 3,
        images: [img("bird", 1600, 1067)],
        caption: "Blue tit, first light",
        location: "Kawagoe, Saitama",
        camera_body: "Nikon Z 9",
        lens: "NIKKOR Z 500mm f/5.6 VR S",
        created_at: "2026-11-12T22:03:00Z",
        tint: "#e6ead6",
        tintDeep: "#56632b",
    },
    {
        id: 109,
        user_id: 4,
        images: [img("building", 1067, 1600), img("building-2", 1488, 1512)],
        caption: "Pink façade",
        location: "Lisbon, Portugal",
        camera_body: "FUJIFILM X-T30 III",
        lens: "XC15-45mmF3.5-5.6 OIS PZ",
        created_at: "2026-11-11T14:30:00Z",
        tint: "#f6e3d8",
        tintDeep: "#a46e5a",
    },
    {
        id: 108,
        user_id: 1,
        images: [img("cactus", 1067, 1600)],
        caption: "Joshua tree at dusk",
        location: "Joshua Tree, California",
        camera_body: "Sony α6700",
        lens: "E 24mm F2.8 G",
        created_at: "2026-11-09T02:15:00Z",
        tint: "#e9dfe3",
        tintDeep: "#3a3350",
    },
    {
        id: 107,
        user_id: 5,
        images: [img("cave", 900, 1600), img("cave-2", 1600, 1264)],
        caption: "Under the arch",
        location: "Spitzkoppe, Namibia",
        camera_body: "Canon EOS R6 Mark II",
        lens: "RF24-105mm F4 L IS USM",
        created_at: "2026-11-06T09:48:00Z",
        tint: "#f0dfcf",
        tintDeep: "#84482a",
    },
    {
        id: 106,
        user_id: 1,
        images: [img("flower", 1600, 1067), img("flower-2", 960, 1200)],
        caption: "霧の草花",
        location: null,
        camera_body: null,
        lens: null,
        created_at: "2026-11-02T23:10:00Z",
        tint: "#e7ebe4",
        tintDeep: "#6f7d6c",
    },
    {
        id: 105,
        user_id: 2,
        images: [img("sign", 1067, 1600)],
        caption: "Trail marker, Malá Fatra",
        location: "Malá Fatra, Slovakia",
        camera_body: "RICOH GR IIIx",
        lens: null,
        created_at: "2026-10-28T16:22:00Z",
        tint: "#dbe6e6",
        tintDeep: "#2d5360",
    },
    {
        id: 104,
        user_id: 4,
        images: [img("snow", 1067, 1600), img("snow-2", 1600, 1600)],
        caption: "Ice field, blue hour",
        location: "Shiretoko, Hokkaido",
        camera_body: "Sony α7 IV",
        lens: "FE 24-70mm F2.8 GM II",
        created_at: "2026-10-19T07:05:00Z",
        tint: "#dfe4f3",
        tintDeep: "#55639f",
    },
    {
        id: 103,
        user_id: 3,
        images: [img("whale", 1600, 920), img("whale-2", 1600, 644)],
        caption: "Fluke",
        location: "Andenes, Norway",
        camera_body: "Canon EOS R5",
        lens: "RF100-500mm F4.5-7.1 L IS USM",
        created_at: "2026-10-03T11:31:00Z",
        tint: "#dbe3e8",
        tintDeep: "#2b475b",
    },
];

export const POSTS: ProtoPost[] = RAW.map((p) => ({ ...p, username: userName(p.user_id) }));

export function getPost(id: number | undefined): ProtoPost {
    return POSTS.find((p) => p.id === id) ?? POSTS[0];
}

export function getUser(id: number | undefined): ProtoUser {
    return USERS.find((u) => u.id === id) ?? ME;
}

export function postsByUser(userId: number): ProtoPost[] {
    return POSTS.filter((p) => p.user_id === userId);
}

/** Posts adjacent to this one in feed order, for prev/next navigation. */
export function neighbours(id: number): { prev: ProtoPost | null; next: ProtoPost | null } {
    const i = POSTS.findIndex((p) => p.id === id);
    return { prev: i > 0 ? POSTS[i - 1] : null, next: i >= 0 && i < POSTS.length - 1 ? POSTS[i + 1] : null };
}

/** The "now" every prototype formats against, so relative dates stay stable. */
export const NOW = new Date("2026-11-14T12:00:00Z");

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateDots(iso: string): string {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function formatRelative(iso: string): string {
    const days = Math.floor((NOW.getTime() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return formatDate(iso);
}

export function yearOf(iso: string): number {
    return new Date(iso).getUTCFullYear();
}

/** The gear line exactly as the post states it, or null when nothing is known. */
export function gearLine(post: ProtoPost, sep = " · "): string | null {
    const parts = [post.camera_body, post.lens].filter(Boolean);
    return parts.length ? parts.join(sep) : null;
}

/** Camera maker from the stated body ("FUJIFILM X-T5" → "Fujifilm"), or null. */
export function brandOf(post: ProtoPost): string | null {
    const first = post.camera_body?.split(" ")[0];
    if (!first) return null;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Catalogue-style number: No. 112 → "112". */
export function workNo(post: ProtoPost): string {
    return String(post.id).padStart(3, "0");
}

// What POST /ai/gear-link returns, canned per gear name (src/types/ai.ts).
export type ProtoGearSuggestion = { title: string; url: string; confidence: "high" | "medium" | "low"; reason: string };
export type ProtoGearResult = { name: string; summary: string; suggestions: ProtoGearSuggestion[] };

export function mockGearLink(name: string): ProtoGearResult {
    return {
        name,
        summary: `${name} matches a current product listing. The manufacturer page is the most reliable source; retailer pages are listed for price comparison.`,
        suggestions: [
            {
                title: `${name}: official product page`,
                url: "https://example.com/manufacturer",
                confidence: "high",
                reason: "Exact model name on the manufacturer's site.",
            },
            {
                title: `${name} at a camera retailer`,
                url: "https://example.com/retailer",
                confidence: "medium",
                reason: "Same model; listing may bundle accessories.",
            },
        ],
    };
}

/** The photos offered by the fake "file picker" on the create-post screens. */
/** tint: the pale page colour the photo would get (in production, computed with the thumbnail). */
export const PICKABLE: { name: string; image: ProtoImage; tint: string; exif: { camera: string | null; lens: string | null } }[] = [
    { name: "DSCF4021.JPG", image: img("sunflower-2", 1600, 1600), tint: "#f1ead2", exif: { camera: "FUJIFILM X-T5", lens: "XF33mmF1.4 R LM WR" } },
    { name: "DSCF4033.JPG", image: img("sunflower-3", 1600, 1067), tint: "#eef0d8", exif: { camera: "FUJIFILM X-T5", lens: "XF33mmF1.4 R LM WR" } },
    { name: "DSCF4040.JPG", image: img("sunflower", 1600, 1067), tint: "#f2ecd3", exif: { camera: "FUJIFILM X-T5", lens: "XF33mmF1.4 R LM WR" } },
    { name: "IMG_0192.JPG", image: img("flower-2", 960, 1200), tint: "#efe1e3", exif: { camera: null, lens: null } },
];
