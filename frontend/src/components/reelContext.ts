import { createContext, type RefObject } from "react";

/** The reel's scroll container, for scroll-linked motion inside it (undefined = the window). */
export const ReelContainerContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);
