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

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function useLanguage() {
    const context = useContext(LanguageContext);

    if (context === null) {
        throw new Error("useLanguage must be used inside LanguageProvider");
    }

    return context;
}
