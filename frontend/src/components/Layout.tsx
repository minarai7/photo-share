import { Outlet } from "react-router";
import { NavBar } from "./navbar";

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