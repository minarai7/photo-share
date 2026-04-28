import { Outlet } from "react-router";
import { NavBar } from "./NavBar";

export function Layout() {
    return (
        <div className="app-shell">
            <NavBar />

            <main className="page-container">
                <Outlet />
            </main>
        </div>
    )
}