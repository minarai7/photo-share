import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { findGearLinks } from "../api/aiApi";
import { useAuth } from "../auth/AuthContext";
import type { GearKind, GearLinkResponse } from "../types/ai";
import { createPortal } from "react-dom";
import { useLanguage } from "../lang/LanguageContext";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

type GearLinkActionProps = {
    kind: GearKind;
    name: string;
}

export function GearLinkAction({kind, name}: GearLinkActionProps) {
    const { t } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<GearLinkResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const trimmedName = name.trim();

    if (!trimmedName) {
        return <>{t.posts.notSpecified}</>;
    }

    function getConfidenceLabel(confidence: string): string {
        switch (confidence) {
            case "high":
                return t.aiGear.confidenceHigh;
            
            case "medium":
                return t.aiGear.confidenceMedium;
            
            case "low":
                return t.aiGear.confidenceLow;
            
            default:
                return t.aiGear.confidenceUnknown;
        }
    }

    async function handleFindProduct() {
        if (!isAuthenticated) {
            navigate("/login", {
                replace: true,
                state: { from: location },
            });
            return
        }

        try {
            setIsLoading(true);
            setError(null);
            setResult(null);

            const data = await findGearLinks({
                kind: kind, 
                name: trimmedName
            });

            setResult(data);
            setIsModalOpen(true);
        } catch (error) {
            setError(
                toApiErrorMessage(error, {
                    fallbackMessage: t.aiGear.findFailed,
                })
            )
            setIsModalOpen(true);
        } finally {
            setIsLoading(false);
        }
    }

    function closeModal() {
        setIsModalOpen(false);
    }

    return (
        <>
            <span className="gear-link-name">{trimmedName}</span>{" "}
            <button
                type="button"
                className="text-button gear-link-button"
                onClick={handleFindProduct}
                disabled={isLoading || isModalOpen}
            >
                {isLoading ? t.aiGear.finding : t.aiGear.findProduct}
            </button>

            {isModalOpen && createPortal(
                <div className="gear-link-modal-backdrop">
                    <div className="gear-link-modal" role="dialog" aria-modal="true">
                        <div className="gear-link-modal-header">
                            <p className="gear-link-modal-kicker">
                                {t.aiGear.modalKicker}
                            </p>
                            <h2>
                                {result ? result.name : t.aiGear.productSuggestions}
                            </h2>
                        </div>

                        {error && <div className="form-error">{error}</div>}

                        {result && (
                            <div className="gear-link-modal-body">
                                <p className="gear-link-summary">{result.summary}</p>

                                {result.suggestions.length === 0 ? (
                                    <p className="gear-link-empty">
                                        {t.aiGear.noReliableLinks}
                                    </p>
                                ): (
                                    <ul className="gear-link-suggestions">
                                        {result.suggestions.map((suggestion) => (
                                            <li
                                                key={`${suggestion.title}-${suggestion.url}`}
                                                className="gear-link-suggestion"
                                            >
                                                <div className="gear-link-suggestion-header">
                                                    <a
                                                        href={suggestion.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {suggestion.title}
                                                    </a>

                                                    <span className="gear-link-confidence">
                                                        {t.aiGear.confidence}:{" "}
                                                        {getConfidenceLabel(suggestion.confidence)}
                                                    </span>
                                                </div>

                                                <p>{suggestion.reason}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <button
                                    type="button"
                                    className="text-button"
                                    onClick={closeModal}
                                >
                                    {t.common.close}
                                </button>

                                <p className="gear-link-warning">
                                    {t.aiGear.warning}
                                </p>
                            </div>
                        )}

                        {!result && (
                            <button
                                type="button"
                                className="text-button"
                                onClick={closeModal}
                            >
                                {t.common.close}
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}