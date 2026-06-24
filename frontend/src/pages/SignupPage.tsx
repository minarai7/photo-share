import { type SubmitEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { signup } from "../api/authApi";
import { FormField } from "../components/FormField";
import { useLanguage } from "../lang/LanguageContext";


export function SignupPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        setError(null);
        setSuccessMessage(null);

        if (!username.trim()) {
            setError(t.validation.usernameRequired);
            return;
        } 
        if (!email.trim()) {
            setError(t.validation.emailRequired);
            return;
        }
        if (!password) {
            setError(t.validation.passwordRequired);
            return;
        }

        if (password.length < 8) {
            setError(t.validation.passwordTooShort);
            return;
        }

        try {
            setIsSubmitting(true);

            await signup({
                username: username.trim(),
                email: email.trim(),
                password,
            });

            setSuccessMessage(t.auth.signupSuccess);

            setTimeout(() => {
                navigate("/login")
            }, 800)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(t.auth.signupFailed);
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="form-page">
            <section className="form-card">
                <h1>Signup</h1>
                
                {error && <div className="form-error">{error}</div>}

                {successMessage && (
                    <div className="form-success">{successMessage}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <FormField
                        id="username"
                        label="Username"
                        type="text"
                        value={username}
                        setValue={setUsername}
                        autoComplete="username"
                    />

                    <FormField
                        id="email"
                        label="Email"
                        type="email"
                        value={email}
                        setValue={setEmail}
                        autoComplete="email"
                    />

                    <FormField
                        id="password"
                        label="Password"
                        type="password"
                        value={password}
                        setValue={setPassword}
                        autoComplete="new-password"
                    />

                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? t.auth.creatingAccount : t.auth.signupButton}
                    </button>
                </form>

                <p className="form-link">
                    <Link to="/login">{t.auth.alreadyHaveAccountLogin}</Link>
                </p>
            </section>
        </main>
    )
}