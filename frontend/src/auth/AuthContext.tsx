import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { User } from "../types/auth";
import {
    AUTH_CHANGED_EVENT,
    clearAuth,
    getStoredUser,
    getToken,
    saveAuth,
    isTokenExpired,
} from "./authStorage";

type AuthContextValue = {
    token: string | null;
    user: User | null;
    isAuthenticated: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    refreshAuthState: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: {children: ReactNode}) {
    const [token, setToken] = useState<string | null>(getToken());
    const [user, setUser] = useState<User | null>(getStoredUser());

    function refreshAuthState() {
        setToken(getToken());
        setUser(getStoredUser());
    }

    function login(token: string, user: User) {
        saveAuth(token, user);
        setToken(token);
        setUser(user);
    }

    function logout() {
        clearAuth();
        setToken(null);
        setUser(null);
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
