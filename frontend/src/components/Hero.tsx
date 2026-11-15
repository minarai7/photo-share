import { useContext, useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useLanguage } from "../lang/useLanguage";
import { getImageUrl } from "../utils/imageUrl";
import { ReelContainerContext } from "./reelContext";
import "./Hero.css";

/**
 * The drift hero: a full-bleed photograph drifting sideways with scroll, its
 * text bottom left over the corner shade, letters with a halo. Without a
 * photo (no works yet) it is the plain --night ground.
 */
export function DriftHero({ imagePath, children }: { imagePath?: string | null; children?: ReactNode }) {
    const container = useContext(ReelContainerContext);
    const ref = useRef<HTMLElement>(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end start"] });
    const x = useTransform(scrollYProgress, [0, 1], ["-10%", "2%"]);
    return (
        <section ref={ref} className="hero" data-key="intro">
            <div className="hero-media">
                {imagePath && (
                    <motion.img src={getImageUrl(imagePath)} alt="" className="hero-img" style={reduce ? undefined : { x }} fetchPriority="high" />
                )}
            </div>
            <div className="hero-body">{children}</div>
        </section>
    );
}

/**
 * "Scroll" over a hairline that draws itself down and fades, on repeat (the
 * one looping animation). With reduced motion it draws once and stays.
 */
export function ScrollCue() {
    const { t } = useLanguage();
    return (
        <span className="scroll-cue is-drawn" aria-hidden="true">
            {t.hero.scroll}
        </span>
    );
}
