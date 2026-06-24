import type { LanguageCode } from "../lang";

export function getLocaleFromLanguage(language: LanguageCode): string {
    switch (language) {
        case "ja":
            return "ja-JP"
        
        case "en":
            return "en-US"
        
        default:
            return "en-US"
    }
}