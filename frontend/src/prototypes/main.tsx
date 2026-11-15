import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/500.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/noto-serif-jp/400.css";
import "@fontsource/noto-serif-jp/500.css";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import "../design/tokens.css";
import "./harness.css";
import "./shared/shared.css";
import "./variants/exhibition.css";
import "./variants/wall-label.css";
import "./variants/immersive.css";
import "./variants/catalogue.css";

import { Harness } from "./Harness";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Harness />
    </StrictMode>,
);
