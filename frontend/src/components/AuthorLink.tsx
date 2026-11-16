import clsx from "clsx";
import { useLocation } from "react-router";
import { filterSearch, parseFilter } from "../feed/filter";
import { TransitionLink } from "../navigation/TransitionLink";
import { JaText } from "./JaText";

/**
 * The author's name, linking to their profile. Sort and Only carry over
 * from a reel, so the profile is the same rules with this person pinned.
 */
export function AuthorLink({ userId, username, className }: { userId: number; username: string; className?: string }) {
    const location = useLocation();
    const onReel = location.pathname === "/" || location.pathname.startsWith("/users/");
    const search = onReel ? filterSearch(parseFilter(new URLSearchParams(location.search)), { withAuthors: false }) : "";
    return (
        <TransitionLink to={`/users/${userId}${search}`} className={clsx("author", className)}>
            <JaText text={username} />
        </TransitionLink>
    );
}
