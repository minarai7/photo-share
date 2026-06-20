import { ApiError } from "../api/apiError";
import { getApiErrorMessage } from "../api/getApiErrorMessage";
import { useLanguage } from "../lang/LanguageContext";

type Options = {
    fallbackMessage?: string;
    shouldLog?: boolean;
};

export function useApiErrorMessage() {
    const { t } = useLanguage();

    return function toApiErrorMessage(
        error: unknown,
        options: Options = {}
    ): string {
        const shouldLog = options.shouldLog ?? true;

        if (shouldLog) {
            console.error(error);
        }

        if (error instanceof ApiError) {
            return getApiErrorMessage(error.code, t)
        }

        return options.fallbackMessage ?? t.apiErrors.unknown
    };
}