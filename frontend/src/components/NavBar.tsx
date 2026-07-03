import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../lang/LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function NavBar() {
    const { t } = useLanguage();
    const { user, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate("/login");
    }

    return (
        <header className="navbar">
            <Link to="/" className="navbar-logo">
                {t.app.title}
            </Link>
            
            <nav className="navbar-links">
                <NavLink to="/" className="nav-link">
                    {t.nav.feed}
                </NavLink>

                {isAuthenticated && (
                    <NavLink  to="/posts/new" className="nav-link">
                        {t.nav.createPost}
                    </NavLink>
                )}

                {isAuthenticated && (
                    <NavLink to={`/users/${user!.id}`} className="nav-link">
                        {t.nav.profile(user!.username)}
                    </NavLink>
                )}

                {!isAuthenticated && (
                    <NavLink to="/login" className="nav-link">
                        {t.nav.login}
                    </NavLink>
                )}

                {!isAuthenticated && (
                    <NavLink to="/signup" className="nav-link">
                        {t.nav.signup}
                    </NavLink>
                )}

                {isAuthenticated && (
                    <button type="button" className="logout-button" onClick={handleLogout}>
                        {t.nav.logout}
                    </button>
                )}

                <LanguageSwitcher />
            </nav>
        </header>
    )
}