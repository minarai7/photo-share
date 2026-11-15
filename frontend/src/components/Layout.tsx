import { Outlet } from "react-router";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { FeedStateProvider } from "../feed/FeedStateProvider";
import { useSettleViewTransition } from "../navigation/viewTransition";
import "./forms.css";

/**
 * Every route renders inside this: the feed state above the routes (so a
 * reel survives a visit to a post), reduced-motion-aware motion, the toasts,
 * and the end of each screen change.
 */
export function Layout() {
    useSettleViewTransition();
    return (
        <FeedStateProvider>
            <MotionConfig reducedMotion="user">
                <Outlet />
                <Toaster
                    position="top-center"
                    offset={24}
                    toastOptions={{ unstyled: true, classNames: { toast: "toast", title: "toast-title", description: "toast-desc" } }}
                />
            </MotionConfig>
        </FeedStateProvider>
    );
}
