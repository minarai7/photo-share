import type { ReactNode } from "react";
import { Navigate, useLocation, type Location } from "react-router";
import { useAuth } from "../auth/useAuth";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    const from = (location.state as { from?: Location } | null)?.from;

    if (isAuthenticated) {
        return <Navigate to={from ? `${from.pathname}${from.search}` : "/"} replace state={from?.state} />
    }

    return <>{children}</>
}
