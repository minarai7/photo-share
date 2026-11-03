import { createContext, useContext } from "react";
import type { UserResponse } from "../types/auth";

// Context object and hook live here (not in AuthContext.tsx) so that file
// only exports a component, which React Fast Refresh requires.

export type AuthContextValue = {
    token: string | null;
    user: UserResponse | null;
    isAuthenticated: boolean;
    login: (token: string, user: UserResponse) => void;
    logout: () => void;
    refreshAuthState: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);

    if (context === null) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}
