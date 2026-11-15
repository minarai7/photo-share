// Variant 2 — Wall label. Axis: information design. Photographs keep their
// natural proportions (justified rows, like a hang on a gallery wall), and
// every work carries a museum wall label: title, artist, place, medium.
// Warm white walls, a classic serif for titles, a quiet sans for everything
// you operate. Borrowed from the reference: the CV-style chronology, italic
// years, thin rules, opacity-only hovers.
import { useEffect, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { MotionConfig, motion } from "motion/react";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { toast } from "sonner";
import {
    ME, POSTS, formatDate, formatRelative, gearLine, getPost, getUser, neighbours, postsByUser, yearOf,
    type ProtoPost,
} from "../data";
import { useProto } from "../protoContext";
import { useAuthForm, useDocumentKeys, useDraft, type AuthMode } from "../shared/hooks";
import { AccountMenu, ConfirmDelete, Count, EditPost, GearLink, LangToggle, SortablePhotos, TextField, Toasts } from "../shared/ui";

const isJa = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

export function WallLabel() {
    const { route } = useProto();
    const bare = route.screen === "login" || route.screen === "signup";
    return (
        <MotionConfig reducedMotion="user">
            <div className="w-root">
                <Header compact={bare} />
                {route.screen === "feed" && <Feed />}
                {route.screen === "post" && <Post post={getPost(route.postId)} key={route.postId} />}
                {route.screen === "profile" && <Profile userId={route.userId ?? ME.id} key={route.userId} />}
                {bare && <Auth mode={route.screen as AuthMode} key={route.screen} />}
                {route.screen === "create" && <Create />}
                <Toasts position="bottom-right" />
            </div>
        </MotionConfig>
    );
}

// ------------------------------------------------------------------ header

function Header({ compact }: { compact: boolean }) {
    const { route, go, signedIn } = useProto();
    return (
        <header className="w-header">
            <nav className="w-header-nav" aria-label="Primary">
                {!compact && (
                    <>
                        <button type="button" className={clsx("w-navlink", route.screen === "feed" && "is-active")} onClick={() => go({ screen: "feed" })}>
                            Feed
                        </button>
                        {signedIn && (
                            <button type="button" className={clsx("w-navlink", route.screen === "create" && "is-active")} onClick={() => go({ screen: "create" })}>
                                New post
                            </button>
                        )}
                    </>
                )}
            </nav>
            <button type="button" className="w-wordmark" onClick={() => go({ screen: "feed" })}>
                Photo Share
            </button>
            <div className="w-header-aux">
                <LangToggle className="w-lang" />
                {signedIn ? (
                    <AccountMenu className="w-account">
                        <span className="w-avatar" aria-hidden="true">{ME.username[0]}</span>
                        <span className="w-account-name">{ME.username}</span>
                    </AccountMenu>
                ) : (
                    !compact && (
                        <>
                            <button type="button" className="w-navlink" onClick={() => go({ screen: "login" })}>Log in</button>
                            <button type="button" className="w-btn is-small" onClick={() => go({ screen: "signup" })}>Sign up</button>
                        </>
                    )
                )}
            </div>
        </header>
    );
}

// ------------------------------------------------------------------ justified gallery

function useElementWidth() {
    const [el, setEl] = useState<HTMLElement | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [setEl, width] as const;
}

type Row = { posts: ProtoPost[]; height: number };

/** Fill rows to the container width at (at most) the target height, like a hang. */
function justify(posts: ProtoPost[], width: number, target: number, gap: number): Row[] {
    const rows: Row[] = [];
    let row: ProtoPost[] = [];
    let sum = 0;
    for (const p of posts) {
        row.push(p);
        sum += p.images[0].w / p.images[0].h;
        const h = (width - gap * (row.length - 1)) / sum;
        if (h <= target) {
            rows.push({ posts: row, height: h });
            row = [];
            sum = 0;
        }
    }
    if (row.length) rows.push({ posts: row, height: Math.min(target, (width - gap * (row.length - 1)) / sum) });
    return rows;
}

function Gallery({ posts, showAuthor = true }: { posts: ProtoPost[]; showAuthor?: boolean }) {
    const { go } = useProto();
    const [ref, width] = useElementWidth();
    const narrow = width > 0 && width < 640;
    const gap = narrow ? 16 : 32;
    const rows = width ? justify(posts, width, narrow ? 190 : 330, gap) : [];
    return (
        <div className="w-gallery" ref={ref}>
            {rows.map((row, r) => (
                <div key={r} className="w-row" style={{ gap }}>
                    {row.posts.map((p, i) => {
                        const ratio = p.images[0].w / p.images[0].h;
                        return (
                            <motion.figure
                                key={p.id}
                                className="w-work"
                                style={{ width: ratio * row.height }}
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.45, ease: "easeOut", delay: i * 0.05 }}
                            >
                                <button
                                    type="button"
                                    className="w-work-img"
                                    style={{ height: row.height }}
                                    onClick={() => go({ screen: "post", postId: p.id })}
                                    aria-label={`${p.caption} by ${p.username}`}
                                >
                                    <img src={p.images[0].src} alt="" loading={r < 2 ? "eager" : "lazy"} decoding="async" />
                                </button>
                                <figcaption className="w-label">
                                    <span className={clsx("w-label-title", isJa(p.caption) && "is-ja")}>{p.caption}</span>
                                    <span className="w-label-meta">
                                        {showAuthor && (
                                            <button type="button" className="w-label-author" onClick={() => go({ screen: "profile", userId: p.user_id })}>
                                                {p.username}
                                            </button>
                                        )}
                                        <span>{showAuthor ? formatRelative(p.created_at) : formatDate(p.created_at)}</span>
                                    </span>
                                    {(gearLine(p, ", ") || p.images.length > 1) && (
                                        <span className="w-label-medium">
                                            {p.images.length > 1 && <span className="w-label-series">Series of {p.images.length}</span>}
                                            {gearLine(p, ", ")}
                                        </span>
                                    )}
                                </figcaption>
                            </motion.figure>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ------------------------------------------------------------------ feed

function Feed() {
    const { signedIn, go } = useProto();
    const [loading, setLoading] = useState(false);
    return (
        <main className="w-page">
            {!signedIn && (
                <section className="w-welcome">
                    <p className="w-welcome-title">Photographs, hung properly.</p>
                    <p className="w-welcome-sub">Share a frame or a series. Every work gets its own label: title, place, and the camera it was made with.</p>
                    <div className="w-welcome-actions">
                        <button type="button" className="w-btn" onClick={() => go({ screen: "signup" })}>Create an account</button>
                        <button type="button" className="w-btn is-ghost" onClick={() => go({ screen: "login" })}>Log in</button>
                    </div>
                </section>
            )}
            <header className="w-page-head">
                <div>
                    <h1 className="w-h1">Latest work</h1>
                    <p className="w-lede">New photographs from the community, newest first.</p>
                </div>
                <p className="w-count">{POSTS.length} works</p>
            </header>
            <Gallery posts={POSTS} />
            <div className="w-more">
                <button
                    type="button"
                    className="w-btn is-ghost"
                    disabled={loading}
                    onClick={async () => {
                        setLoading(true);
                        await new Promise((r) => setTimeout(r, 700));
                        setLoading(false);
                        toast("You’re all caught up", { description: "That’s every post so far." });
                    }}
                >
                    {loading ? "Loading…" : "Show more work"}
                </button>
            </div>
            <Footer />
        </main>
    );
}

function Footer() {
    return (
        <footer className="w-footer">
            <span className="w-footer-mark">Photo Share</span>
            <span>Every photograph remains the property of the person who made it.</span>
            <span className="w-footer-year">2026</span>
        </footer>
    );
}

// ------------------------------------------------------------------ post

function Post({ post }: { post: ProtoPost }) {
    const { go, signedIn, portal } = useProto();
    const [open, setOpen] = useState<number | null>(null);
    const { prev, next } = neighbours(post.id);
    const own = signedIn && post.user_id === ME.id;
    const more = postsByUser(post.user_id).filter((p) => p.id !== post.id).slice(0, 3);
    const total = post.images.length;

    useDocumentKeys((e) => {
        if (open === null) return;
        if (e.key === "ArrowLeft" && open > 0) {
            e.preventDefault();
            setOpen(open - 1);
        } else if (e.key === "ArrowRight" && open < total - 1) {
            e.preventDefault();
            setOpen(open + 1);
        }
    });

    return (
        <main className="w-post">
            <section className="w-plates" aria-label="Photographs">
                {post.images.map((im, i) => (
                    <figure key={im.src} className="w-plate">
                        <button type="button" className="w-plate-img" onClick={() => setOpen(i)} aria-label={`View photo ${i + 1} of ${total} larger`}>
                            <img src={im.src} alt={post.caption} width={im.w} height={im.h} fetchPriority={i === 0 ? "high" : undefined} />
                        </button>
                        {total > 1 && (
                            <figcaption className="w-plate-no">
                                {i + 1} / {total}
                            </figcaption>
                        )}
                    </figure>
                ))}
            </section>

            <aside className="w-aside">
                <button type="button" className="w-artist" onClick={() => go({ screen: "profile", userId: post.user_id })}>
                    <span className="w-avatar" aria-hidden="true">{post.username[0]}</span>
                    {post.username}
                </button>
                <h1 className={clsx("w-title", isJa(post.caption) && "is-ja")}>{post.caption}</h1>
                <p className="w-title-sub">
                    <em>{yearOf(post.created_at)}</em> · {total === 1 ? "Single photograph" : `Series of ${total} photographs`}
                </p>
                <dl className="w-facts">
                    {post.location && (
                        <div>
                            <dt>Location</dt>
                            <dd>{post.location}</dd>
                        </div>
                    )}
                    {post.camera_body && (
                        <div>
                            <dt>Camera</dt>
                            <dd>
                                {post.camera_body}
                                <GearLink name={post.camera_body} label="Find product" className="w-find" />
                            </dd>
                        </div>
                    )}
                    {post.lens && (
                        <div>
                            <dt>Lens</dt>
                            <dd>
                                {post.lens}
                                <GearLink name={post.lens} label="Find product" className="w-find" />
                            </dd>
                        </div>
                    )}
                    <div>
                        <dt>Posted</dt>
                        <dd>{formatDate(post.created_at)}</dd>
                    </div>
                </dl>
                {own && (
                    <div className="w-owner">
                        <EditPost post={post} className="w-btn is-ghost is-small" />
                        <ConfirmDelete post={post} className="w-btn is-ghost is-small is-danger" />
                    </div>
                )}
                {more.length > 0 && (
                    <section className="w-more-from">
                        <h2 className="w-h3">More from {post.username}</h2>
                        <div className="w-more-grid">
                            {more.map((p) => (
                                <button key={p.id} type="button" onClick={() => go({ screen: "post", postId: p.id })} aria-label={p.caption}>
                                    <img src={p.images[0].src} alt="" loading="lazy" />
                                </button>
                            ))}
                        </div>
                    </section>
                )}
                <nav className="w-pager" aria-label="More posts">
                    {prev ? (
                        <button type="button" onClick={() => go({ screen: "post", postId: prev.id })}>
                            <span>← Newer</span>
                            <em>{prev.caption}</em>
                        </button>
                    ) : <span />}
                    {next ? (
                        <button type="button" className="is-next" onClick={() => go({ screen: "post", postId: next.id })}>
                            <span>Older →</span>
                            <em>{next.caption}</em>
                        </button>
                    ) : <span />}
                </nav>
            </aside>

            <Dialog.Root open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
                <Dialog.Portal container={portal}>
                    <Dialog.Popup className="w-lightbox">
                        <Dialog.Title className="sr-only">{post.caption}</Dialog.Title>
                        {open !== null && (
                            <>
                                <img src={post.images[open].src} alt={post.caption} className="w-lightbox-img" />
                                <div className="w-lightbox-bar">
                                    <span className={clsx("w-lightbox-title", isJa(post.caption) && "is-ja")}>{post.caption}</span>
                                    {total > 1 && (
                                        <span className="w-lightbox-nav">
                                            <button type="button" onClick={() => setOpen(open - 1)} disabled={open === 0} aria-label="Previous photo">←</button>
                                            <Count value={open + 1} total={total} />
                                            <button type="button" onClick={() => setOpen(open + 1)} disabled={open === total - 1} aria-label="Next photo">→</button>
                                        </span>
                                    )}
                                    <Dialog.Close className="w-lightbox-close">Close</Dialog.Close>
                                </div>
                            </>
                        )}
                    </Dialog.Popup>
                </Dialog.Portal>
            </Dialog.Root>
        </main>
    );
}

// ------------------------------------------------------------------ profile

function Profile({ userId }: { userId: number }) {
    const { go, signedIn } = useProto();
    const user = getUser(userId);
    const posts = postsByUser(user.id);
    const photos = posts.reduce((n, p) => n + p.images.length, 0);
    const own = signedIn && user.id === ME.id;
    const years = [...new Set(posts.map((p) => yearOf(p.created_at)))];

    return (
        <main className="w-page">
            <header className="w-profile-head">
                <div>
                    <p className="w-kicker">{own ? "Your profile" : "Photographer"}</p>
                    <h1 className="w-profile-name">{user.username}</h1>
                    <p className="w-profile-bio">{user.bio}</p>
                </div>
                <div className="w-profile-side">
                    <p className="w-stats">
                        <span><strong>{posts.length}</strong> works</span>
                        <span><strong>{photos}</strong> photographs</span>
                        <span>since <strong>2026</strong></span>
                    </p>
                    {own && (
                        <button type="button" className="w-btn" onClick={() => go({ screen: "create" })}>New post</button>
                    )}
                </div>
            </header>

            <Tabs.Root defaultValue="works" className="w-tabs">
                <Tabs.List className="w-tablist" aria-label="Profile views">
                    <Tabs.Tab value="works" className="w-tab">Works</Tabs.Tab>
                    <Tabs.Tab value="index" className="w-tab">Index</Tabs.Tab>
                    <Tabs.Indicator className="w-tab-indicator" />
                </Tabs.List>
                <Tabs.Panel value="works" className="w-tabpanel">
                    <Gallery posts={posts} showAuthor={false} />
                </Tabs.Panel>
                <Tabs.Panel value="index" className="w-tabpanel">
                    {years.map((y) => (
                        <section key={y} className="w-chrono">
                            <h2 className="w-chrono-year">{y}</h2>
                            <ol className="w-chrono-list">
                                {posts.filter((p) => yearOf(p.created_at) === y).map((p) => (
                                    <li key={p.id}>
                                        <button type="button" className="w-chrono-row" onClick={() => go({ screen: "post", postId: p.id })}>
                                            <span className="w-chrono-date">{formatDate(p.created_at)}</span>
                                            <span className={clsx("w-chrono-title", isJa(p.caption) && "is-ja")}>{p.caption}</span>
                                            <span className="w-chrono-meta">
                                                {p.images.length === 1 ? "1 photograph" : `${p.images.length} photographs`}
                                                {p.location && ` · ${p.location}`}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    ))}
                </Tabs.Panel>
            </Tabs.Root>
            <Footer />
        </main>
    );
}

// ------------------------------------------------------------------ auth

function Auth({ mode }: { mode: AuthMode }) {
    const { go } = useProto();
    const f = useAuthForm(mode);
    const isLogin = mode === "login";
    const feature = getPost(isLogin ? 112 : 107);
    return (
        <main className="w-auth">
            <figure className="w-auth-figure" style={{ "--tint": feature.tint } as CSSProperties}>
                <img src={feature.images[isLogin ? 1 : 0].src} alt="" />
                <figcaption className="w-auth-label">
                    <em>{feature.caption}</em>
                    <span>{feature.username} · {feature.location}</span>
                </figcaption>
            </figure>
            <section className="w-auth-panel">
                <form className="w-form" onSubmit={f.submit} noValidate>
                    <h1 className="w-h1">{isLogin ? "Welcome back" : "Create your account"}</h1>
                    <p className="w-lede">{isLogin ? "Log in to post and to look up gear." : "Free, and it takes a minute. Your camera details come from your photos."}</p>
                    {f.formError && <p className="w-alert" role="alert">{f.formError}</p>}
                    {!isLogin && (
                        <TextField label="Username" value={f.username} onChange={f.setUsername} error={f.errors.username} autoComplete="username" className="w-field" hint="Shown on your work. Lowercase letters, numbers, dots and underscores." />
                    )}
                    <TextField label="Email" type="email" value={f.email} onChange={f.setEmail} error={f.errors.email} autoComplete="email" className="w-field" placeholder="you@example.com" />
                    <TextField
                        label="Password"
                        type="password"
                        value={f.password}
                        onChange={f.setPassword}
                        error={f.errors.password}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        className="w-field"
                        hint={isLogin ? undefined : "At least 8 characters."}
                    />
                    <button type="submit" className="w-btn is-block" disabled={f.pending}>
                        {f.pending ? "One moment…" : isLogin ? "Log in" : "Create account"}
                    </button>
                    <p className="w-form-alt">
                        {isLogin ? "New here?" : "Already have an account?"}{" "}
                        <button type="button" className="w-link" onClick={() => go({ screen: isLogin ? "signup" : "login" })}>
                            {isLogin ? "Create an account" : "Log in"}
                        </button>
                    </p>
                    <p className="w-proto-note">Prototype: the password “wrong” shows the error state.</p>
                </form>
            </section>
        </main>
    );
}

// ------------------------------------------------------------------ create

function Create() {
    const d = useDraft();
    const cover = d.photos[0];
    const camera = d.camera.trim() || d.detected?.camera || null;
    const lens = d.lens.trim() || d.detected?.lens || null;
    return (
        <main className="w-page">
            <header className="w-page-head">
                <div>
                    <h1 className="w-h1">New work</h1>
                    <p className="w-lede">Up to ten photographs. The first one is the cover.</p>
                </div>
            </header>
            <form className="w-create" onSubmit={d.submit}>
                <section className="w-create-photos" aria-label="Photos">
                    {d.photos.length === 0 ? (
                        <div className="w-drop">
                            <p className="w-drop-title">Drop photographs here</p>
                            <p className="w-drop-sub">JPEG, PNG or WebP, up to 32 MB each. Location data is removed before anything is stored.</p>
                            <button type="button" className="w-btn" onClick={d.addPhotos}>Choose photos</button>
                        </div>
                    ) : (
                        <>
                            <SortablePhotos
                                draft={d}
                                className="w-sortable"
                                addSlot={
                                    d.canAddMore ? (
                                        <li className="w-add">
                                            <button type="button" onClick={d.addPhotos}>
                                                <span aria-hidden="true">+</span> Add photos
                                            </button>
                                        </li>
                                    ) : undefined
                                }
                            />
                            <p className="w-hint">Drag to reorder, or focus a photo and use space and the arrow keys. {d.photos.length} of 10.</p>
                        </>
                    )}
                </section>
                <section className="w-create-form" aria-label="Label">
                    {d.error && <p className="w-alert" role="alert">{d.error}</p>}
                    <TextField label="Title" value={d.caption} onChange={d.setCaption} className="w-field" placeholder="Untitled" />
                    <TextField label="Location" value={d.location} onChange={d.setLocation} className="w-field" placeholder="Optional" />
                    <div className="w-field-pair">
                        <TextField label="Camera" value={d.camera} onChange={d.setCamera} className="w-field" placeholder={d.detected?.camera ?? "From your photo"} />
                        <TextField label="Lens" value={d.lens} onChange={d.setLens} className="w-field" placeholder={d.detected?.lens ?? "From your photo"} />
                    </div>
                    {d.detected?.camera && (
                        <p className="w-detected">
                            <span className="w-dot" aria-hidden="true" /> Camera and lens read from <strong>{d.photos.find((p) => p.exif.camera)?.name}</strong>. Type to override.
                        </p>
                    )}
                    <div className="w-preview" aria-label="Label preview">
                        <p className="w-kicker">Label preview</p>
                        <div className="w-preview-body">
                            {cover && <img src={cover.image.src} alt="" />}
                            <div className="w-label">
                                <span className={clsx("w-label-title", isJa(d.caption) && "is-ja")}>{d.caption.trim() || "Untitled"}</span>
                                <span className="w-label-meta">
                                    <span>{ME.username}</span>
                                    {d.location.trim() && <span>{d.location.trim()}</span>}
                                </span>
                                <span className="w-label-medium">
                                    {d.photos.length > 1 && <span className="w-label-series">Series of {d.photos.length}</span>}
                                    {[camera, lens].filter(Boolean).join(", ") || "No camera details"}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="submit" className="w-btn is-block" disabled={d.publishing}>
                        {d.progress ? (
                            <>
                                Uploading <Count value={d.progress.current} total={d.progress.total} className="w-inline-count" />
                            </>
                        ) : d.publishing ? "Publishing…" : "Publish"}
                    </button>
                </section>
            </form>
        </main>
    );
}
