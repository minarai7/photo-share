import { useLanguage } from "../lang/useLanguage";
import { Count } from "./Count";
import "./Pager.css";

/** Hairline chevrons around a rolling count, for a series of 2+. */
export function Pager({ shown, total, show }: { shown: number; total: number; show: (i: number) => void }) {
    const { t } = useLanguage();
    if (total < 2) return null;
    return (
        <div className="pager">
            <button type="button" className="chev is-prev" onClick={() => show(shown - 1)} disabled={shown === 0} aria-label={t.post.previousPhoto} />
            <Count value={shown + 1} total={total} className="pager-count" label={t.post.photoPosition(shown + 1, total)} />
            <button type="button" className="chev is-next" onClick={() => show(shown + 1)} disabled={shown === total - 1} aria-label={t.post.nextPhoto} />
        </div>
    );
}
