// Combined — the chosen direction. Round 1 paired Immersive (feed, post,
// profile) with Exhibition (log in, sign up, new post); round 5 found the
// switch between the two too abrupt, so every screen now speaks Immersive:
// the same header, works staged like feed slides, pages in the work's colour.
// Screen changes crossfade through View Transitions (Harness.tsx), with the
// header holding still and the photo on screen moving into place.
//
// Scrolling is the "b" tuning (round 9: "Make B the only version"): one work
// per swipe on both axes, the profile on the same reel as the feed, vertical
// wheel handed to the reel when a photo track has latched the gesture. The
// harness options (COMBINED_OPTIONS) hold what is still open: how the feed
// moves as it scrolls.
import { useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ME, getPost } from "../data";
import { ProtoContext, useProto } from "../protoContext";
import { Toasts } from "../shared/ui";
import { FeedStateProvider, ImmersiveAuth, ImmersiveCreate, ImmersiveFeed, ImmersivePost, ImmersiveProfile } from "./Immersive";

/** The Immersive stylesheet's scope (.v3), with dialogs portalled inside it. */
function Scope({ className, children }: { className: string; children: ReactNode }) {
    const proto = useProto();
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    return (
        <div ref={setEl} className={className}>
            <ProtoContext.Provider value={{ ...proto, portal: el }}>{children}</ProtoContext.Provider>
        </div>
    );
}

export function Combined() {
    const { route } = useProto();
    return (
        <FeedStateProvider tuning="b">
            <MotionConfig reducedMotion="user">
                <Scope className="v3">
                    {route.screen === "feed" && <ImmersiveFeed />}
                    {route.screen === "post" && <ImmersivePost post={getPost(route.postId)} key={route.postId} />}
                    {route.screen === "profile" && <ImmersiveProfile userId={route.userId ?? ME.id} key={route.userId} />}
                    {(route.screen === "login" || route.screen === "signup") && <ImmersiveAuth mode={route.screen} key={route.screen} />}
                    {route.screen === "create" && <ImmersiveCreate />}
                    <Toasts position="top-center" />
                </Scope>
            </MotionConfig>
        </FeedStateProvider>
    );
}
