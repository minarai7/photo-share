import {
    createContext,
    useContext,
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
import { DEFAULT_LANGUAGE, useLanguage } from "../lang/LanguageContext";

type AuthContextValue = {
    token: string | null;
    user: UserResponse | null;
    isAuthenticated: boolean;
    login: (token: string, user: UserResponse) => void;
    logout: () => void;
    refreshAuthState: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: {children: ReactNode}) {
    const { setLanguage } = useLanguage();
    const [token, setToken] = useState<string | null>(getToken());
    const [user, setUser] = useState<UserResponse | null>(getStoredUser());

    function refreshAuthState() {
        setToken(getToken());
        setUser(getStoredUser());
    }

    function login(token: string, user: UserResponse) {
        saveAuth(token, user);
        setToken(token);
        setUser(user);
        setLanguage(user.preferred_language);
    }

    function logout() {
        clearAuth();
        setToken(null);
        setUser(null);
        setLanguage(DEFAULT_LANGUAGE);
    }

    useEffect(() => {
        window.addEventListener(AUTH_CHANGED_EVENT, refreshAuthState);

        return () => {
            window.removeEventListener(AUTH_CHANGED_EVENT, refreshAuthState);
        }
    }, [])

    const value = useMemo<AuthContextValue>(() => {
        return {
            token,
            user,
            isAuthenticated: token !== null && user !== null && !isTokenExpired(token),
            login,
            logout,
            refreshAuthState,
        }
    }, [token, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (context === null) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}
