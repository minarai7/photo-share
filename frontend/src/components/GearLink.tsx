import { useState } from "react";
import { useLocation } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import { findGearLinks } from "../api/aiApi";
import { useAuth } from "../auth/useAuth";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { useLanguage } from "../lang/useLanguage";
import { useGo } from "../navigation/viewTransition";
import type { GearKind, GearLinkResponse } from "../types/ai";
import { JaText } from "./JaText";
import "./forms.css";

/**
 * "Find" after a camera or lens: asks POST /ai/gear-link for product pages
 * and shows them in a dialog. A visitor is sent to log in first.
 */
export function GearLink({ kind, name, className }: { kind: GearKind; name: string; className?: string }) {
    const { t, language } = useLanguage();
    const toApiErrorMessage = useApiErrorMessage();
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const go = useGo();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GearLinkResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function find() {
        if (!isAuthenticated) {
            go("/login", { state: { from: location } });
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            setResult(await findGearLinks({ kind, name: name.trim(), language }));
        } catch (err) {
            setError(toApiErrorMessage(err, { fallbackMessage: t.gear.findFailed }));
        } finally {
            setLoading(false);
            setOpen(true);
        }
    }

    const confidence = (c: string) =>
        c === "high" ? t.gear.confidenceHigh : c === "medium" ? t.gear.confidenceMedium : t.gear.confidenceLow;

    return (
        <>
            <button type="button" className={className} onClick={find} disabled={loading} aria-label={t.gear.findLabel(name)}>
                {loading ? t.gear.finding : t.gear.find}
            </button>
            <Dialog.Root open={open} onOpenChange={setOpen}>
                <Dialog.Portal>
                    <Dialog.Backdrop className="dialog-backdrop" />
                    <Dialog.Popup className="dialog">
                        <p className="dialog-kicker">{t.gear.kicker}</p>
                        <Dialog.Title className="dialog-title"><JaText text={result?.name ?? name} /></Dialog.Title>
                        {error && <p className="form-error" role="alert">{error}</p>}
                        {result && (
                            <>
                                <Dialog.Description className="dialog-desc">{result.summary}</Dialog.Description>
                                {result.suggestions.length === 0 ? (
                                    <p className="gl-note">{t.gear.noReliableLinks}</p>
                                ) : (
                                    <ul className="gl-list">
                                        {result.suggestions.map((s) => (
                                            <li key={`${s.title}-${s.url}`} className="gl-item">
                                                <a href={s.url} target="_blank" rel="noreferrer" className="gl-link">{s.title}</a>
                                                <span className="gl-confidence">{confidence(s.confidence)}</span>
                                                <p className="gl-reason">{s.reason}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className="gl-note">{t.gear.note}</p>
                            </>
                        )}
                        <div className="dialog-actions">
                            <Dialog.Close className="dialog-link">{t.gear.close}</Dialog.Close>
                        </div>
                    </Dialog.Popup>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
