import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LanguageCode, TranslationDictionary } from "./types"
import { translations } from ".";

type LanguageContextValue = {
    language: LanguageCode;
    setLanguage: (language: LanguageCode) => void;
    t: TranslationDictionary;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

type LanguageProviderProps = {
    children: ReactNode;
    initialLanguage?: LanguageCode;
};

export function LanguageProvider({
    children,
    initialLanguage = "en",
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