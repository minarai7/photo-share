import clsx from "clsx";
import { toast } from "sonner";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { updatePreferredLanguage } from "../api/userSettingsApi";
import { rememberLanguage } from "../auth/authStorage";
import { useAuth } from "../auth/useAuth";
import type { LanguageCode } from "../lang";
import { useLanguage } from "../lang/useLanguage";

/**
 * JA / EN in the heroes (Japanese first, the default). The language switches at once; for a member it is
 * also saved (PUT /users/me/settings/language) and re-applied on login. If
 * saving fails, the previous language comes back and a toast says so.
 */
export function LangToggle({ light = false }: { light?: boolean }) {
    const { language, setLanguage, t } = useLanguage();
    const { isAuthenticated } = useAuth();

    async function choose(next: LanguageCode) {
        const previous = language;
        if (next === previous) return;
        setLanguage(next);
        if (!isAuthenticated) return;
        try {
            await updatePreferredLanguage({ preferred_language: next });
            rememberLanguage(next);
        } catch (err) {
            console.error(err);
            setLanguage(previous);
            toast(t.settings.languageSaveFailed);
        }
    }

    return (
        <ToggleGroup
            className={clsx("lang", light && "is-light")}
            value={[language]}
            onValueChange={(v) => v[0] && void choose(v[0] as LanguageCode)}
            aria-label={t.settings.language}
        >
            <Toggle value="ja" className="lang-item" aria-label={t.settings.japanese} lang="ja">
                JA
            </Toggle>
            <Toggle value="en" className="lang-item" aria-label={t.settings.english} lang="en">
                EN
            </Toggle>
        </ToggleGroup>
    );
}
