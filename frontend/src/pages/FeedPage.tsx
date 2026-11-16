import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "../api/apiError";
import { useAuth } from "../auth/useAuth";
import { DEFAULT_FILTER, activeFilters, clearedFilter, filterKey, filterSearch, parseFilter, type FeedFilter } from "../feed/filter";
import { useFeedState } from "../feed/useFeedState";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useAuthors, useNewestPost, usePostCounts, useUserProfile } from "../hooks/useFeedData";
import { usePostPages } from "../hooks/usePostPages";
import { useLanguage } from "../lang/useLanguage";
import { TransitionLink } from "../navigation/TransitionLink";
import { useGo } from "../navigation/viewTransition";
import { Header } from "../components/Header";
import { DriftHero, ScrollCue } from "../components/Hero";
import { FilterLine, IndexLink, IndexSheet } from "../components/IndexSheet";
import { JaText } from "../components/JaText";
import { LangToggle } from "../components/LangToggle";
import { interpolate } from "../utils/interpolate";
import { Reel } from "../components/Reel";
import { isJa } from "../utils/motion";
import { NotFoundPage } from "./NotFoundPage";

/**
 * How a screen applies new rules. `instant` (rules changed inside the Index)
 * skips the view transition: the sheet stays on screen, and a transition
 * would lift the header and the shown photo above it while it crossfades.
 */
type SetFilter = (f: FeedFilter, options?: { instant?: boolean }) => void;

/** The feed (/): every work, with the rules from the URL. */
export function FeedPage() {
    const [search] = useSearchParams();
    const go = useGo();
    const navigate = useNavigate();
    const query = search.toString();
    const filter = useMemo(() => parseFilter(new URLSearchParams(query)), [query]);
    const setFilter = useCallback<SetFilter>(
        (f, options) => {
            if (options?.instant) void navigate(`/${filterSearch(f)}`, { replace: true });
            else go(`/${filterSearch(f)}`, { replace: true });
        },
        [go, navigate],
    );
    return <ReelScreen filter={filter} setFilter={setFilter} />;
}

/**
 * A profile (/users/:userId) is the feed with the author pinned: their hero,
 * their works, "That's everything by 窶ｦ". Sort and Only carry over; choosing
 * other people (or Clear, or All works) leaves for the feed with those rules.
 */
export function ProfilePage() {
    const { userId } = useParams<{ userId: string }>();
    const [search] = useSearchParams();
    const go = useGo();
    const navigate = useNavigate();
    const id = Number(userId);
    const valid = Number.isInteger(id) && id > 0;
    const query = search.toString();
    const filter = useMemo(() => ({ ...parseFilter(new URLSearchParams(query)), authors: [id] }), [query, id]);
    const setFilter = useCallback<SetFilter>(
        (f, options) => {
            const stillThisPerson = f.authors.length === 1 && f.authors[0] === id;
            if (!stillThisPerson) go(`/${filterSearch(f)}`); // another screen: a screen change
            else if (options?.instant) void navigate(`/users/${id}${filterSearch(f, { withAuthors: false })}`, { replace: true });
            else go(`/users/${id}${filterSearch(f, { withAuthors: false })}`, { replace: true });
        },
        [go, navigate, id],
    );
    if (!valid) return <NotFoundPage person />;
    return <ReelScreen key={id} filter={filter} setFilter={setFilter} />;
}

function ReelScreen({ filter, setFilter }: { filter: FeedFilter; setFilter: SetFilter }) {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const { user, isAuthenticated, logout } = useAuth();
    const { setLastViewed } = useFeedState();
    const location = useLocation();
    const [indexOpen, setIndexOpen] = useState(false);

    const { posts, isLoading, error, hasMore, isLoadingMore, loadMoreError, loadMore, retry } = usePostPages(filter);
    const counts = usePostCounts(filter);
    const narrowed = activeFilters(filter) > 0;
    const authors = useAuthors(indexOpen || filter.authors.length > 1);
    const personId = filter.authors.length === 1 ? filter.authors[0] : null;
    const { user: person, error: personError } = useUserProfile(personId);
    const isDefault = filterKey(filter) === filterKey(DEFAULT_FILTER);
    const newest = useNewestPost(posts[0] ?? null, isDefault);

    const clearFilters = () => setFilter(clearedFilter(filter));
    const signOut = () => {
        logout();
        toast(t.toast.signedOut);
    };

    if (personError instanceof ApiError && personError.status === 404) {
        return <NotFoundPage person />;
    }

    const own = person != null && user?.id === person.id;
    // The filter line names people from the full list, which loads only with
    // the Index; on a profile the person's own name is known already (never "#9").
    const namedAuthors =
        person && !authors?.some((a) => a.id === person.id)
            ? [...(authors ?? []), { id: person.id, username: person.username, post_count: person.post_count }]
            : authors;
    // Nothing loaded to show (and nothing loading): the hero gets the default photograph.
    const nothingToShow = !isLoading && error == null && posts.length === 0;
    // A person with no works at all: their hero says so, with no scroll cue
    // and no empty card under it (there is nothing to scroll to).
    const noWorks = person != null && person.post_count === 0;
    const intro = personId != null ? (
        <DriftHero imagePath={posts[0]?.image_path} placeholder={noWorks || nothingToShow}>
            <h1 className={isJa(person?.username ?? "") ? "hero-mark is-ja" : "hero-mark"}>{person?.username ?? "ﾂ"}</h1>
            {person && !noWorks && <p className="hero-stats">{t.hero.stats(person.post_count, person.photo_count)}</p>}
            {noWorks && <p className="hero-sub">{own ? t.hero.firstWork : interpolate(t.hero.noWorksBy, <JaText text={person.username} />)}</p>}
            {own && (
                <div className="hero-actions">
                    <TransitionLink to="/posts/new" state={{ returnTo: location.pathname + location.search }} className="btn is-light">{t.hero.newPost}</TransitionLink>
                    <button type="button" className="textlink is-light" onClick={clearFilters}>{t.hero.allWorks}</button>
                    <button type="button" className="quietlink is-light" onClick={signOut}>{t.hero.logout}</button>
                    <LangToggle light />
                </div>
            )}
            {!noWorks && <ScrollCue />}
        </DriftHero>
    ) : (
        <DriftHero imagePath={newest?.image_path} placeholder={isDefault && nothingToShow}>
            <p className="hero-mark">{t.app.title}</p>
            <p className="hero-sub">{t.hero.tagline}</p>
            <div className="hero-actions">
                {isAuthenticated && user ? (
                    <>
                        <TransitionLink to="/posts/new" state={{ returnTo: location.pathname + location.search }} className="btn is-light">{t.hero.newPost}</TransitionLink>
                        <TransitionLink to={`/users/${user.id}`} className="textlink is-light">{t.hero.yourWorks}</TransitionLink>
                        <button type="button" className="quietlink is-light" onClick={signOut}>{t.hero.logout}</button>
                    </>
                ) : (
                    <>
                        <TransitionLink to="/login" className="btn is-light">{t.hero.login}</TransitionLink>
                        <TransitionLink to="/signup" className="textlink is-light">{t.hero.signup}</TransitionLink>
                    </>
                )}
                <LangToggle light />
            </div>
            <ScrollCue />
        </DriftHero>
    );

    // The card at the end while works load, or when loading them failed.
    const failed = error ?? loadMoreError;
    const more = failed != null ? (
        <>
            <p className="end-title" role="alert">
                {toApiErrorMessage(failed, { fallbackMessage: t.reel.loadFailed, shouldLog: false })}
            </p>
            <button type="button" className="textlink" onClick={error != null ? retry : () => void loadMore()}>{t.reel.retry}</button>
        </>
    ) : (
        <p className="end-title" role="status">{t.reel.loading}</p>
    );

    return (
        <>
            <Reel
                key={filterKey(filter)}
                feed
                posts={posts}
                total={counts?.count}
                hasMore={isLoading || error != null || hasMore}
                onNearEnd={() => {
                    if (!isLoadingMore && loadMoreError == null) void loadMore();
                }}
                more={more}
                header={(onIntro) => (
                    <>
                        <Header onImage={onIntro} lead={<IndexLink counts={counts} onOpen={() => setIndexOpen(true)} />} />
                        {/* Never over the hero's photo: the hero already says who, or nothing is narrowed. */}
                        {narrowed && !onIntro && <FilterLine filter={filter} authors={namedAuthors} onClear={clearFilters} />}
                    </>
                )}
                intro={intro}
                // Members land on the first work; the landing hero waits above it.
                startPastIntro={isAuthenticated && personId == null}
                end={
                    person ? (
                        <>
                            <p className="end-title">{interpolate(t.reel.endBy, <JaText text={person.username} />)}</p>
                            <button type="button" className="textlink" onClick={clearFilters}>{t.reel.allWorks}</button>
                        </>
                    ) : (
                        <p className="end-title">{t.reel.endHere}</p>
                    )
                }
                empty={noWorks ? null : (
                    // data-key: in view, the page leaves the hero's --night for the default tint.
                    <section className="end is-empty" data-key="empty">
                        {filter.photos !== "any" || filter.authors.length > 1 ? (
                            <>
                                <p className="end-title">{t.reel.noMatch}</p>
                                <button type="button" className="textlink" onClick={clearFilters}>{t.reel.clearFilters}</button>
                            </>
                        ) : (
                            <>
                                <p className="end-title">{t.reel.noWorksYet}</p>
                                {isAuthenticated && (personId == null || own) && (
                                    <TransitionLink to="/posts/new" state={{ returnTo: location.pathname + location.search }} className="textlink">{t.hero.newPost}</TransitionLink>
                                )}
                            </>
                        )}
                    </section>
                )}
            />
            <IndexSheet
                open={indexOpen}
                onOpenChange={setIndexOpen}
                posts={posts}
                counts={counts}
                filter={filter}
                setFilter={(f) => setFilter(f, { instant: true })}
                authors={authors}
                hasMore={hasMore}
                loading={isLoading}
                failure={
                    failed == null
                        ? null
                        : {
                              message: toApiErrorMessage(failed, { fallbackMessage: t.reel.loadFailed, shouldLog: false }),
                              retry: error != null ? retry : () => void loadMore(),
                          }
                }
                onNearEnd={() => {
                    if (!isLoadingMore && loadMoreError == null) void loadMore();
                }}
                onPick={(id) => {
                    setIndexOpen(false);
                    setLastViewed(id);
                    // Wait for the sheet to close, then land on that work.
                    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.reel [data-key="${id}"]`)?.scrollIntoView());
                }}
            />
        </>
    );
}
