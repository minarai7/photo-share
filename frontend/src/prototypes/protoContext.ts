import { createContext, useContext } from "react";

export type Screen = "feed" | "post" | "profile" | "login" | "signup" | "create";

/** image: which photo of a series to open on (0-based). */
export type Route = { screen: Screen; postId?: number; userId?: number; image?: number };

export type Proto = {
    route: Route;
    /** Navigate inside the prototype (pushes a browser history entry). Signed-out visits to "create" land on "login". */
    go: (route: Route) => void;
    /** Previous screen (browser history); the feed when there is none. */
    back: () => void;
    canGoBack: boolean;
    /** The screen Back returns to (null when there is no in-prototype history). */
    previous: Route | null;
    signedIn: boolean;
    signIn: () => void;
    signOut: () => void;
    /** The variant's root element: dialogs and menus portal into it so its CSS applies. */
    portal: HTMLElement | null;
    /** Mix-and-match choices a variant declares (harness options panel, kept in the URL). */
    options: Record<string, string>;
};

/** A variant's sub-choice, shown as a row in the harness options panel; the first choice is the default. */
export type OptionDef = { key: string; label: string; choices: { id: string; label: string }[] };

export function readOptions(defs: OptionDef[], params: URLSearchParams): Record<string, string> {
    return Object.fromEntries(
        defs.map((d) => {
            const v = params.get(d.key);
            return [d.key, d.choices.some((c) => c.id === v) ? (v as string) : d.choices[0].id];
        }),
    );
}

export const ProtoContext = createContext<Proto | null>(null);

export function useProto(): Proto {
    const value = useContext(ProtoContext);
    if (!value) {
        throw new Error("useProto must be used inside the prototype harness");
    }
    return value;
}

export const SCREENS: { id: Screen; label: string }[] = [
    { id: "feed", label: "Feed" },
    { id: "post", label: "Post" },
    { id: "profile", label: "Profile" },
    { id: "login", label: "Log in" },
    { id: "signup", label: "Sign up" },
    { id: "create", label: "New post" },
];

export function readRoute(params: URLSearchParams): Route {
    const s = params.get("s");
    const screen = SCREENS.some((x) => x.id === s) ? (s as Screen) : "feed";
    const id = Number(params.get("id"));
    const uid = Number(params.get("uid"));
    return {
        screen,
        postId: Number.isFinite(id) && id > 0 ? id : undefined,
        userId: Number.isFinite(uid) && uid > 0 ? uid : undefined,
        image: Number(params.get("img")) > 0 ? Number(params.get("img")) : undefined,
    };
}

export function writeRoute(url: URL, route: Route) {
    url.searchParams.set("s", route.screen);
    if (route.postId) url.searchParams.set("id", String(route.postId));
    else url.searchParams.delete("id");
    if (route.userId) url.searchParams.set("uid", String(route.userId));
    else url.searchParams.delete("uid");
    if (route.image) url.searchParams.set("img", String(route.image));
    else url.searchParams.delete("img");
}
