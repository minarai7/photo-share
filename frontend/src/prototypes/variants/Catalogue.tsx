// Variant 4 — Catalogue. Axis: density and tooling. A dark contact sheet
// for photographers who browse a lot and care about gear: numbered works,
// a hover/keyboard inspector, list view, filters by camera, J/K navigation,
// a darkroom viewer with a filmstrip, an EXIF table on upload. Borrowed from
// the reference: catalogue numbering, the large-numeral counter, thin rules,
// Roman capitals for the few display moments — inverted to dark.
import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { toast } from "sonner";
import {
    ME, POSTS, brandOf, formatDate, formatDateDots, formatRelative, getPost, getUser, neighbours, postsByUser, workNo,
    type ProtoPost,
} from "../data";
import { useProto } from "../protoContext";
import { useAuthForm, useDocumentKeys, useDraft, type AuthMode } from "../shared/hooks";
import { AccountMenu, ConfirmDelete, Count, EditPost, GearLink, LangToggle, SortablePhotos, TextField, Toasts } from "../shared/ui";

export function Catalogue() {
    const { route } = useProto();
    return (
        <MotionConfig reducedMotion="user">
            <div className="c-root">
                <Header />
                {route.screen === "feed" && <Feed />}
                {route.screen === "post" && <Post post={getPost(route.postId)} key={route.postId} />}
                {route.screen === "profile" && <Profile userId={route.userId ?? ME.id} key={route.userId} />}
                {(route.screen === "login" || route.screen === "signup") && <Auth mode={route.screen} key={route.screen} />}
                {route.screen === "create" && <Create />}
                <Toasts position="bottom-right" />
            </div>
        </MotionConfig>
    );
}

// ------------------------------------------------------------------ header

function Header() {
    const { go, signedIn, route } = useProto();
    return (
        <header className="c-header">
            <button type="button" className="c-brand" onClick={() => go({ screen: "feed" })}>
                <span className="c-wordmark">Photo Share</span>
                <span className="c-brand-sub">Catalogue</span>
            </button>
            <nav className="c-header-nav" aria-label="Primary">
                <button type="button" className={clsx("c-tab", route.screen === "feed" && "is-active")} onClick={() => go({ screen: "feed" })}>
                    All works
                </button>
                {signedIn && (
                    <button type="button" className={clsx("c-tab", route.screen === "profile" && "is-active")} onClick={() => go({ screen: "profile", userId: ME.id })}>
                        My works
                    </button>
                )}
            </nav>
            <div className="c-header-aux">
                <LangToggle className="c-lang" />
                {signedIn ? (
                    <>
                        <button type="button" className="c-btn is-primary is-small" onClick={() => go({ screen: "create" })}>
                            <span aria-hidden="true">＋</span> New post
                        </button>
                        <AccountMenu className="c-avatar-btn">
                            <span className="c-avatar" aria-hidden="true">{ME.username[0]}</span>
                        </AccountMenu>
                    </>
                ) : (
                    <>
                        <button type="button" className="c-btn is-ghost is-small" onClick={() => go({ screen: "login" })}>Log in</button>
                        <button type="button" className="c-btn is-primary is-small" onClick={() => go({ screen: "signup" })}>Sign up</button>
                    </>
                )}
            </div>
        </header>
    );
}

// ------------------------------------------------------------------ feed

function Feed() {
    const { go } = useProto();
    const brands = useMemo(() => [...new Set(POSTS.map(brandOf).filter((b): b is string => !!b))].sort(), []);
    const [brand, setBrand] = useState("All");
    const [view, setView] = useState("grid");
    const [selected, setSelected] = useState(0);
    const [loading, setLoading] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const posts = brand === "All" ? POSTS : POSTS.filter((p) => brandOf(p) === brand);
    const current = posts[Math.min(selected, posts.length - 1)];
    const images = posts.reduce((n, p) => n + p.images.length, 0);

    function select(i: number) {
        const next = Math.max(0, Math.min(i, posts.length - 1));
        setSelected(next);
        listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    useDocumentKeys((e) => {
        if (e.key === "j") { e.preventDefault(); select(selected + 1); }
        else if (e.key === "k") { e.preventDefault(); select(selected - 1); }
        else if ((e.key === "Enter" || e.key === "o") && current && !(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            go({ screen: "post", postId: current.id });
        }
    });

    return (
        <main className="c-feed">
            <div className="c-main">
                <div className="c-toolbar">
                    <div className="c-toolbar-title">
                        <h1 className="c-h1">All works</h1>
                        <span className="c-mono c-muted">{posts.length} works · {images} images</span>
                    </div>
                    <ToggleGroup
                        className="c-filters"
                        value={[brand]}
                        onValueChange={(v) => { if (v[0]) { setBrand(v[0]); setSelected(0); } }}
                        aria-label="Filter by camera"
                    >
                        {["All", ...brands].map((b) => (
                            <Toggle key={b} value={b} className="c-chip">{b}</Toggle>
                        ))}
                    </ToggleGroup>
                    <ToggleGroup className="c-viewtoggle" value={[view]} onValueChange={(v) => v[0] && setView(v[0])} aria-label="View">
                        <Toggle value="grid" className="c-icon-toggle" aria-label="Grid view"><span className="c-ico-grid" aria-hidden="true" /></Toggle>
                        <Toggle value="list" className="c-icon-toggle" aria-label="List view"><span className="c-ico-list" aria-hidden="true" /></Toggle>
                    </ToggleGroup>
                </div>

                <div ref={listRef}>
                    {view === "grid" ? (
                        <ol className="c-sheet">
                            {posts.map((p, i) => (
                                <li key={p.id} data-index={i}>
                                    <button
                                        type="button"
                                        className={clsx("c-cell", i === selected && "is-selected")}
                                        onMouseEnter={() => setSelected(i)}
                                        onFocus={() => setSelected(i)}
                                        onClick={() => go({ screen: "post", postId: p.id })}
                                        aria-label={`No. ${workNo(p)}, ${p.caption} by ${p.username}`}
                                    >
                                        <span className="c-cell-img">
                                            <img src={p.images[0].src} alt="" loading={i < 8 ? "eager" : "lazy"} decoding="async" />
                                            <span className="c-cell-no">{workNo(p)}</span>
                                            {p.images.length > 1 && <span className="c-cell-stack">{p.images.length}</span>}
                                        </span>
                                        <span className="c-cell-title">{p.caption}</span>
                                        <span className="c-cell-meta">{p.username} · {p.camera_body ?? "—"}</span>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <table className="c-table">
                            <thead>
                                <tr>
                                    <th scope="col"><span className="sr-only">Photo</span></th>
                                    <th scope="col">No.</th>
                                    <th scope="col">Title</th>
                                    <th scope="col">By</th>
                                    <th scope="col">Camera</th>
                                    <th scope="col">Lens</th>
                                    <th scope="col">Place</th>
                                    <th scope="col">Posted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {posts.map((p, i) => (
                                    <tr
                                        key={p.id}
                                        data-index={i}
                                        className={clsx(i === selected && "is-selected")}
                                        onMouseEnter={() => setSelected(i)}
                                        onClick={() => go({ screen: "post", postId: p.id })}
                                    >
                                        <td><img src={p.images[0].src} alt="" loading="lazy" /></td>
                                        <td className="c-mono">{workNo(p)}</td>
                                        <td>
                                            <button type="button" className="c-rowlink" onClick={(e) => { e.stopPropagation(); go({ screen: "post", postId: p.id }); }}>
                                                {p.caption}
                                            </button>
                                            {p.images.length > 1 && <span className="c-badge">{p.images.length}</span>}
                                        </td>
                                        <td>{p.username}</td>
                                        <td className="c-muted">{p.camera_body ?? "—"}</td>
                                        <td className="c-muted">{p.lens ?? "—"}</td>
                                        <td className="c-muted">{p.location ?? "—"}</td>
                                        <td className="c-mono c-muted">{formatDateDots(p.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="c-loadmore">
                    <button
                        type="button"
                        className="c-btn is-ghost"
                        disabled={loading}
                        onClick={async () => {
                            setLoading(true);
                            await new Promise((r) => setTimeout(r, 700));
                            setLoading(false);
                            toast("No more works", { description: "You’ve reached the end of the catalogue." });
                        }}
                    >
                        {loading ? "Loading…" : "Load more"}
                    </button>
                    <span className="c-mono c-muted c-keys">
                        <kbd>J</kbd> <kbd>K</kbd> move · <kbd>↵</kbd> open
                    </span>
                </div>
            </div>

            <aside className="c-inspector" aria-label="Selected work">
                <AnimatePresence mode="wait" initial={false}>
                    {current && (
                        <motion.div
                            key={current.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                        >
                            <img className="c-insp-img" src={current.images[0].src} alt="" />
                            <p className="c-insp-no">No. {workNo(current)}</p>
                            <h2 className="c-insp-title">{current.caption}</h2>
                            <Specs post={current} compact />
                            <button type="button" className="c-btn is-primary is-block" onClick={() => go({ screen: "post", postId: current.id })}>
                                Open
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </aside>
        </main>
    );
}

function Specs({ post, compact = false }: { post: ProtoPost; compact?: boolean }) {
    const { go } = useProto();
    return (
        <dl className="c-specs">
            <div><dt>By</dt><dd><button type="button" className="c-rowlink" onClick={() => go({ screen: "profile", userId: post.user_id })}>{post.username}</button></dd></div>
            <div>
                <dt>Camera</dt>
                <dd>{post.camera_body ?? <span className="c-muted">Not recorded</span>}{!compact && post.camera_body && <GearLink name={post.camera_body} label="Find ↗" className="c-find" />}</dd>
            </div>
            <div>
                <dt>Lens</dt>
                <dd>{post.lens ?? <span className="c-muted">Not recorded</span>}{!compact && post.lens && <GearLink name={post.lens} label="Find ↗" className="c-find" />}</dd>
            </div>
            <div><dt>Place</dt><dd>{post.location ?? <span className="c-muted">—</span>}</dd></div>
            <div><dt>Images</dt><dd className="c-mono">{post.images.length}</dd></div>
            <div><dt>Posted</dt><dd className="c-mono">{compact ? formatRelative(post.created_at) : formatDateDots(post.created_at)}</dd></div>
        </dl>
    );
}

// ------------------------------------------------------------------ post (darkroom viewer)

function Post({ post }: { post: ProtoPost }) {
    const { go, signedIn } = useProto();
    const [shown, setShown] = useState(0);
    const total = post.images.length;
    const { prev, next } = neighbours(post.id);
    const own = signedIn && post.user_id === ME.id;

    useDocumentKeys((e) => {
        if (e.key === "ArrowLeft" && shown > 0) { e.preventDefault(); setShown(shown - 1); }
        else if (e.key === "ArrowRight" && shown < total - 1) { e.preventDefault(); setShown(shown + 1); }
        else if (e.key === "[" && prev) { e.preventDefault(); go({ screen: "post", postId: prev.id }); }
        else if (e.key === "]" && next) { e.preventDefault(); go({ screen: "post", postId: next.id }); }
    });

    return (
        <main className="c-viewer">
            <section className="c-stage" aria-label="Photographs">
                <div className="c-stage-frame">
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.img
                            key={post.images[shown].src}
                            src={post.images[shown].src}
                            alt={`${post.caption}, photo ${shown + 1} of ${total}`}
                            className="c-stage-img"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                        />
                    </AnimatePresence>
                </div>
                <div className="c-stage-bar">
                    <div className="c-film" role="tablist" aria-label="Photos in this post">
                        {post.images.map((im, i) => (
                            <button
                                key={im.src}
                                type="button"
                                role="tab"
                                aria-selected={i === shown}
                                className={clsx("c-film-item", i === shown && "is-active")}
                                onClick={() => setShown(i)}
                                aria-label={`Photo ${i + 1}`}
                            >
                                <img src={im.src} alt="" />
                            </button>
                        ))}
                    </div>
                    <Count value={shown + 1} total={total} pad className="c-stage-count" />
                </div>
            </section>

            <aside className="c-panel">
                <p className="c-insp-no is-large">No. {workNo(post)}</p>
                <h1 className="c-post-title">{post.caption}</h1>
                <Specs post={post} />
                {own && (
                    <div className="c-owner">
                        <EditPost post={post} className="c-btn is-ghost is-small" />
                        <ConfirmDelete post={post} className="c-btn is-ghost is-small is-danger" />
                    </div>
                )}
                <nav className="c-postnav" aria-label="More posts">
                    {prev ? (
                        <button type="button" onClick={() => go({ screen: "post", postId: prev.id })}>
                            <img src={prev.images[0].src} alt="" />
                            <span><kbd>[</kbd> Newer<br /><em>{prev.caption}</em></span>
                        </button>
                    ) : <span />}
                    {next ? (
                        <button type="button" className="is-next" onClick={() => go({ screen: "post", postId: next.id })}>
                            <span>Older <kbd>]</kbd><br /><em>{next.caption}</em></span>
                            <img src={next.images[0].src} alt="" />
                        </button>
                    ) : <span />}
                </nav>
                <p className="c-mono c-muted c-keys"><kbd>←</kbd> <kbd>→</kbd> photos · <kbd>[</kbd> <kbd>]</kbd> posts</p>
            </aside>
        </main>
    );
}

// ------------------------------------------------------------------ profile

function Profile({ userId }: { userId: number }) {
    const { go, signedIn } = useProto();
    const user = getUser(userId);
    const posts = postsByUser(user.id);
    const own = signedIn && user.id === ME.id;
    const cameras = [...new Set(posts.map((p) => p.camera_body).filter((c): c is string => !!c))];
    const images = posts.reduce((n, p) => n + p.images.length, 0);
    return (
        <main className="c-page">
            <header className="c-profile">
                <span className="c-avatar is-xl" aria-hidden="true">{user.username[0]}</span>
                <div className="c-profile-id">
                    <h1 className="c-h1">{user.username}</h1>
                    <p className="c-muted">{user.bio}</p>
                </div>
                {own && (
                    <button type="button" className="c-btn is-primary" onClick={() => go({ screen: "create" })}>＋ New post</button>
                )}
            </header>
            <dl className="c-stats">
                <div><dt>Works</dt><dd>{posts.length}</dd></div>
                <div><dt>Images</dt><dd>{images}</dd></div>
                <div><dt>Cameras</dt><dd>{cameras.length}</dd></div>
                <div><dt>Since</dt><dd>2026</dd></div>
            </dl>
            {cameras.length > 0 && (
                <p className="c-cameras">
                    <span className="c-mono c-muted">Shot on</span>
                    {cameras.map((c) => <span key={c} className="c-chip is-static">{c}</span>)}
                </p>
            )}
            <ol className="c-sheet is-profile">
                {posts.map((p) => (
                    <li key={p.id}>
                        <button type="button" className="c-cell" onClick={() => go({ screen: "post", postId: p.id })} aria-label={`No. ${workNo(p)}, ${p.caption}`}>
                            <span className="c-cell-img">
                                <img src={p.images[0].src} alt="" loading="lazy" />
                                <span className="c-cell-no">{workNo(p)}</span>
                                {p.images.length > 1 && <span className="c-cell-stack">{p.images.length}</span>}
                            </span>
                            <span className="c-cell-title">{p.caption}</span>
                            <span className="c-cell-meta">{formatDate(p.created_at)}</span>
                        </button>
                    </li>
                ))}
            </ol>
        </main>
    );
}

// ------------------------------------------------------------------ auth

function Auth({ mode }: { mode: AuthMode }) {
    const { go } = useProto();
    const f = useAuthForm(mode);
    const isLogin = mode === "login";
    const mosaic = POSTS.flatMap((p) => p.images).slice(0, 18);
    return (
        <main className="c-auth">
            <div className="c-mosaic" aria-hidden="true">
                {mosaic.map((im) => <img key={im.src} src={im.src} alt="" />)}
            </div>
            <form className="c-card" onSubmit={f.submit} noValidate>
                <p className="c-wordmark is-card">Photo Share</p>
                <h1 className="c-card-title">{isLogin ? "Log in" : "Create an account"}</h1>
                {f.formError && <p className="c-alert" role="alert">{f.formError}</p>}
                {!isLogin && (
                    <TextField label="Username" value={f.username} onChange={f.setUsername} error={f.errors.username} autoComplete="username" className="c-field" hint="3–30 characters." />
                )}
                <TextField label="Email" type="email" value={f.email} onChange={f.setEmail} error={f.errors.email} autoComplete="email" className="c-field" placeholder="you@example.com" />
                <TextField label="Password" type="password" value={f.password} onChange={f.setPassword} error={f.errors.password} autoComplete={isLogin ? "current-password" : "new-password"} className="c-field" hint={isLogin ? undefined : "At least 8 characters."} />
                <button type="submit" className="c-btn is-primary is-block" disabled={f.pending}>
                    {f.pending ? "Checking…" : isLogin ? "Log in" : "Create account"}
                </button>
                <p className="c-card-alt">
                    {isLogin ? "No account?" : "Already registered?"}{" "}
                    <button type="button" className="c-rowlink" onClick={() => go({ screen: isLogin ? "signup" : "login" })}>
                        {isLogin ? "Sign up" : "Log in"}
                    </button>
                </p>
                <p className="c-mono c-muted c-proto-note">Prototype: password “wrong” shows the error state.</p>
            </form>
        </main>
    );
}

// ------------------------------------------------------------------ create

function Create() {
    const d = useDraft();
    return (
        <main className="c-page">
            <div className="c-toolbar">
                <div className="c-toolbar-title">
                    <h1 className="c-h1">New post</h1>
                    <span className="c-mono c-muted">{d.photos.length} / 10 images</span>
                </div>
            </div>
            <form className="c-create" onSubmit={d.submit}>
                <section aria-label="Photos">
                    {d.photos.length === 0 ? (
                        <button type="button" className="c-drop" onClick={d.addPhotos}>
                            <span className="c-drop-title">Choose photos</span>
                            <span className="c-mono c-muted">JPEG · PNG · WebP — 32 MB each — max 10</span>
                        </button>
                    ) : (
                        <>
                            <SortablePhotos
                                draft={d}
                                className="c-sortable"
                                addSlot={d.canAddMore ? <li className="c-add"><button type="button" onClick={d.addPhotos}>＋ Add</button></li> : undefined}
                            />
                            <table className="c-exif">
                                <caption className="c-mono c-muted">Read from your files (location data is removed before upload)</caption>
                                <thead>
                                    <tr><th scope="col">#</th><th scope="col">File</th><th scope="col">Camera</th><th scope="col">Lens</th></tr>
                                </thead>
                                <tbody>
                                    {d.photos.map((p, i) => (
                                        <tr key={p.key}>
                                            <td className="c-mono">{String(i + 1).padStart(2, "0")}</td>
                                            <td className="c-mono">{p.name}</td>
                                            <td>{p.exif.camera ?? <span className="c-muted">—</span>}</td>
                                            <td>{p.exif.lens ?? <span className="c-muted">—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </section>
                <section className="c-create-form" aria-label="Details">
                    {d.error && <p className="c-alert" role="alert">{d.error}</p>}
                    <TextField label="Title" value={d.caption} onChange={d.setCaption} className="c-field" placeholder="Untitled" />
                    <TextField label="Place" value={d.location} onChange={d.setLocation} className="c-field" placeholder="Optional" />
                    <TextField label="Camera" value={d.camera} onChange={d.setCamera} className="c-field" placeholder={d.detected?.camera ?? "Read from photo"} hint={d.detected?.camera ? "Blank = use the value read from the photo." : undefined} />
                    <TextField label="Lens" value={d.lens} onChange={d.setLens} className="c-field" placeholder={d.detected?.lens ?? "Read from photo"} />
                    {d.progress && (
                        <div className="c-progress" role="progressbar" aria-valuemin={0} aria-valuemax={d.progress.total} aria-valuenow={d.progress.current}>
                            <span style={{ width: `${(d.progress.current / d.progress.total) * 100}%` }} />
                        </div>
                    )}
                    <button type="submit" className="c-btn is-primary is-block" disabled={d.publishing}>
                        {d.progress ? <>Uploading <Count value={d.progress.current} total={d.progress.total} pad className="c-inline-count" /></> : d.publishing ? "Publishing…" : "Publish"}
                    </button>
                </section>
            </form>
        </main>
    );
}
