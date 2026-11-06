import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router";
import App from "../App";
import { AuthProvider } from "../auth/AuthContext";
import { LanguageProvider } from "../lang/LanguageContext";
import type { LanguageCode } from "../lang";

/** Exposes the current location (for asserting redirects) and navigate(). */
function RouterProbe({ onNavigate }: { onNavigate: (n: NavigateFunction) => void }) {
  const location = useLocation();
  onNavigate(useNavigate());
  return <output data-testid="location">{location.pathname}</output>;
}

type InitialEntry = string | { pathname: string; state?: unknown };

/**
 * Renders the real <App /> with the same provider order as main.tsx
 * (LanguageProvider > Router > AuthProvider), at the given route.
 * Seed a session with seedSession() *before* calling this.
 */
export function renderApp(route: InitialEntry = "/", { language = "en" as LanguageCode } = {}) {
  const user = userEvent.setup();
  let navigateFn: NavigateFunction | undefined;
  const utils = render(
    <LanguageProvider initialLanguage={language}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <App />
          <RouterProbe onNavigate={(n) => (navigateFn = n)} />
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>,
  );
  return {
    user,
    ...utils,
    currentPath: () => utils.getByTestId("location").textContent,
    /** Client-side navigation, like clicking a <Link>; a number moves through history (-1 = Back). */
    navigate: (to: string | number) =>
      act(() => void (typeof to === "number" ? navigateFn!(to) : navigateFn!(to))),
  };
}
