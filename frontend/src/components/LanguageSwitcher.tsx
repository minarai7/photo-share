import { useState } from "react";
import { updatePreferredLanguage } from "../api/userSettingsApi";
import { useAuth } from "../auth/AuthContext";
import type { LanguageCode } from "../lang";
import { useLanguage } from "../lang/LanguageContext";

export function LanguageSwitcher() {
  const { isAuthenticated } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLanguageChange(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    const nextLanguage = event.target.value as LanguageCode;
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
      <label htmlFor="language-select">{t.settings.language}: </label>

      <select
        id="language-select"
        value={language}
        onChange={handleLanguageChange}
        disabled={isSaving}
      >
        <option value="en">{t.settings.english}</option>
        <option value="ja">{t.settings.japanese}</option>
      </select>

      {isSaving && <span>{t.settings.savingLanguage}</span>}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}