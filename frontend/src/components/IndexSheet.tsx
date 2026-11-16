import { useEffect, useState } from "react";
import clsx from "clsx";
import { Dialog } from "@base-ui/react/dialog";
import { Tooltip } from "@base-ui/react/tooltip";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import type { PhotosFilter, PostSort } from "../api/postsApi";
import { activeFilters, clearedFilter, type FeedFilter } from "../feed/filter";
import { useLanguage } from "../lang/useLanguage";
import type { Author } from "../types/auth";
import type { Post } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";
import { isJa, pad2 } from "../utils/motion";
import { CloseButton } from "./Header";
import { imageTotal } from "./postImages";
import { JaText } from "./JaText";
import { interpolate } from "../utils/interpolate";
import "./IndexSheet.css";

type Counts = { total: number; count: number; narrowed: boolean } | null;

/**
 * The Index link: the single way into the Index. It names the set on
 * screen ("All 10 works", or "4 of 10 works" while a filter narrows it).
 */
export function IndexLink({ counts, onOpen }: { counts: Counts; onOpen: () => void }) {
    const { t } = useLanguage();
    const visible = !counts
        ? t.index.title
        : counts.narrowed
          ? t.header.someWorks(counts.count, counts.total)
          : t.header.allWorks(counts.total);
    return (
        <button
            type="button"
            className={clsx("hlink indexlink", counts?.narrowed && "is-on")}
            onClick={onOpen}
            aria-haspopup="dialog"
            aria-label={t.header.indexLabel(visible)}
        >
            <span className="grid-icon" aria-hidden="true" />
            {visible}
        </button>
    );
}

/**
 * "by a", "by a and b", or "by a, b and 3 others", where "3 others" opens a
 * Base UI Tooltip listing everyone. Never a long list under the wordmark.
 */
function ByNames({ names }: { names: string[] }) {
    const { t } = useLanguage();
    const name = (i: number) => <JaText text={names[i]} />;
    if (names.length === 1) return interpolate(t.filterLine.byOne, name(0));
    if (names.length === 2) return interpolate(t.filterLine.byTwo, name(0), name(1));
    const rest = names.length - 2;
    return (
        <>
            {interpolate(t.filterLine.byManyStart, name(0), name(1))}{" "}
            <Tooltip.Root>
                <Tooltip.Trigger className="names-more" delay={200} aria-label={t.filterLine.othersLabel(rest, names.slice(2).join(", "))}>
                    {t.filterLine.others(rest)}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Positioner className="names-positioner" side="bottom" align="start" sideOffset={10}>
                        <Tooltip.Popup className="names">
                            <span className="names-label">{t.filterLine.by}</span>
                            <ul className="names-list">
                                {names.map((n) => <li key={n}><JaText text={n} /></li>)}
                            </ul>
                        </Tooltip.Popup>
                    </Tooltip.Positioner>
                </Tooltip.Portal>
            </Tooltip.Root>
        </>
    );
}

/**
 * Which filters are on, quietly, under the wordmark, with Clear (filters
 * only, never the sort). Not a link: the Index link is the one way in.
 */
export function FilterLine({ filter, authors, onClear }: { filter: FeedFilter; authors: Author[] | null; onClear: () => void }) {
    const { t } = useLanguage();
    const names = filter.authors.map((id) => authors?.find((a) => a.id === id)?.username ?? `#${id}`);
    const only = filter.photos === "series" ? t.filterLine.seriesOnly : filter.photos === "single" ? t.filterLine.singleOnly : null;
    return (
        <p className="filterline">
            <span>
                {names.length > 0 && <ByNames names={names} />}
                {names.length > 0 && only && " · "}
                {only}
            </span>
            <button type="button" className="quietlink" onClick={onClear}>
                {t.filterLine.clear}
            </button>
        </p>
    );
}

/** Rows of label + options: Sort (one), By (any number of people), Only (one or neither). */
function FilterPanel({ filter, setFilter, authors }: { filter: FeedFilter; setFilter: (f: FeedFilter) => void; authors: Author[] | null }) {
    const { t } = useLanguage();
    const sorts: [PostSort, string][] = [["newest", t.index.newest], ["oldest", t.index.oldest], ["most", t.index.most]];
    return (
        <div className="filters">
            <div className="frow">
                <span className="flabel" id="f-sort">{t.index.sort}</span>
                <ToggleGroup className="fopts" aria-labelledby="f-sort" value={[filter.sort]} onValueChange={(v) => v[0] && setFilter({ ...filter, sort: v[0] as PostSort })}>
                    {sorts.map(([k, label]) => <Toggle key={k} value={k} className="fopt">{label}</Toggle>)}
                </ToggleGroup>
            </div>
            <div className="frow">
                <span className="flabel" id="f-by">{t.index.by}</span>
                {authors ? (
                    <ToggleGroup
                        className="fopts"
                        aria-labelledby="f-by"
                        multiple
                        value={filter.authors.map(String)}
                        onValueChange={(v) => setFilter({ ...filter, authors: v.map(Number) })}
                    >
                        {authors.map((a) => <Toggle key={a.id} value={String(a.id)} className="fopt"><JaText text={a.username} /></Toggle>)}
                    </ToggleGroup>
                ) : (
                    <p className="fwait">{t.index.loadingPeople}</p>
                )}
            </div>
            <div className="frow">
                <span className="flabel" id="f-only">{t.index.only}</span>
                {/* Either or neither: pressing one releases the other; pressing it again clears it. */}
                <ToggleGroup
                    className="fopts"
                    aria-labelledby="f-only"
                    value={filter.photos === "any" ? [] : [filter.photos]}
                    onValueChange={(v) => setFilter({ ...filter, photos: (v[0] as PhotosFilter | undefined) ?? "any" })}
                >
                    <Toggle value="single" className="fopt">{t.index.single}</Toggle>
                    <Toggle value="series" className="fopt">{t.index.series}</Toggle>
                </ToggleGroup>
            </div>
            {activeFilters(filter) > 0 && (
                <p className="fsummary">
                    <button type="button" className="quietlink" onClick={() => setFilter(clearedFilter(filter))}>{t.index.clearAll}</button>
                </p>
            )}
        </div>
    );
}

/**
 * The Index: a full-screen sheet with the contact sheet and sort/filter
 * beside it. The grid pages in like the reel; picking a work closes the
 * sheet and lands the reel on it. While new rules' first page loads, the
 * previous contact sheet and count stay (inert) until the new ones arrive,
 * so the sheet never says "nothing matches" in between.
 */
export function IndexSheet({
    open, onOpenChange, posts, counts, filter, setFilter, authors, hasMore, loading, failure, onNearEnd, onPick,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    posts: Post[];
    counts: Counts;
    filter: FeedFilter;
    setFilter: (f: FeedFilter) => void;
    authors: Author[] | null;
    hasMore: boolean;
    /** The first page for the current rules is loading. */
    loading: boolean;
    /** Loading works failed: what to say, and how to try again. */
    failure: { message: string; retry: () => void } | null;
    onNearEnd: () => void;
    onPick: (id: number) => void;
}) {
    const { t } = useLanguage();
    // A callback ref: the sheet's content mounts after it opens, so the
    // observer starts when the sentinel exists, not when the effect first ran.
    const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);

    // Page in as the end of the contact sheet nears (measured in the sheet's own scroller).
    useEffect(() => {
        if (!open || !hasMore || !sentinel) return;
        const root = sentinel.closest<HTMLElement>(".index");
        const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onNearEnd(), { root, rootMargin: "400px" });
        io.observe(sentinel);
        return () => io.disconnect();
    }, [open, hasMore, onNearEnd, sentinel, posts.length]);

    // Keep what was on screen while the new rules load.
    const [kept, setKept] = useState(posts);
    if (!loading && kept !== posts) setKept(posts);
    const shown = loading ? kept : posts;

    const fresh = counts && (counts.narrowed ? t.index.someWorks(counts.count, counts.total) : t.index.works(counts.total));
    const [keptCount, setKeptCount] = useState(fresh);
    if (fresh != null && fresh !== keptCount) setKeptCount(fresh);
    const countText = fresh ?? keptCount;
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Popup className="index">
                    <div className="index-head">
                        <Dialog.Title className="index-title">{t.index.title}</Dialog.Title>
                        <span className="index-count" role="status">{countText}</span>
                        <Dialog.Close render={<CloseButton />} />
                    </div>
                    <div className="index-body">
                        <section className="index-rules" aria-labelledby="ix-rules">
                            <h2 className="index-sub" id="ix-rules">{t.index.rules}</h2>
                            <FilterPanel filter={filter} setFilter={setFilter} authors={authors} />
                        </section>
                        <section aria-label={t.index.worksLabel} aria-busy={loading || undefined}>
                            {shown.length === 0 && failure ? (
                                <p className="index-empty" role="alert">
                                    {failure.message}{" "}
                                    <button type="button" className="textlink" onClick={failure.retry}>{t.reel.retry}</button>
                                </p>
                            ) : shown.length === 0 && loading ? (
                                <p className="index-wait" role="status">{t.reel.loading}</p>
                            ) : shown.length === 0 && !hasMore ? (
                                <p className="index-empty">
                                    {t.index.nothing}{" "}
                                    <button type="button" className="textlink" onClick={() => setFilter(clearedFilter(filter))}>{t.index.clearAll}</button>
                                </p>
                            ) : (
                                <ol className="index-grid" inert={loading}>
                                    {shown.map((p, i) => {
                                        const n = imageTotal(p);
                                        return (
                                            <li key={p.id}>
                                                <button type="button" className="index-item" onClick={() => onPick(p.id)}>
                                                    <img src={getImageUrl(p.thumbnail_path ?? p.image_path)} alt="" loading="lazy" decoding="async" />
                                                    <span className="index-no">{pad2(i + 1)}</span>
                                                    <span className={clsx("index-cap", isJa(p.caption) && "is-ja")}>{p.caption || t.reel.untitled}</span>
                                                    <span className="index-by"><JaText text={p.username} />{n > 1 && ` · ${t.index.photoCount(n)}`}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                    {!loading && failure ? (
                                        <li className="index-wait" role="alert">
                                            {failure.message}{" "}
                                            <button type="button" className="textlink" onClick={failure.retry}>{t.reel.retry}</button>
                                        </li>
                                    ) : (
                                        !loading && hasMore && <li ref={setSentinel} className="index-wait">{t.reel.loading}</li>
                                    )}
                                </ol>
                            )}
                        </section>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
