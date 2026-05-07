import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { findGearLinks } from "../api/aiApi";
import { useAuth } from "../auth/AuthContext";
import type { GearKind, GearLinkResponse } from "../types/ai";
import { createPortal } from "react-dom";

type GearLinkActionProps = {
    kind: GearKind;
    name: string;
}

export function GearLinkAction({kind, name}: GearLinkActionProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<GearLinkResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const trimmedName = name.trim();

    if (!trimmedName) {
        return "Not specified";
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
                error instanceof Error
                ? error.message
                : "Could not find product links. Please try again."
            );
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
                {isLoading ? "Finding..." : "Find product"}
            </button>

            {isModalOpen && createPortal(
                <div className="gear-link-modal-backdrop">
                    <div className="gear-link-modal" role="dialog" aria-modal="true">
                        <div className="gear-link-modal-header">
                            <p className="gear-link-modal-kicker">
                                AI gear search
                            </p>
                            <h2>
                                {result ? result.name : "Product suggestions"}
                            </h2>
                        </div>

                        {error && <div className="form-error">{error}</div>}

                        {result && (
                            <div className="gear-link-modal-body">
                                <p className="gear-link-summary">{result.summary}</p>

                                {result.suggestions.length === 0 ? (
                                    <p className="gear-link-empty">
                                        No reliable product links were found.
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
                                                        {`Confidence: ${suggestion.confidence}`}
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
                                    Close
                                </button>

                                <p className="gear-link-warning">
                                    AI suggestions may be imperfect. Please confirm the product page before buying.
                                </p>
                            </div>
                        )}

                        {!result && (
                            <button
                                type="button"
                                className="text-button"
                                onClick={closeModal}
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}