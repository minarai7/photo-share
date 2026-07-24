import { useState } from "react";
import { updatePreferredLanguage } from "../api/userSettingsApi";
import { useAuth } from "../auth/AuthContext";
import type { LanguageCode } from "../lang";
import { useLanguage } from "../lang/LanguageContext";

const OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "JA" },
];

export function LanguageSwitcher() {
  const { isAuthenticated } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(nextLanguage: LanguageCode) {
    const previousLanguage = language;

    if (nextLanguage === previousLanguage) {
      return;
    }

    setError(null);
    setLanguage(nextLanguage);

    if (!isAuthenticated) {
      return;
    }

    try {
      setIsSaving(true);
      await updatePreferredLanguage({
        preferred_language: nextLanguage,
      });
    } catch {
      setLanguage(previousLanguage);
      setError(t.settings.languageSaveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="language-switcher">
      <div className="language-toggle" role="group" aria-label={t.settings.language}>
        {OPTIONS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className={`language-toggle-btn${language === code ? " active" : ""}`}
            onClick={() => handleSelect(code)}
            disabled={isSaving}
            aria-pressed={language === code}
          >
            {label}
          </button>
        ))}
      </div>

      {isSaving && <span>{t.settings.savingLanguage}</span>}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}