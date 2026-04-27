import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { AUTH_CHANGED_EVENT, clearAuth, getStoredUser, getToken } from "../utils/authStorage";
import type { AuthUser } from "../types/auth";

export function NavBar() {
    const navigate = useNavigate();

    const [token, setToken] = useState<string | null>(() => getToken());
    const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
    
    useEffect(() => {
        function refreshAuthState() {
            setToken(getToken());
            setUser(getStoredUser());
        }

        window.addEventListener(AUTH_CHANGED_EVENT, refreshAuthState);

        return () => {
            window.removeEventListener(AUTH_CHANGED_EVENT, refreshAuthState);
        }
    }, []);

    function handleLogout() {
        clearAuth();
        navigate("/login");
    }

    const isLoggedIn = (token !== null && user !== null);

    return (
        <header className="navbar">
            <Link to="/" className="navbar-logo">
                Photo Share
            </Link>
            
            <nav className="navbar-links">
                <NavLink to="/" className="nav-link">
                    Feed
                </NavLink>

                {isLoggedIn && (
                    <NavLink  to="/posts/new" className="nav-link">
                        Create Post
                    </NavLink>
                )}

                {isLoggedIn && (
                    <NavLink to={`/users/${user.id}`} className="nav-link">
                        {`${user.username}'s Profile`}
                    </NavLink>
                )}

                {!isLoggedIn && (
                    <NavLink to="/login" className="nav-link">
                        Login
                    </NavLink>
                )}

                {!isLoggedIn && (
                    <NavLink to="/signup" className="nav-link">
                        Sign up
                    </NavLink>
                )}

                {isLoggedIn && (
                    <button type="button" className="logout-button" onClick={handleLogout}>
                        Logout
                    </button>
                )}
            </nav>
        </header>
    )
}