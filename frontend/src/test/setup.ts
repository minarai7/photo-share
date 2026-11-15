import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { FakeIntersectionObserver, resetIntersections } from "./intersection";

// NumberFlow's custom element can't animate in jsdom; render the digits plainly.
vi.mock("@number-flow/react", () => ({
  default: ({ value, format }: { value: number; format?: Intl.NumberFormatOptions }) => new Intl.NumberFormat("en", format).format(value),
}));

// jsdom lacks the browser APIs the reels and dialogs use. These stubs make
// them inert: nothing scrolls, nothing intersects until a test says so (see
// ./intersection.ts), and screen changes are instant (no
// document.startViewTransition, as in a browser without the API).

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

Object.assign(window, { IntersectionObserver: FakeIntersectionObserver });
if (!("ResizeObserver" in window)) {
  Object.assign(window, { ResizeObserver: NoopObserver });
}
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
Element.prototype.scrollTo ??= function scrollTo() {};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetIntersections();
});
