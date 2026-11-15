import clsx from "clsx";
import NumberFlow from "@number-flow/react";

/**
 * Rolling digits (NumberFlow), tabular: "2 / 3", or "03 / 10" with `pad`.
 * Rotate the whole element when it is vertical, never writing-mode.
 */
export function Count({ value, total, pad = false, label, className }: { value: number; total: number; pad?: boolean; label: string; className?: string }) {
    return (
        <span className={clsx("count", className)} role="status" aria-label={label}>
            <span className="count-now" aria-hidden="true">
                <NumberFlow value={value} format={pad ? { minimumIntegerDigits: 2 } : undefined} />
            </span>
            <span className="count-sep" aria-hidden="true">/</span>
            <span className="count-total" aria-hidden="true">{pad ? String(total).padStart(2, "0") : total}</span>
        </span>
    );
}
