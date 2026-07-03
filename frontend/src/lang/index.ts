import { en } from "./en";
import { ja } from "./ja";
import type { LanguageCode, TranslationDictionary } from "../types/lang";

export const defaultLanguage: LanguageCode = "en";

export const translations: Record<LanguageCode, TranslationDictionary> = {
    en,
    ja,
};

export type { LanguageCode, TranslationDictionary };
export { en, ja };