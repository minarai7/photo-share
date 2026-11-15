import { useState, type CSSProperties, type FormEvent } from "react";
import clsx from "clsx";
import { useLocation, useNavigate, type Location } from "react-router";
import { toast } from "sonner";
import { loginUser, signup } from "../api/authApi";
import { useAuth } from "../auth/useAuth";
import { useFeedState } from "../feed/useFeedState";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useNewestPost } from "../hooks/useFeedData";
import { useLanguage } from "../lang/useLanguage";
import { navigateWithTransition, useGo } from "../navigation/viewTransition";
import type { Post } from "../types/post";
import { getImageUrl } from "../utils/imageUrl";
import { workPhoto, yearOf } from "../utils/motion";
import { Header } from "../components/Header";
import { knownImages } from "../components/postImages";
import { CreditLine, VerticalTitle, type PostRouteState } from "../components/Reel";
import { FormError, TextField } from "../components/TextField";
import "./AuthPage.css";

type AuthMode = "login" | "signup";
type AuthRouteState = { from?: Location };

/**
 * The work log in / sign up is staged around: the post the visitor came from
 * (on its shown photo), else the work on screen in the reel, else the newest
 * work. The screen change keeps the same photograph and colour.
 */
function useStagedWork(from: Location | undefined): { post: Post; image: number } | null {
    const { inView } = useFeedState();
    const fromPost = (from?.state as PostRouteState | null)?.post;
    const fallback = fromPost ?? inView;
    const newest = useNewestPost(null, fallback != null);
    if (fromPost) return { post: fromPost, image: (from?.state as PostRouteState).image ?? 0 };
    if (inView) return { post: inView, image: 0 };
    return newest ? { post: newest, image: 0 } : null;
}

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * Log in and sign up: a slide with the form in its right-hand room. After
 * logging in the visitor goes back where they were headed (PublicOnlyRoute's
 * redirect); a new account is signed in at once.
 */
export function AuthPage({ mode }: { mode: AuthMode }) {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const { login } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const go = useGo();
    const from = (location.state as AuthRouteState | null)?.from;
    const staged = useStagedWork(from);
    const isLogin = mode === "login";

    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState<Partial<Record<"email" | "username" | "password", string>>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        const next: typeof errors = {};
        if (!isLogin && !username.trim()) next.username = t.validation.usernameRequired;
        if (!EMAIL.test(email.trim())) next.email = t.validation.emailInvalid;
        if (isLogin ? password.length === 0 : password.length < 8) {
            next.password = isLogin ? t.validation.passwordRequired : t.validation.passwordTooShort;
        }
        setErrors(next);
        setFormError(null);
        if (Object.keys(next).length > 0) return;

        setPending(true);
        try {
            const response = isLogin
                ? await loginUser({ email: email.trim(), password })
                : await signup({ username: username.trim(), email: email.trim(), password });
            toast(isLogin ? t.toast.welcomeBack : t.toast.welcome, {
                description: isLogin ? t.toast.signedInAs(response.user.username) : t.toast.signedUpAs(response.user.username),
            });
            // Signing in and leaving are one update, so PublicOnlyRoute's own
            // redirect never races this one.
            navigateWithTransition(() => {
                login(response.token, response.user);
                void navigate(from ? `${from.pathname}${from.search}` : "/", { replace: true, state: from?.state });
            });
        } catch (err) {
            setFormError(toApiErrorMessage(err, { fallbackMessage: isLogin ? t.auth.loginFailed : t.auth.signupFailed }));
        } finally {
            setPending(false);
        }
    }

    const work = staged?.post;
    const images = work ? knownImages(work) : [];
    const image = images[Math.min(staged?.image ?? 0, images.length - 1)];
    const caption = work ? work.caption || t.reel.untitled : "";

    return (
        <div className={clsx("page is-door", !work && "is-paper")} style={work?.tint ? ({ "--page": work.tint } as CSSProperties) : undefined}>
            <Header />
            <main className="door">
                {work && <VerticalTitle as="p" caption={caption} year={yearOf(work.created_at)} />}
                {work && image ? (
                    <figure className="door-work">
                        <img src={getImageUrl(image.image_path)} alt={caption} style={workPhoto(work.id)} />
                        <figcaption>
                            <CreditLine post={{ ...work, camera_body: null, lens: null }} />
                        </figcaption>
                    </figure>
                ) : (
                    <div className="door-work" aria-hidden="true" />
                )}
                <form className="auth-form" onSubmit={submit} noValidate>
                    <h1 className="form-title">{isLogin ? t.auth.loginTitle : t.auth.signupTitle}</h1>
                    <p className="form-sub">{isLogin ? t.auth.loginSubtitle : t.auth.signupSubtitle}</p>
                    {formError && <FormError>{formError}</FormError>}
                    {!isLogin && (
                        <TextField label={t.auth.username} value={username} onChange={setUsername} error={errors.username} autoComplete="username" name="username" />
                    )}
                    <TextField label={t.auth.email} type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" name="email" />
                    <TextField
                        label={t.auth.password}
                        type="password"
                        value={password}
                        onChange={setPassword}
                        error={errors.password}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        name="password"
                        hint={isLogin ? undefined : t.auth.passwordHint}
                    />
                    <button type="submit" className="btn is-block" disabled={pending}>
                        {pending ? t.auth.pending : isLogin ? t.auth.loginButton : t.auth.signupButton}
                    </button>
                    <p className="form-alt">
                        {isLogin ? t.auth.noAccount : t.auth.haveAccount}
                        <button type="button" className="textlink" onClick={() => go(isLogin ? "/signup" : "/login", { replace: true, state: location.state })}>
                            {isLogin ? t.auth.signupLink : t.auth.loginLink}
                        </button>
                    </p>
                </form>
            </main>
        </div>
    );
}
