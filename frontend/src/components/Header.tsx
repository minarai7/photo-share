import type { ComponentProps, ReactNode } from "react";
import { useLocation } from "react-router";
import clsx from "clsx";
import { useAuth } from "../auth/useAuth";
import { useLanguage } from "../lang/useLanguage";
import { TransitionLink } from "../navigation/TransitionLink";
import { useGo } from "../navigation/viewTransition";
import { scrollBehavior } from "../utils/motion";
import "./Header.css";

/**
 * The fixed header: the wordmark, then one action (+ New for a member, Log in
 * for a visitor, nothing on the log-in and sign-up pages) and the lead link
 * (the Index link on a reel). `right` replaces the whole nav (Close on the
 * post and new-post pages). It holds still through screen changes.
 */
export function Header({ onImage = false, lead, right }: { onImage?: boolean; lead?: ReactNode; right?: ReactNode }) {
    const { t } = useLanguage();
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const go = useGo();

    // The wordmark goes to the feed; on the feed it goes back to its top
    // (the landing hero, where the account controls live).
    function home() {
        const reel = document.querySelector<HTMLElement>(".reel[data-feed]");
        if (location.pathname === "/" && reel) reel.scrollTo({ top: 0, behavior: scrollBehavior() });
        else go("/");
    }

    const onAuthPage = location.pathname === "/login" || location.pathname === "/signup";
    const action = isAuthenticated ? (
        <TransitionLink to="/posts/new" state={{ returnTo: location.pathname + location.search }} className="hlink new-link" aria-label={t.header.newPostLabel}>
            <span aria-hidden="true">+&nbsp;</span>
            {t.header.newPost}
        </TransitionLink>
    ) : onAuthPage ? null : (
        <TransitionLink to="/login" className="hlink" state={{ from: location }}>
            {t.header.login}
        </TransitionLink>
    );

    return (
        <header className={clsx("header", onImage && "is-on-image")}>
            <button type="button" className="wordmark" onClick={home}>
                {t.app.title}
            </button>
            {right ?? (
                <nav className="header-nav" aria-label="Primary">
                    {action}
                    {lead}
                </nav>
            )}
        </header>
    );
}

/**
 * The one Close: "− Close", the counterpart of "+ New". Used for the Index
 * sheet (<Dialog.Close render={<CloseButton />} />), leaving a post and
 * leaving new post. Callers give the spoken label ("Close, back to feed").
 */
export function CloseButton({ className, ...rest }: ComponentProps<"button">) {
    const { t } = useLanguage();
    return (
        <button type="button" className={clsx("hlink close", className)} {...rest}>
            <span aria-hidden="true">−&nbsp;</span>
            {t.header.close}
        </button>
    );
}
