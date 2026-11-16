import { isJa } from "../utils/motion";

/**
 * A string people typed (a username, a place, a title, gear) shown inside
 * the interface's own type. When it is Japanese it is set in --jp, upright,
 * lightly tracked and never uppercased (DESIGN-SYSTEM.md §3.3), whatever
 * the surrounding style (Cinzel caps, Cormorant italic) and whatever the
 * UI language. Anything else is left to the surrounding style.
 */
export function JaText({ text }: { text: string }) {
    return isJa(text) ? (
        <span className="ja-text" lang="ja">
            {text}
        </span>
    ) : (
        <>{text}</>
    );
}
