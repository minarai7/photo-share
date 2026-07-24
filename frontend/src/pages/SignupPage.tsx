import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { signup } from "../api/authApi";
import { FormField } from "../components/FormField";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useLanguage } from "../lang/LanguageContext";

export function SignupPage() {
  const { t } = useLanguage();
  const toApiErrorMessage = useApiErrorMessage();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        navigate("/login");
      }, 800);
    } catch (err) {
      setError(
        toApiErrorMessage(err, {
          fallbackMessage: t.auth.signupFailed,
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="form-page">
      <section className="form-card">
        <h1>{t.auth.signupTitle}</h1>

        {error && <div className="form-error">{error}</div>}

        {successMessage && (
          <div className="form-success">{successMessage}</div>
        )}

        <form onSubmit={handleSubmit}>
          <FormField
            id="username"
            label={t.auth.username}
            type="text"
            value={username}
            setValue={setUsername}
            autoComplete="username"
            placeholder={t.auth.usernamePlaceholder}
          />

          <FormField
            id="email"
            label={t.auth.email}
            type="email"
            value={email}
            setValue={setEmail}
            autoComplete="email"
            placeholder={t.auth.emailPlaceholder}
          />

          <FormField
            id="password"
            label={t.auth.password}
            type="password"
            value={password}
            setValue={setPassword}
            autoComplete="new-password"
            placeholder={t.auth.passwordPlaceholder}
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
  );
}