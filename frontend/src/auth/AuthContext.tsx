import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { UserResponse } from "../types/auth";
import {
    AUTH_CHANGED_EVENT,
    clearAuth,
    getStoredUser,
    getToken,
    saveAuth,
    isTokenExpired,
} from "./authStorage";
import { DEFAULT_LANGUAGE, useLanguage } from "../lang/useLanguage";
import { AuthContext, type AuthContextValue } from "./useAuth";

export function AuthProvider({ children }: {children: ReactNode}) {
    const { setLanguage } = useLanguage();
    const [token, setToken] = useState<string | null>(getToken());
    const [user, setUser] = useState<UserResponse | null>(getStoredUser());

    const refreshAuthState = useCallback(() => {
        setToken(getToken());
        setUser(getStoredUser());
    }, []);

    const login = useCallback((token: string, user: UserResponse) => {
        saveAuth(token, user);
        setToken(token);
        setUser(user);
        setLanguage(user.preferred_language);
    }, [setLanguage]);

    const logout = useCallback(() => {
        clearAuth();
        setToken(null);
        setUser(null);
        setLanguage(DEFAULT_LANGUAGE);
    }, [setLanguage]);

    useEffect(() => {
        window.addEventListener(AUTH_CHANGED_EVENT, refreshAuthState);

        return () => {
            window.removeEventListener(AUTH_CHANGED_EVENT, refreshAuthState);
        }
    }, [refreshAuthState])

    const value = useMemo<AuthContextValue>(() => {
        return {
            token,
            user,
            isAuthenticated: token !== null && user !== null && !isTokenExpired(token),
            login,
            logout,
            refreshAuthState,
        }
    }, [token, user, login, logout, refreshAuthState]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
