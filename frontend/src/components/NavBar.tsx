import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

export function NavBar() {
    const { user, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate("/login");
    }

    return (
        <header className="navbar">
            <Link to="/" className="navbar-logo">
                Photo Share
            </Link>
            
            <nav className="navbar-links">
                <NavLink to="/" className="nav-link">
                    Feed
                </NavLink>

                {isAuthenticated && (
                    <NavLink  to="/posts/new" className="nav-link">
                        Create Post
                    </NavLink>
                )}

                {isAuthenticated && (
                    <NavLink to={`/users/${user!.id}`} className="nav-link">
                        {`${user!.username}'s Profile`}
                    </NavLink>
                )}

                {!isAuthenticated && (
                    <NavLink to="/login" className="nav-link">
                        Login
                    </NavLink>
                )}

                {!isAuthenticated && (
                    <NavLink to="/signup" className="nav-link">
                        Sign up
                    </NavLink>
                )}

                {isAuthenticated && (
                    <button type="button" className="logout-button" onClick={handleLogout}>
                        Logout
                    </button>
                )}
            </nav>
        </header>
    )
}