import { type SubmitEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { signup } from "../api/authApi";


export function SignupPage() {
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
            setError("Username is required.");
            return;
        } 
        if (!email.trim()) {
            setError("Email is required.");
            return;
        }
        if (!password) {
            setError("Password is required.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        try {
            setIsSubmitting(true);

            await signup({
                username: username.trim(),
                email: email.trim(),
                password,
            });

            setSuccessMessage("Account created successfully.");

            setTimeout(() => {
                navigate("/login")
            }, 800)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("Signup failed.");
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                {error && <div className="form-error">{error}</div>}

                {successMessage && (
                    <div className="form-success">{successMessage}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-field">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                        />
                    </div>

                    <div className="form-field">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Creating account..." : "Sign up"}
                    </button>
                </form>

                <p>
                    Already have an account? <Link to="/login">Log in</Link>
                </p>
            </section>
        </main>
    )
}