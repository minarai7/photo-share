import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { loginUser } from "../api/authApi";
import { useAuth } from "../auth/AuthContext";
import { FormField } from "../components/FormField";

export function LoginPage() {
  const navigate = useNavigate();

  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", {replace: true});
    }
  }, [isAuthenticated, navigate]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    try {
      setIsSubmitting(true);
       
      const response = await loginUser({
        email: email.trim(),
        password,
      })

      login(response.token, response.user);

      navigate("/", { replace: true});
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
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
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="auth-link">
          Do not have an account? <Link to="/signup">Create one</Link>
        </p>
      </section>
    </main>
  )
}