import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LanguageCode, TranslationDictionary } from "../types/lang"
import { translations } from ".";

type LanguageContextValue = {
    language: LanguageCode;
    setLanguage: (language: LanguageCode) => void;
    t: TranslationDictionary;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export const DEFAULT_LANGUAGE = "en";

type LanguageProviderProps = {
    children: ReactNode;
    initialLanguage?: LanguageCode;
};

export function LanguageProvider({
    children,
    initialLanguage = DEFAULT_LANGUAGE,
}: LanguageProviderProps) {
    const [language, setLanguage] = useState<LanguageCode>(initialLanguage);

    const t = translations[language];

    const value = useMemo<LanguageContextValue>(() => ({
        language,
        setLanguage,
        t,
    }),[language, t]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);

    if (context === null) {
        throw new Error("useLanguage must be used inside LanguageProvider");
    }

    return context;
}