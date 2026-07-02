import type { LanguageCode } from "../lang";

export type PreferredLanguage = LanguageCode;

export type UpdatePreferredLanguageRequest = {
  preferred_language: PreferredLanguage;
};
