import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    const from = location.state?.from?.pathname ?? "/";

    if (isAuthenticated) {
        return <Navigate to={from} replace />
    }

    return <>{children}</>
}
