import { act } from "@testing-library/react";

// A controllable IntersectionObserver for jsdom: nothing intersects until a
// test calls showInView(element), which tells every observer watching it
// (the reel's "work on screen", the Index's page-in sentinel) that it crossed
// into view.

const observers = new Set<FakeIntersectionObserver>();

export class FakeIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [0];
    private targets = new Set<Element>();
    private callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.add(this);
    }
    observe(el: Element) {
        this.targets.add(el);
    }
    unobserve(el: Element) {
        this.targets.delete(el);
    }
    disconnect() {
        this.targets.clear();
        observers.delete(this);
    }
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
    fire(el: Element) {
        if (!this.targets.has(el)) return;
        const rect = el.getBoundingClientRect();
        const entry = { target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: null, time: 0 };
        this.callback([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
}

/** Reports `el` as on screen to every observer watching it. */
export function showInView(el: Element) {
    act(() => {
        observers.forEach((o) => o.fire(el));
    });
}

export function resetIntersections() {
    observers.clear();
}
