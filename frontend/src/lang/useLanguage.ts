import { createContext, useContext } from "react";
import type { LanguageCode, TranslationDictionary } from "../types/lang";

// Context object and hook live here (not in LanguageContext.tsx) so that file
// only exports a component, which React Fast Refresh requires.

export type LanguageContextValue = {
    language: LanguageCode;
    setLanguage: (language: LanguageCode) => void;
    t: TranslationDictionary;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Japanese first (the owner's choice, 2026-11-16): visitors and logged-out sessions start here. */
export const DEFAULT_LANGUAGE: LanguageCode = "ja";

export function useLanguage() {
    const context = useContext(LanguageContext);

    if (context === null) {
        throw new Error("useLanguage must be used inside LanguageProvider");
    }

    return context;
}
