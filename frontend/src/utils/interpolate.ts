import { Fragment, createElement, type ReactNode } from "react";

/**
 * Fills a translated sentence with elements instead of strings, e.g.
 * interpolate(t.reel.endBy, <JaText text={name} />), so a name keeps its own
 * type inside the sentence. The translation stays a plain function of
 * strings; it is called with placeholders that are then swapped back.
 */
export function interpolate(format: (...args: string[]) => string, ...values: ReactNode[]): ReactNode {
    const text = format(...values.map((_, i) => `${i}`));
    const parts = text.split(/(\d+)/);
    return createElement(Fragment, null, ...parts.map((part, i) => (i % 2 === 1 ? values[Number(part)] : part)));
}
