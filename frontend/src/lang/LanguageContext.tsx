import { useMemo, useState, type ReactNode } from "react";
import type { LanguageCode } from "../types/lang"
import { translations } from ".";
import { DEFAULT_LANGUAGE, LanguageContext, type LanguageContextValue } from "./useLanguage";

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
