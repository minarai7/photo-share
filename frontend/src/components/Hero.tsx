import { useContext, useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
// The default photograph, for a hero with no work to show: a blank card by a
// mug and a candle (chosen by the owner), 2400px wide, sRGB, no EXIF. Its dark
// wall keeps the white header readable.
import emptyHero from "../assets/empty-hero.jpg";
import { useLanguage } from "../lang/useLanguage";
import { getImageUrl } from "../utils/imageUrl";
import { ReelContainerContext } from "./reelContext";
import "./Hero.css";

/**
 * The drift hero: a full-bleed photograph drifting sideways with scroll, its
 * text bottom left over the corner shade, letters with a halo. While its
 * photo is unknown it is the plain --night ground; `placeholder` (there is no
 * work to show: a person with no works, an empty site) puts the default
 * photograph there instead.
 */
export function DriftHero({ imagePath, placeholder = false, children }: { imagePath?: string | null; placeholder?: boolean; children?: ReactNode }) {
    const container = useContext(ReelContainerContext);
    const ref = useRef<HTMLElement>(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end start"] });
    const x = useTransform(scrollYProgress, [0, 1], ["-10%", "2%"]);
    const src = imagePath ? getImageUrl(imagePath) : placeholder ? emptyHero : null;
    return (
        <section ref={ref} className="hero" data-key="intro">
            <div className="hero-media">
                {src && (
                    <motion.img src={src} alt="" className="hero-img" style={reduce ? undefined : { x }} fetchPriority="high" />
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
