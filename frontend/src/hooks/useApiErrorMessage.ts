import { useCallback } from "react";
import { ApiError } from "../api/apiError";
import { getApiErrorMessage } from "../api/getApiErrorMessage";
import { useLanguage } from "../lang/LanguageContext";

type Options = {
    fallbackMessage?: string;
    shouldLog?: boolean;
};

export function useApiErrorMessage() {
    const { t } = useLanguage();

    return useCallback(
        function toApiErrorMessage(
            error: unknown,
            options: Options = {}
        ): string {
            const shouldLog = options.shouldLog ?? true;

            if (shouldLog) {
                console.error(error);
            }

            if (error instanceof ApiError) {
                const translatedMessage = getApiErrorMessage(error.code, t);

                return translatedMessage ?? options.fallbackMessage ?? t.apiErrors.unknown;
            }

            return options.fallbackMessage ?? t.apiErrors.unknown
        },
        [t]
    );
}