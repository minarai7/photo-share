// Variant 1 — Exhibition. Axis: the reference site, translated faithfully.
// A fixed four-edge frame (wordmark, nav, MENU, vertical title, vertical ©),
// pale page colours that change with the section in view, a spotlight hover
// that hands the whole page to one photograph, horizontal drift on the hero.
import { useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";
import {
    ME, NOW, POSTS, formatDateDots, getPost, getUser, neighbours, postsByUser, yearOf,
    type ProtoPost,
} from "../data";
import { useProto, type Route } from "../protoContext";
import { useAuthForm, useDocumentKeys, useDraft, useInViewKey, useSnapTrack, type AuthMode } from "../shared/hooks";
import { ConfirmDelete, Count, EditPost, GearLink, LangToggle, SortablePhotos, TextField, Toasts } from "../shared/ui";

const PAPER = "#f4f1ec";
const isJa = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);
const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function Exhibition() {
    const { route } = useProto();
    return (
        <MotionConfig reducedMotion="user">
            {route.screen === "feed" && <Feed />}
            {route.screen === "post" && <Post post={getPost(route.postId)} />}
            {route.screen === "profile" && <Profile userId={route.userId ?? ME.id} />}
            {(route.screen === "login" || route.screen === "signup") && <ExhibitionAuth mode={route.screen} key={route.screen} />}
            {route.screen === "create" && <ExhibitionCreate />}
            <Toasts position="bottom-right" />
        </MotionConfig>
    );
}

// ------------------------------------------------------------------ frame

function Frame({ title, year, onImage = false, dim = false }: { title?: string; year?: number | string; onImage?: boolean; dim?: boolean }) {
    const { route, go, signedIn } = useProto();
    const links: { label: string; to: Route; active: boolean }[] = signedIn
        ? [
              { label: "Feed", to: { screen: "feed" }, active: route.screen === "feed" },
              { label: "Profile", to: { screen: "profile", userId: ME.id }, active: route.screen === "profile" && (route.userId ?? ME.id) === ME.id },
              { label: "New post", to: { screen: "create" }, active: route.screen === "create" },
          ]
        : [
              { label: "Feed", to: { screen: "feed" }, active: route.screen === "feed" },
              { label: "Log in", to: { screen: "login" }, active: route.screen === "login" },
              { label: "Sign up", to: { screen: "signup" }, active: route.screen === "signup" },
          ];
    return (
        <div className={clsx("x-frame", onImage && "is-on-image", dim && "is-dim")}>
            <button type="button" className="x-wordmark" onClick={() => go({ screen: "feed" })}>
                Photo Share
            </button>
            {/* No Back here: per DESIGN-SYSTEM.md, Back belongs to the post view and never sits by the wordmark. */}
            <nav className="x-nav" aria-label="Primary">
                {links.map((l) => (
                    <button
                        key={l.label}
                        type="button"
                        className={clsx("x-nav-link", l.active && "is-active")}
                        aria-current={l.active ? "page" : undefined}
                        onClick={() => go(l.to)}
                    >
                        {l.label}
                    </button>
                ))}
            </nav>
            <MenuOverlay />
            {title && <SideTitle title={title} year={year} />}
            <span className="x-copy" aria-hidden="true">© 2026 Photo Share</span>
        </div>
    );
}

function SideTitle({ title, year }: { title: string; year?: number | string }) {
    return (
        <p className={clsx("x-side", isJa(title) && "is-ja")} key={title} aria-hidden="true">
            <span className="x-side-title">{title}</span>
            {year && <span className="x-side-year">{year}</span>}
        </p>
    );
}

function MenuOverlay() {
    const { portal, go, signedIn, signOut } = useProto();
    const [open, setOpen] = useState(false);
    const to = (r: Route) => {
        setOpen(false);
        go(r);
    };
    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="x-menu-trigger">
                <span className="x-rule" aria-hidden="true" />
                Menu
            </Dialog.Trigger>
            <Dialog.Portal container={portal}>
                <Dialog.Popup className="x-menu">
                    <Dialog.Title className="sr-only">Menu</Dialog.Title>
                    <Dialog.Close className="x-close">
                        <span className="x-close-line" aria-hidden="true" />
                        Close
                    </Dialog.Close>
                    <nav className="x-menu-box" aria-label="Menu">
                        <MenuStack onNavigate={to} signedIn={signedIn} onSignOut={() => { setOpen(false); signOut(); toast("Signed out"); }} />
                    </nav>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function MenuStack({ onNavigate, signedIn, onSignOut }: { onNavigate: (r: Route) => void; signedIn: boolean; onSignOut: () => void }) {
    return (
        <>
            <button type="button" className="x-menu-title" onClick={() => onNavigate({ screen: "feed" })}>
                Photo Share
            </button>
            <div className="x-menu-row is-primary">
                <button type="button" onClick={() => onNavigate({ screen: "feed" })}>Feed</button>
                <button type="button" onClick={() => onNavigate({ screen: "create" })}>New post</button>
            </div>
            <div className="x-menu-row">
                {signedIn ? (
                    <>
                        <button type="button" onClick={() => onNavigate({ screen: "profile", userId: ME.id })}>{ME.username}</button>
                        <button type="button" onClick={onSignOut}>Log out</button>
                    </>
                ) : (
                    <>
                        <button type="button" onClick={() => onNavigate({ screen: "login" })}>Log in</button>
                        <button type="button" onClick={() => onNavigate({ screen: "signup" })}>Sign up</button>
                    </>
                )}
            </div>
            <div className="x-menu-foot">
                <LangToggle className="x-lang" />
                <small>© 2026 Photo Share</small>
            </div>
        </>
    );
}

function Footer() {
    const { go, signedIn, signOut } = useProto();
    return (
        <footer className="x-footer">
            <nav className="x-menu-box" aria-label="Footer">
                <MenuStack onNavigate={go} signedIn={signedIn} onSignOut={() => { signOut(); toast("Signed out"); }} />
            </nav>
        </footer>
    );
}

// ------------------------------------------------------------------ feed

type Section = { key: string; label: string; year: number; tint: string; posts: ProtoPost[] };

function sections(posts: ProtoPost[]): Section[] {
    const tints = ["#d8e2dd", "#ffdcc6", "#dbcdbd", "#cfd2cf"];
    const out: Section[] = [];
    for (const p of posts) {
        const days = (NOW.getTime() - new Date(p.created_at).getTime()) / 86_400_000;
        const label = days < 7 ? "This week" : new Date(p.created_at).toLocaleDateString("en-GB", { month: "long" });
        const key = label.toLowerCase().replace(/\s/g, "-");
        let s = out.find((x) => x.key === key);
        if (!s) {
            s = { key, label, year: yearOf(p.created_at), tint: tints[out.length % tints.length], posts: [] };
            out.push(s);
        }
        s.posts.push(p);
    }
    return out;
}

function Feed() {
    const { signedIn, go } = useProto();
    const groups = sections(POSTS);
    const inView = useInViewKey(".x-section[data-key]");
    const [hot, setHot] = useState<ProtoPost | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const current = groups.find((g) => g.key === inView) ?? groups[0];
    // Before the observer reports, a signed-out visitor is looking at the hero.
    const heroInView = !signedIn && (inView === null || inView === "hero");

    const page = hot ? hot.tintDeep : heroInView ? "#111" : current.tint;

    return (
        <div className={clsx("x-page", hot && "is-spot")} style={{ "--page": page } as CSSProperties}>
            <Frame
                title={heroInView ? undefined : current.label}
                year={heroInView ? undefined : current.year}
                onImage={heroInView}
                dim={!!hot}
            />

            {!signedIn && <Hero />}

            <main className="x-main">
                {!signedIn && (
                    <section className="x-intro" data-key={groups[0].key}>
                        <p className="x-intro-lead">A quiet place to show your photographs.</p>
                        <p className="x-intro-sub">
                            Post a single frame or a series of up to ten. Camera and lens are read from the file.
                        </p>
                        <div className="x-intro-actions">
                            <button type="button" className="x-button" onClick={() => go({ screen: "signup" })}>Sign up</button>
                            <button type="button" className="x-textlink" onClick={() => go({ screen: "login" })}>Log in</button>
                        </div>
                    </section>
                )}

                {groups.map((g) => (
                    <section key={g.key} className="x-section" data-key={g.key} aria-label={`${g.label} ${g.year}`}>
                        <h2 className="x-section-title">
                            {g.label} <em>{g.year}</em>
                        </h2>
                        <ul className="x-grid">
                            {g.posts.map((p, i) => (
                                <Tile key={p.id} post={p} index={i} hot={hot} setHot={setHot} />
                            ))}
                        </ul>
                    </section>
                ))}

                <div className="x-more">
                    <button
                        type="button"
                        className="x-textlink"
                        disabled={loadingMore}
                        onClick={async () => {
                            setLoadingMore(true);
                            await new Promise((r) => setTimeout(r, 700));
                            setLoadingMore(false);
                            toast("You’re all caught up", { description: "That’s every post so far." });
                        }}
                    >
                        {loadingMore ? "Loading…" : "More"}
                    </button>
                </div>
            </main>
            <Footer />
        </div>
    );
}

function Tile({ post, index, hot, setHot }: { post: ProtoPost; index: number; hot: ProtoPost | null; setHot: (p: ProtoPost | null) => void }) {
    const { go } = useProto();
    const cover = post.images[0];
    return (
        <motion.li
            className={clsx("x-tile", hot?.id === post.id && "is-hot")}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: (index % 4) * 0.04 }}
        >
            <button
                type="button"
                className="x-tile-link"
                onClick={() => go({ screen: "post", postId: post.id })}
                onMouseEnter={() => canHover() && setHot(post)}
                onMouseLeave={() => setHot(null)}
                aria-label={`${post.caption} by ${post.username}${post.images.length > 1 ? `, ${post.images.length} photos` : ""}`}
            >
                <img src={cover.src} alt="" loading={index < 4 ? "eager" : "lazy"} decoding="async" />
            </button>
            <p className="x-tile-line">
                <span className={clsx("x-tile-title", isJa(post.caption) && "is-ja")}>{post.caption}</span>
                <button type="button" className="x-tile-author" onClick={() => go({ screen: "profile", userId: post.user_id })}>
                    {post.username}
                </button>
                {post.images.length > 1 && <span className="x-tile-count">{post.images.length} photos</span>}
            </p>
        </motion.li>
    );
}

function Hero() {
    const featured = [getPost(112), getPost(103), getPost(111)];
    return (
        <section className="x-hero" data-key="hero" aria-label="Featured">
            {featured.map((p, i) => (
                <HeroPanel key={p.id} post={p} direction={i % 2 === 0 ? 1 : -1} first={i === 0} />
            ))}
        </section>
    );
}

function HeroPanel({ post, direction, first }: { post: ProtoPost; direction: 1 | -1; first: boolean }) {
    const { go } = useProto();
    const ref = useRef<HTMLDivElement>(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
    // ±8% of a 120%-wide image ≈ ±10% of the panel: the reference's measured drift.
    const x = useTransform(scrollYProgress, [0, 1], direction > 0 ? ["-8%", "8%"] : ["8%", "-8%"]);
    const scrollCue = useTransform(scrollYProgress, [0.5, 0.62], [1, 0]);
    return (
        <div ref={ref} className="x-hero-panel" data-key="hero">
            <motion.img
                src={post.images[0].src}
                alt=""
                className="x-hero-img"
                style={reduce ? undefined : { x }}
                fetchPriority={first ? "high" : undefined}
            />
            <button type="button" className="x-hero-credit" onClick={() => go({ screen: "post", postId: post.id })}>
                <span>{post.caption}</span> — {post.username}
            </button>
            {first && (
                <motion.span className="x-scroll" style={{ opacity: scrollCue }} aria-hidden="true">
                    Scroll
                </motion.span>
            )}
        </div>
    );
}

// ------------------------------------------------------------------ post

function Post({ post }: { post: ProtoPost }) {
    const { go, signedIn } = useProto();
    const total = post.images.length;
    const { index, go: show, trackRef, onScroll } = useSnapTrack(total);
    const { prev, next } = neighbours(post.id);
    const isOwner = signedIn && post.user_id === ME.id;

    useDocumentKeys((e) => {
        if (e.key === "ArrowLeft" && index > 0) {
            e.preventDefault();
            show(index - 1);
        } else if (e.key === "ArrowRight" && index < total - 1) {
            e.preventDefault();
            show(index + 1);
        }
    });

    return (
        <div className="x-page" style={{ "--page": post.tint } as CSSProperties}>
            <Frame title={post.caption} year={yearOf(post.created_at)} />
            <main className="x-post">
                <section className="x-viewer" aria-roledescription="carousel" aria-label={post.caption}>
                    <div className="x-track" ref={trackRef} onScroll={onScroll}>
                        {post.images.map((im, i) => (
                            <figure key={im.src} className="x-slide" aria-hidden={i !== index}>
                                <img src={im.src} alt={post.caption} fetchPriority={i === 0 ? "high" : undefined} />
                            </figure>
                        ))}
                    </div>
                    {total > 1 && (
                        <>
                            <button type="button" className="x-chev is-prev" onClick={() => show(index - 1)} disabled={index === 0} aria-label="Previous photo" />
                            <button type="button" className="x-chev is-next" onClick={() => show(index + 1)} disabled={index === total - 1} aria-label="Next photo" />
                            <Count value={index + 1} total={total} className="x-counter" />
                        </>
                    )}
                </section>

                <section className="x-credit">
                    <h1 className={clsx("x-credit-title", isJa(post.caption) && "is-ja")}>
                        {post.caption} <em>{yearOf(post.created_at)}</em>
                    </h1>
                    <p className="x-credit-line">
                        <button type="button" className="x-credit-author" onClick={() => go({ screen: "profile", userId: post.user_id })}>
                            {post.username}
                        </button>
                        {post.location && <span>{post.location}</span>}
                        <span>{formatDateDots(post.created_at)}</span>
                    </p>
                    {(post.camera_body || post.lens) && (
                        <p className="x-credit-line is-gear">
                            {post.camera_body && (
                                <span>
                                    {post.camera_body} <GearLink name={post.camera_body} label="find" className="x-find" />
                                </span>
                            )}
                            {post.lens && (
                                <span>
                                    {post.lens} <GearLink name={post.lens} label="find" className="x-find" />
                                </span>
                            )}
                        </p>
                    )}
                    {isOwner && (
                        <p className="x-owner">
                            <EditPost post={post} className="x-textlink" />
                            <ConfirmDelete post={post} className="x-textlink is-quiet" />
                        </p>
                    )}
                </section>

                <nav className="x-pager" aria-label="More posts">
                    {prev ? <PagerLink post={prev} dir="prev" /> : <span />}
                    {next ? <PagerLink post={next} dir="next" /> : <span />}
                </nav>
            </main>
            <Footer />
        </div>
    );
}

function PagerLink({ post, dir }: { post: ProtoPost; dir: "prev" | "next" }) {
    const { go } = useProto();
    return (
        <button type="button" className={clsx("x-pager-link", `is-${dir}`)} onClick={() => go({ screen: "post", postId: post.id })}>
            <img src={post.images[0].src} alt="" loading="lazy" />
            <span className="x-pager-label">{dir === "prev" ? "Newer" : "Older"}</span>
            <span className="x-pager-title">{post.caption}</span>
        </button>
    );
}

// ------------------------------------------------------------------ profile

function Profile({ userId }: { userId: number }) {
    const { go, signedIn } = useProto();
    const user = getUser(userId);
    const posts = postsByUser(user.id);
    const inView = useInViewKey(".x-series[data-key]");
    const current = posts.find((p) => String(p.id) === inView);
    const photoCount = posts.reduce((n, p) => n + p.images.length, 0);
    const own = signedIn && user.id === ME.id;

    return (
        <div className="x-page" style={{ "--page": current?.tint ?? PAPER } as CSSProperties}>
            <Frame title={current ? current.caption : user.username} year={current ? yearOf(current.created_at) : undefined} />
            <main className="x-main">
                <header className="x-profile-head">
                    <h1 className="x-profile-name">{user.username}</h1>
                    <p className="x-profile-bio">{user.bio}</p>
                    <p className="x-profile-stats">
                        {posts.length} posts · {photoCount} photographs
                    </p>
                    {own && (
                        <button type="button" className="x-button" onClick={() => go({ screen: "create" })}>
                            New post
                        </button>
                    )}
                </header>

                {posts.map((p) => (
                    <section key={p.id} className="x-series" data-key={p.id} aria-label={p.caption}>
                        <h2 className={clsx("x-section-title", isJa(p.caption) && "is-ja")}>
                            {p.caption} <em>{yearOf(p.created_at)}</em>
                        </h2>
                        <ul className="x-series-grid" data-count={p.images.length}>
                            {p.images.map((im, i) => (
                                <li key={im.src}>
                                    <button
                                        type="button"
                                        className="x-tile-link"
                                        onClick={() => go({ screen: "post", postId: p.id })}
                                        aria-label={`${p.caption}, photo ${i + 1} of ${p.images.length}`}
                                    >
                                        <img src={im.src} alt="" loading="lazy" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </main>
            <Footer />
        </div>
    );
}

// ------------------------------------------------------------------ auth

export function ExhibitionAuth({ mode }: { mode: AuthMode }) {
    const { go } = useProto();
    const f = useAuthForm(mode);
    const isLogin = mode === "login";
    return (
        <div className="x-page" style={{ "--page": "#d8e2dd" } as CSSProperties}>
            <Frame title={isLogin ? "Welcome back" : "Join"} year={2026} />
            <main className="x-auth">
                <form className="x-form" onSubmit={f.submit} noValidate>
                    <h1 className="x-form-title">{isLogin ? "Log in" : "Sign up"}</h1>
                    <p className="x-form-sub">{isLogin ? "Good to see you again." : "Show your photographs, a series at a time."}</p>
                    {f.formError && (
                        <p className="x-form-error" role="alert">
                            {f.formError}
                        </p>
                    )}
                    {!isLogin && (
                        <TextField label="Username" value={f.username} onChange={f.setUsername} error={f.errors.username} autoComplete="username" className="x-field" hint="Shown on your posts." />
                    )}
                    <TextField label="Email" type="email" value={f.email} onChange={f.setEmail} error={f.errors.email} autoComplete="email" className="x-field" />
                    <TextField
                        label="Password"
                        type="password"
                        value={f.password}
                        onChange={f.setPassword}
                        error={f.errors.password}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        className="x-field"
                        hint={isLogin ? undefined : "At least 8 characters."}
                    />
                    <button type="submit" className="x-button is-block" disabled={f.pending}>
                        {f.pending ? (isLogin ? "Logging in…" : "Creating account…") : isLogin ? "Log in" : "Create account"}
                    </button>
                    <p className="x-form-alt">
                        {isLogin ? "New to Photo Share? " : "Already have an account? "}
                        <button type="button" className="x-textlink" onClick={() => go({ screen: isLogin ? "signup" : "login" })}>
                            {isLogin ? "Sign up" : "Log in"}
                        </button>
                    </p>
                    <p className="x-proto-note">Prototype: the password “wrong” shows the error state.</p>
                </form>
            </main>
        </div>
    );
}

// ------------------------------------------------------------------ create

export function ExhibitionCreate() {
    const d = useDraft();
    return (
        <div className="x-page" style={{ "--page": PAPER } as CSSProperties}>
            <Frame title="New post" year={2026} />
            <main className="x-create">
                <form className="x-create-grid" onSubmit={d.submit}>
                    <section className="x-create-photos" aria-label="Photos">
                        <h1 className="x-form-title">New post</h1>
                        {d.photos.length === 0 ? (
                            <button type="button" className="x-drop" onClick={d.addPhotos}>
                                <span className="x-drop-title">Choose photos</span>
                                <span className="x-drop-sub">JPEG, PNG or WebP · up to 32 MB each · up to 10 photos</span>
                            </button>
                        ) : (
                            <>
                                <SortablePhotos
                                    draft={d}
                                    className="x-sortable"
                                    addSlot={
                                        d.canAddMore ? (
                                            <li className="x-add">
                                                <button type="button" onClick={d.addPhotos}>+ Add</button>
                                            </li>
                                        ) : undefined
                                    }
                                />
                                <p className="x-hint">Drag to reorder. The first photo is the cover.</p>
                            </>
                        )}
                    </section>
                    <section className="x-create-fields" aria-label="Details">
                        {d.error && <p className="x-form-error" role="alert">{d.error}</p>}
                        <TextField label="Title" value={d.caption} onChange={d.setCaption} className="x-field" placeholder="Untitled" />
                        <TextField label="Location" value={d.location} onChange={d.setLocation} className="x-field" placeholder="Optional" />
                        <TextField
                            label="Camera"
                            value={d.camera}
                            onChange={d.setCamera}
                            className="x-field"
                            placeholder={d.detected?.camera ?? "Read from your photo"}
                            hint={d.detected?.camera ? "Read from the photo. Leave blank to use it." : undefined}
                        />
                        <TextField
                            label="Lens"
                            value={d.lens}
                            onChange={d.setLens}
                            className="x-field"
                            placeholder={d.detected?.lens ?? "Read from your photo"}
                        />
                        <button type="submit" className="x-button is-block" disabled={d.publishing}>
                            {d.progress ? (
                                <>
                                    Uploading <Count value={d.progress.current} total={d.progress.total} className="x-inline-count" />
                                </>
                            ) : d.publishing ? (
                                "Publishing…"
                            ) : (
                                "Publish"
                            )}
                        </button>
                    </section>
                </form>
            </main>
        </div>
    );
}
