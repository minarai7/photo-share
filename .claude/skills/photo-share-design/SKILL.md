---
name: photo-share-design
description: Photo Share's design system. Load it before any frontend UI work in this repo (new or changed screens, components, CSS, layout, motion, UI copy, prototypes) and when reviewing UI changes, so the work matches DESIGN-SYSTEM.md and frontend/src/design/tokens.css.
---

# Photo Share design system

Photo Share looks like a quiet photo exhibition: one photograph at a time, the page colour taken from the photo, small tracked Cinzel capitals as labels, Cormorant italic for titles, 1px lines, no cards. These files are the authority:

- `DESIGN-SYSTEM.md` (repo root): principles, type and colour scales, layout and spacing, the component catalogue, screen recipes, a11y, copy, the production handoff (§11.2), open decisions and the decision log.
- `frontend/src/design/tokens.css`: every value (colour, type size, tracking, spacing step, layout dimension, motion, z-index).
- Reference code: the **Combined** prototype (`frontend/src/prototypes/variants/Combined.tsx` → `Immersive.tsx`/`immersive.css` for every screen, grouped by component and reading only tokens; `shared/`; screen transitions in `Harness.tsx`). The other harness variants are retired looks. Don't copy from them.

## Before you design or write UI

1. Read `DESIGN-SYSTEM.md`, at least §2 Principles, §6 Components and the §8 recipe for the screen you're touching. Check §12 for decisions that are still open, and don't settle one on the owner's behalf.
2. Find the existing component in the Combined prototype and reuse its structure and behaviour. Only design something new when nothing fits, and then use the `design-system` skill in *extend* mode.
3. Use tokens (`var(--…)`) for every colour, size, tracking, gap, duration and layer: the spacing scale is `--s-2` … `--s-150` (named by pixel value), type is `--fs-*` and `--track-*`, layout is `--gutter`, `--rail`, `--header-h`, `--bar` and friends. Only a component's own dimensions (a 12px chevron, an 88px tile) stay literal. If a value is missing, add a token to `tokens.css` and document it in DESIGN-SYSTEM.md §3–§5.

## Rules that are easy to break

- The photo is never smaller on the post view than in the feed. No frames, cards, shadows or rounded corners around photos.
- No looping or attention-seeking animation (the hero's drawn scroll line is the one exception). Motion follows input, and reduced motion is respected.
- Every screen stages its work like a feed slide, in that work's colour, under the same header. Screen changes keep the header still and move the shown photo (`workPhoto`) rather than cut.
- Hierarchy of links: author and destination links in ink; secondary actions beside information (Clear, Log out, Manage, Edit / Delete) are quiet links (`.i-quietlink`, muted with a `--hair` line), never ink. Hover: ink links fade to `--hover-opacity`; grey links darken to `--link-strong`. Never a grey link that fades.
- Popovers, tooltips and menus are Base UI parts on the `--sheet` surface with a 1px ink edge, never the browser's `title` tooltip.
- Native scroll-snap only. JavaScript may hand wheel input to the right scroller, never replace scrolling.
- One entry point per destination, and one component per job. Close is always `CloseButton`, and leaving a post uses it too. Nothing sits next to the wordmark.
- No text on top of photos in post views (only the drift hero carries text over its image). The post view is the photo between the header band and the caption bar; its details are a wall label (`WallLabel`) on a second snapped screen below (nothing after it), reached by Info (left of the pager), I, or one swipe. A click on the photo turns the lights out (`LightsOut`): the photo alone on `--black` in the window, no text or controls, and the same label white on black one scroll down.
- One black: `--ink`, never `#000` (only lights out uses `--black`). Text on a photo carries `--halo`.
- Copy is in sentence case in `en.ts`/`ja.ts`, and uppercase comes from CSS. Japanese is never uppercased, italicised or widely tracked.
- Keep `:focus-visible` outlines. Hover effects are for fine pointers only.

## Before you finish

- [ ] Every value comes from a token. No new fonts, colours or radii.
- [ ] States are covered: hover (inside `@media (hover: hover) and (pointer: fine)`), focus, disabled/pending wording, empty sentence + way out, errors in `--danger` with `role="alert"`.
- [ ] Phone width (390px) and desktop (1440px) both work. JA strings render with `--jp`.
- [ ] `prefers-reduced-motion` stops drift, pans and slides.
- [ ] Keys a screen consumes call `preventDefault()`. Dialogs come from Base UI.
- [ ] If you made or changed a design decision, update `DESIGN-SYSTEM.md` (§6/§8/§12 and the §14 log) in the same change.
- [ ] Run `npm run lint`, `npm run build` and `npm test`, plus screenshots if anything visual changed. For a refactor meant to change nothing, compare before/after screenshots pixel for pixel.

For a deliberately new look or a big creative step, the `frontend-design` plugin skill can help with ideas, but its output still has to fit these rules.
