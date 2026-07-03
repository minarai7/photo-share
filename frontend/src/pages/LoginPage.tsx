import { useState, type SubmitEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { loginUser } from "../api/authApi";
import { useAuth } from "../auth/AuthContext";
import { FormField } from "../components/FormField";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useLanguage } from "../lang/LanguageContext";

export function LoginPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const toApiErrorMessage = useApiErrorMessage();

  const from = location.state?.from?.pathname ?? "/";

  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (!email.trim()) {
      setError(t.validation.emailRequired);
      return;
    }

    if (!password) {
      setError(t.validation.passwordRequired);
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await loginUser({
        email: email.trim(),
        password,
      });

      login(response.token, response.user);

      navigate(from, { replace: true });
    } catch (error) {
      setError(
        toApiErrorMessage(error, {
          fallbackMessage: t.auth.loginFailed,
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="form-page">
      <section className="form-card">
        <h1>{t.auth.loginTitle}</h1>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <FormField
            id="email"
            label={t.auth.email}
            type="email"
            value={email}
            setValue={setEmail}
            autoComplete="email"
          />

          <FormField
            id="password"
            label={t.auth.password}
            type="password"
            value={password}
            setValue={setPassword}
            autoComplete="current-password"
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t.auth.loggingIn : t.auth.loginButton}
          </button>
        </form>

        <p className="form-link">
          <Link to="/signup">{t.auth.dontHaveAccountSignup}</Link>
        </p>
      </section>
    </main>
  );
}