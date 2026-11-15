# Photo Share design system

This is the rulebook for every Photo Share screen. Read it before designing, building or reviewing UI, and keep it up to date when a decision changes (see [§13 Changing the system](#13-changing-the-system)). §11.2 is the handoff for the production rebuild.

| | |
|---|---|
| **Tokens** | [`frontend/src/design/tokens.css`](frontend/src/design/tokens.css): every colour, type size, tracking, spacing step, layout dimension, duration and layer has a name there. Component stylesheets use only these (§11.1) |
| **Reference implementation** | The **Combined** prototype: `frontend/src/prototypes/variants/Combined.tsx` renders every screen from `Immersive.tsx` + `immersive.css` (scope `.v3`, classes `i-*`), which reads only tokens. Screen transitions live in `Harness.tsx` (`withViewTransition`). Shared behaviour is in `shared/ui.tsx`, `shared/hooks.ts` and `shared/shared.css`. The other harness variants (Exhibition, Wall label, Immersive, Catalogue) are retired looks kept for comparison. Don't copy from them |
| **Run it** | `cd frontend; npm run dev`, then open `/prototypes.html` (Combined is `?v=1`, the default). The **Options** panel appears only while a decision in §12 is open |
| **Background** | `DESIGN-INSPIRATION.md` (the study of marikoohya.jp the look comes from), `prototype-feedback.md` (the owner's feedback rounds) |
| **Skills** | `photo-share-design` (load before UI work), `design-system` (audit / document / extend), `frontend-design` plugin |

When sources disagree, precedence is: **the owner's latest words → this document → the Combined prototype code → `DESIGN-INSPIRATION.md`**. If the code and this document differ, fix whichever is wrong and say so. Don't silently follow one of them.

---

## 1. The idea

**A photo exhibition you can post to.** The site should read like a quiet gallery: one photograph at a time, on a wall whose colour comes from the photograph, with small engraved-looking labels. It is still a working product, so it has to do the job a photo-sharing service does: sign up, post a series, find people's work, edit and delete.

**One language on every screen.** A work fills the screen, staged as a *slide*: its title runs vertically in the left margin, a credit line sits beneath, and the page takes the photo's colour. The feed is a reel of slides, and a profile is the same reel filtered to one person. A post is one slide opened up into two screens: the photograph, then its wall label. Log in and sign up are a slide with the form in its right-hand room. New post is a live preview of the slide it will become. Going from one screen to the next should feel like the same room changing, not a new site: the header holds still, the photo on screen moves into its next place, and everything else crossfades (§7.3).

## 2. Principles

1. **The photograph is the largest thing on every screen it appears on.** Nothing shrinks it to make room for chrome, frames or text. The post view never shows a photo smaller than the feed does.
2. **Chrome is quiet and stays out of the frame.** Use text links, 1px lines and small tracked capitals. No cards, shadows, rounded corners, filled icon buttons or coloured accents around photos.
3. **Colour comes from the work.** The page background is the current photo's pale `tint` and changes as the visitor moves (`--t-tint`). The UI itself is ink on paper.
4. **Motion answers the visitor.** Things move because someone scrolled, swiped, hovered or clicked. There are no looping or attention-seeking animations near content. Scroll-linked motion is allowed because the visitor drives it. The one exception is the hero's scroll cue, a hairline that draws itself down on repeat (the owner's choice), away from any work's details.
5. **Native scrolling, never hijacked.** Use CSS scroll-snap. JavaScript may only *hand* input to the right scroller (§7.1). Scripted paging felt awkward and was reverted.
6. **One way to do one thing.** Every destination has one entry point. Two links that open the same page, or a Back that duplicates the wordmark, are bugs.
7. **One component per job, reused everywhere.** If two places do the same thing (close something, page through photos, link to an author), they use the same component and look identical. Before you style a control, look in §6 for the one that already does that job. A second look-alike is a bug, even when each one is fine on its own.
8. **Usability beats imitation.** Keep what makes the reference beautiful, and drop what makes it a poor web app: text as images, no focus outlines, blank `alt`, taps disabled on phones, no reduced-motion support (`DESIGN-INSPIRATION.md` §6).
9. **Bilingual from the start.** Every visible string goes through i18n, and Japanese gets its own typographic rules (§3.3).
10. **Every value has a name.** A colour, size, gap, duration or layer that isn't a token is a review comment. If the scale lacks a step, add a token and document it; don't type a value.

## 3. Typography

### 3.1 Faces

| Token | Face | Role | Never use it for |
|---|---|---|---|
| `--display` | Cinzel 400 (500 for an active state) | The **voice**: wordmark, nav, labels, buttons, counters, fact labels, section titles. Always uppercase via CSS, always tracked | Sentences or anything longer than ~6 words, or Japanese |
| `--serif` | Cormorant Garamond 400 / *italic* | **Titles and prose**: work titles (italic), years, body copy, form input text, filter options, hints, errors | Tiny labels under 13px |
| `--jp` | Noto Serif JP 400/500 | Any Japanese string (titles, captions, UI in `ja`) | Uppercase or wide tracking |

There is no monospace face. Fonts are self-hosted through `@fontsource` (imported once in the entry file), never loaded from Google. Inter and IBM Plex Mono are installed only for retired prototypes. They are not part of the system.

### 3.2 Type scale

Write copy in sentence case in `en.ts`/`ja.ts`. Uppercase comes from CSS (`text-transform`), so screen readers and translations get normal text. Line-heights are unitless and set per role (1 for labels, 1.15–1.4 for titles, 1.4–1.6 for prose).

| Token | Size | Face | Used for |
|---|---|---|---|
| `--fs-micro` | 8.5px | display | COVER badge; the filter line on phones |
| `--fs-label-xs` | 9.5px | display | fact and filter labels, quiet links, Find, meta lines, kickers, tile authors |
| `--fs-label-sm` | 10px | display | credit line, index numbers, EN / JA, the scroll cue |
| `--fs-label` | 10.5px | display | header links, text links, buttons, hero stats, toast titles |
| `--fs-label-lg` | 12px | display | counter totals; wordmark and vertical title on phones |
| `--fs-mark` | 15px | display | wordmark, vertical title (with its italic year), sheet titles, drop-zone title |
| `--fs-mark-lg` | 17px | display | form titles ("Log in", "New post") |
| `--fs-count` / `--fs-count-lg` | 20 / 30px | display | pager number / position-counter number |
| `--fs-hero` | 44px (28 on phones) | display | hero name: "Photo Share", a username |
| `--fs-small` | 13px | serif / jp | prototype notes, Japanese tile captions |
| `--fs-hint` | 15px | serif italic | hints, field errors, toast text, dialog notes |
| `--fs-body` | 17px | serif | running text, wall-label lines, tile captions, the base size |
| `--fs-option` | 18px | serif italic | filter options, gear links; Japanese wall title |
| `--fs-field` | 20px | serif | input text, form sub-titles, the empty Index sentence |
| `--fs-lead` | 23px (19 on phones) | serif italic | hero line, caption-bar title |
| `--fs-title` | 28px | serif italic | wall-label title, dialog titles, end card |

| Tracking | Value | Used for |
|---|---|---|
| `--track-tight` | 0.04em | italic years inside tracked titles |
| `--track-ja` | 0.08em | Japanese text |
| `--track-meta` | 0.18em | small data: credit line, numbers, EN / JA, filter line |
| `--track-label` | 0.2em | the default: links, labels, dialog buttons, vertical title |
| `--track-wide` | 0.24em | solid buttons, section titles, kickers, the scroll cue |
| `--track-mark` | 0.28em | wordmark, sheet and form titles |
| `--track-ja-vertical` | 0.38em | short vertical Japanese titles |

Titles always pair with their **year**: in serif italic after a roman title ("Galleria, late afternoon *2026*"), and in roman after an italic title on the wall label.

### 3.3 Japanese

- Detect Japanese titles (`/[぀-ヿ㐀-鿿]/`) and add `is-ja`. Switch to `--jp`, set `text-transform: none`, and use `--track-ja` (`--track-ja-vertical` only for short vertical titles). Never apply italics.
- Vertical Japanese titles are **not** rotated 180°. They read top to bottom (`.i-vtitle.is-ja`).
- In production, set `<html lang>` from `LanguageProvider` so `:lang(ja)` rules work.

## 4. Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | #0d0d0d | text, rules, solid buttons. **The one black of the interface**: never `#000` |
| `--muted` | black 55% | secondary text: credits, labels, counts, quiet links |
| `--faint` | black 32% | placeholders, the dashed add tile |
| `--hair` | black 14% | 1px dividers, quiet-link underlines |
| `--rule` | black 60% | input underlines, drop-zone border |
| `--wash` | black 6% | an empty photo tile, the add tile on hover |
| `--danger` | #8c1d18 | errors and the Delete confirm button only |
| `--paper` | #f4f1ec | a page with no photo yet (new post before photos, 404) |
| `--sheet` | #f1eee8 | overlays: Index, dialogs, tooltip, toasts |
| `--tint-default` | #ece9e2 | page colour before a photo supplies one |
| `--night` | #141414 | the hero's ground under its photo |
| `--black` | #000 | lights out only: a photograph alone on black |
| `--scrim` | night 55% | behind dialogs |
| `--on-dark` / `--muted-on-dark` / `--hair-on-dark` | white / 60% / 25% | text, secondary text and quiet-link underlines on dark |
| `--page` | a photo's `tint` | set per page: `style={{ "--page": post.tint }}` |

- **Ink on paper.** Every page takes the colour of the work it stages: a reel the work in view, log in / sign up the work they open around, new post its cover. `--paper` only when there is no photo yet.
- **Page tint from the photo.** Each post carries a pale `tint`. The page background follows it with `--t-tint`. In production the backend should compute the tint when it makes the thumbnail (`DESIGN-INSPIRATION.md` §7 step 7). Until then use `--tint-default`.
- **Text never lies on a photograph,** except on the hero. The post view keeps its title and tools in bands of their own (the header band and the caption bar), subtracted from the photo's height (`--reserve` ≤ `--feed-reserve`).
- **Text on the hero** carries `--halo` (a soft text-shadow), and the hero's photo has `--hero-shade`, a radial shade from the bottom-left corner where its words sit. The header over a hero is plain white with the same halo, and icons get `--halo-mark`. There is no shade at the top, and no blend modes.
- **Dark surfaces** are only `--night` (the hero) and `--black` (lights out). There is no site-wide dark mode, by design.
- **Semantic colour** is only `--danger`. There is no success green: success is a toast.
- Never put a coloured accent, gradient or overlay box on a photo, except the hero's `--hero-shade`.

## 5. Layout and spacing

### 5.1 Layout tokens

| Token | Value | What it measures |
|---|---|---|
| `--gutter` | 44px (18 on phones) | inset for everything fixed: header, rails, floating controls |
| `--rail` | 128px (88 ≤1100px, 16 on phones) | side room around a slide for the vertical title and counter |
| `--header-h` | 90px (64 on phones) | the fixed header's height; content starts below it |
| `--bar` | 88px (84 on phones) | the post view's caption bar |
| `--feed-reserve` | 200px (230 on phones) | height kept for text around a feed photo; the post view never reserves more |
| `--photo-max` | 1180px | widest a feed photo gets |
| `--form-w` | 360px | log-in / sign-up form column |
| `--panel-w` | 400px (340 ≤1100px) | the new-post side panel |
| `--label-w` | 340px | the wall label's measure |

### 5.2 Spacing scale

Every gap, padding and margin is a step: `--s-2`, `--s-4`, `--s-6`, `--s-8`, `--s-10`, `--s-12`, `--s-14`, `--s-16`, `--s-18`, `--s-22`, `--s-28`, `--s-36`, `--s-48`, `--s-64`, `--s-96`, `--s-150`. Each is named by its pixel value. Steps go up by 2 to 18 for spacing inside components, then widen for layout (between sections 64–150). Combine with layout tokens when a gap is measured from the header: `calc(var(--header-h) + var(--s-22))`. Component dimensions that aren't spacing (a 12px chevron, an 88px tile, a 56px scroll line, a 32px label rule) stay literal in the component, named by what they measure.

### 5.3 Frame

- **Header** (`.i-header`): fixed, transparent, `--s-28` padding (`--s-18` on phones). The wordmark is on the left. On the right are two things only: one action, `+ New` for a member or `Log in` for a visitor (absent on the log-in and sign-up pages), then the lead link, which on the feed is the Index link ("All 10 works"). Your profile, Log out, Sign up and `EN / JA` live in the heroes, which the wordmark and one scroll up always reach. **On the post and new-post pages the nav is replaced by Close.** On pages that scroll normally the header takes the page colour. Nothing else goes near the wordmark.
- **Left rail:** the vertical title of the work in view. **Right rail:** the position counter `03 / 10` (rotated −90°).

### 5.4 Slide

```
┌──────────────────────────────────────────────────────────┐
│ PHOTO SHARE                          + NEW   ▦ ALL 10 WORKS │  header (fixed)
│                                                          │
│ G   ┌──────────────────────────────┐                  0  │
│ A   │                              │                  3  │  left rail: vertical title + year
│ L   │       photograph             │                  /  │  right rail: position counter
│ L   │ (max-height 100svh − reserve)│                  1  │
│ .   └──────────────────────────────┘                  0  │
│     AOI.TANAKA  MILAN  FUJIFILM X-T5 · XF23    ‹ 2/3 ›   │  credit line + pager
└──────────────────────────────────────────────────────────┘
```

- Padding is `--s-96 --rail --s-36`. The photo is contained, never cropped, centred, at most `--photo-max` wide and `100svh − --feed-reserve` tall.
- A series is a horizontal scroll-snap track (one photo per page) with chevrons and a `Count`.
- On phones the title moves above the photo (horizontal) and the credit line stacks. Gear and the counter are hidden.

### 5.5 Grids and breakpoints

- **Index (contact sheet):** `repeat(auto-fill, minmax(180px, 1fr))`, gap `--s-36 --s-22`, square crops with a 2-digit number, an italic caption and the author. Crops use thumbnails (`thumbnail_path ?? image_path`), full views the original.
- Breakpoints: **1100px** (`--rail` 88, `--panel-w` 340) and **760px** (phones: the phone values above, the vertical title goes horizontal, controls stack, the Index becomes one column). Test at **1440×900** and **390×844**.

## 6. Components

Name parts by role (`Header`, `CloseButton`, `Pager`). Prototype classes carry the `i-` prefix; in production use one prefix-free set (§11.2).

| Component | Prototype | Rules |
|---|---|---|
| **Wordmark** | `Header` → `.i-wordmark` | Always goes to the feed; on the feed, back to its top (the landing hero). Nothing sits next to it |
| **Header link** | `.i-hlink` | Display caps, no underline, fades to `--hover-opacity` on hover. "+ New", "Log in", the Index link, Info and Close are header links |
| **Close** | `CloseButton` (`.i-close`) | **The one close control:** reads **"− Close"**, the counterpart of "+ New" (a header link, minus sign `aria-hidden`). Used for the Index sheet (`<Dialog.Close render={<CloseButton />} />`), leaving a post (`PostClose`) and leaving new post (`CreateClose`). Callers give a spoken label ("Close, back to feed"). Esc does the same, unless a field, dialog or drag has it. Never make another close or ✕ |
| **Text link** | `.i-textlink` | Display caps with a 1px underline, for actions in running copy and empty states ("No account yet? *Sign up*", "Clear filters", "Back to the top"). `.is-light` on the hero |
| **Quiet link** | `.i-quietlink` | Lower in the hierarchy than a text link or an author link: `--muted` at `--fs-label-xs` with a `--hair` underline. For actions beside information, never the point of the screen: the filter line's Clear, the Index's Clear all, Log out, Manage, Edit, Delete. `.is-light` on the hero |
| **Button** | `.i-btn` | Solid `--ink` with `--on-dark` text, display caps, square. `.is-light` (white, on the hero), `.is-block` (full width in forms). One per view, for the main action (Log in, Publish, New post). While its action runs: `--disabled-opacity`, a `progress` cursor, and the label says what's happening ("Publishing…") |
| **Index link** | `indexLink` in `ImmersiveFeed` (`.i-hlink.i-indexlink`) | The single way into the Index. It names the set on screen: "All 10 works", or "4 of 10 works" (weight 500) while a filter narrows it. Sort only reorders, so it never makes "10 of 10". Grid icon before it |
| **Drift hero** | `DriftHero` | A full-bleed photo on `--night`, drifting −10% → 2% with scroll, large display text and actions bottom left, `--hero-shade` and `--halo`. Two uses: the **landing hero** at the top of the feed (a visitor starts on it; a member lands on the first work with it one scroll up) and the **person hero**. Actions follow one pattern: the main action as a light button, the way to the other set of works as a text link, quiet links, then `EN / JA`. Landing hero: visitor *Log in* · Sign up; member *New post* · Your profile · Log out |
| **Person hero** | `PersonHero` | The drift hero on the person's first work: name, bio, "N works · N photographs". Yours: *New post* · All works · Log out · EN / JA |
| **Scroll cue** | `ScrollCue` (`.i-scroll.is-drawn`) | "Scroll" over a 56px hairline under a hero. The line draws itself down and fades every `--t-cue`, the one looping animation. With reduced motion it draws once and stays |
| **Reel** | `Reel` | A vertical scroll-snap container (`.i-reel.is-stop`) of an optional hero, slides and an end card ("That's everything here." / "That's everything by aoi.tanaka." + All works, then Back to the top). It remembers the last opened work. Keys: ↓/↑, PgDn/PgUp, J/K, Space |
| **Slide** | `Slide` (`.i-slide`) | One work on a reel. The photo is a button that opens the post, carrying the photo index (2 of 3 opens on 2/3). It **settles** as the reel scrolls (`SETTLE`: arriving and leaving at 98.5% scale and 55% opacity, flat and full when centred); nothing moves sideways; off with reduced motion |
| **Slide staging** (layout) | `.i-slide`, `.i-door`, `.i-compose-stage` | The shared staging of a work: `--s-96 --rail --s-36` padding, the vertical title in the left rail, the photo contained, a credit line beneath. Every screen that shows a work builds on it |
| **Vertical title** | `.i-vtitle` | Title + italic year at `--fs-mark`, `vertical-rl` rotated 180° (not for Japanese), max 72svh, horizontal on phones |
| **Credit line** | `.i-credit-line` | Author · place · gear, in that order, `--muted` display caps at `--fs-label-sm` |
| **Author link** | `AuthorLink` (`.i-author`) | Display caps with an underline, in ink; goes to the person's profile |
| **Pager** | `Pager` (`.i-pager`) | Hairline chevrons (`currentColor`, hit area widened by `::before`) around a `Count`. Only for a series of 2+. At the ends: `--disabled-opacity-mark`. Hover fades like an ink link |
| **Count** | `shared/ui.tsx` `Count` | NumberFlow rolling digits, tabular. Rotate the whole element (never `writing-mode`) when it is vertical |
| **Position counter** | `.i-progress` | `03 / 10` on the right rail, hidden on phones |
| **Index sheet** | `IndexSheet` (`.i-index`) | A full-screen `--sheet` dialog: "Index", live count, Close. Sort · Filter column on the left (sticky), the contact sheet on the right; stacked on phones. Picking a work closes it and lands the reel there |
| **Filter panel** | `FilterPanel` | Rows of label + options (Base UI `ToggleGroup`/`Toggle`). Options are serif italic, `--muted`, darkening on hover, ink with an underline when pressed. Rules: Sort (one), By (any number of people), Only: Single photo / Series of 2+ (one or neither). "Clear all" (quiet link) only while a filter (not a sort) is on; it keeps the sort |
| **Filter line** | `FilterLine` (`.i-filterline`) | While a filter is on, a `--muted` line under the wordmark saying which ("by lena.ph · single photos only"), then Clear (quiet link; keeps the sort). Never the sort. More than two people read "by a, b and 3 others"; "3 others" (dotted rule) opens a Base UI Tooltip (`ByNames`) on the `--sheet` surface with a 1px ink edge listing everyone under "By". Hidden while a hero is on screen. Not a link: the Index link is the one way in |
| **Caption bar** | `.i-post-bar` in `PostView` | The post's band under the photo (`--bar`): title (serif italic `--fs-lead`, one line) over the author on the left; Info and the Pager on the right. It and the header fade (`--t-idle`) after `--idle-fade` without input while the visitor is at the top. Its caption fades out as the wall label's title scrolls in, so the title is never on screen twice |
| **Info link** | `.i-hlink.i-info-link` + `.i-info-chev` | "Info" and a small chevron, just left of the Pager. It moves to the wall label and back, the chevron pointing the way it will go. I does the same; Esc goes back up. Spoken as "Info: details below" / "Info: back to the photo" |
| **Wall label** | `WallLabel` (`.i-wall-label`) | The post's details, like the card beside a print: a 32px ink rule, the author, the title in italic with the year in roman (`--fs-title`), the place, the camera and lens each with Find, the posted date (`2026.08.14`) in `--muted` caps, then owner actions. Left-aligned, `--label-w` wide, alone in the middle of its screen (`.i-post-label`). `dark` sets it white on black for lights out |
| **Gear link** | `GearLink` (`.i-find`) | "Find" after a camera or lens (a grey link); opens the AI gear-link dialog |
| **Owner actions** | `OwnerActions` (`.i-owner-line`) | Only for the owner, at the foot of the wall label: one quiet "Manage" that opens to Edit · Delete in place. Delete always confirms in a dialog |
| **Lights out** | `LightsOut` (`.i-lights`) | A click on the post's photo (`zoom-in` cursor), or F. Inside the window (no browser full screen, no "Press Esc" notice): the page goes `--black` and the photo moves out to fill the window. Nothing else is on screen; the cursor hides after `--idle-cursor`. One snapped scroll down: the same wall label, white on black. A click on the photo (`zoom-out`) or Esc turns the lights back on, on the photo it ended on. ←/→ or a swipe pages a series. A `role="dialog"` at `--z-lights`, under the dialog layer, so Find / Edit / Delete open above it |
| **Language toggle** | `LangToggle` (`.i-lang`) | `EN / JA` in the heroes; the language not in use at 0.45 opacity, darkening on hover |
| **Text field** | `TextField` (`.tf`) | Display-caps label, serif input with only a bottom rule (`--rule`) that turns ink with an inset line on focus. Hint and error below in serif italic. Errors in `--danger` with `aria-invalid` |
| **Form error** | `.i-form-error` | Serif italic `--danger` with a 1px left rule, `role="alert"` |
| **Side panel** | `.i-compose-panel` | The surface for fields beside a work: the page colour lifted toward white, a hairline left edge, `--panel-w` wide. Full width under the work on phones |
| **Sortable photos** | `SortablePhotos` (dnd-kit, `.i-sortable`) | 88px thumbnails on `--wash`, reordered by drag or keyboard. The first is marked COVER (ink band, `--fs-micro`). Remove × (a light square that inverts on hover), + add tile (dashed `--faint`, ink border and `--wash` on hover) |
| **Drop zone** | `.i-compose-empty` | Fills the preview's photo area with a 1px `--rule` border: "Choose photos" in display caps and the limits in serif italic (JPEG, PNG or WebP · up to 32 MB each · up to 10 photos). Lightens on hover |
| **Dialogs** | `ConfirmDelete`, `EditPost`, `GearLink` | Base UI Dialog / AlertDialog on `--sheet` over `--scrim`, no border, square, `--t-dialog` + `--ease-out`. Title in serif italic `--fs-title`. Cancel as a text link; the confirm button solid ink, `--danger` for Delete |
| **Toasts** | `Toasts` (Sonner, unstyled) | Top centre, `--sheet` with a 1px ink border. Title in display caps, text in serif italic. Past-tense confirmations ("Post published", "Signed out") |

### 6.1 States every interactive part needs

| State | Treatment |
|---|---|
| Hover (fine pointers only, `@media (hover: hover) and (pointer: fine)`) | **Ink links and marks** (wordmark, header links, text links, author, pager chevrons, dialog links) fade to `--hover-opacity` over `--t-hover`. **Solid buttons** ease to `--hover-opacity-solid`. **Grey links and controls** (Find, quiet links, "3 others", filter options, EN / JA) darken to their surface's strong colour (`--link-strong`: ink on paper, white on dark) and their line to currentColor, over `--t-color`. A grey control never fades further. Photos in grids go to 0.7 |
| Focus | `:focus-visible { outline: var(--line) solid currentColor; outline-offset: 5px }`. Never remove it (lights out's photo track is the one exception: the view is the focus) |
| Active / selected | Ink + underline (filter options), `aria-current` / `aria-pressed` |
| Disabled | `--disabled-opacity` and a `progress` cursor while an action runs, with changed wording; `--disabled-opacity-mark` and a default cursor for marks that can't act |
| Loading | The words change ("One moment…", "Uploading 2 / 3"). No spinners. Images reserve their space |
| Empty | A sentence in serif italic plus one text link that gets out of it ("No works match these rules. *Clear filters*") |
| Error | Say what went wrong and how to fix it (`--danger`, `role="alert"`), next to the field or at the top of the form |

## 7. Interaction and motion

### 7.1 Scrolling

- The feed, a profile, the post view (photo → label) and lights out (photo → label) are all **reels**: `scroll-snap-type: y mandatory` with `scroll-snap-stop: always` (`.is-stop`), one screen per gesture.
- **Tempo:** one gesture moves one work vertically and one photo horizontally. Horizontal and vertical must feel the same.
- **Hand-off, not takeover:** a trackpad gesture that starts sideways stays latched to the photo track. `useWheelToPage` steps the reel once only when a mostly-vertical gesture *begins while that track is (or within 600ms was) moving sideways*, and swallows the rest of that gesture wherever the pointer goes, using one record per reel shared by all its tracks. Every other gesture is native snapping. It never touches horizontal input or touch.
  - *Regression to avoid:* per-track gesture state let one swipe step twice when the reel moved the next work's track under the pointer, skipping works.
- A member's feed opens on the first work, with the landing hero one scroll up. Returning from a post lands on the work that was opened. Changing filters starts at the top (the reel re-mounts).
- Arrow keys page through photos. Every key a screen consumes calls `preventDefault()`, and screens stand down while a `role="dialog"` is open.

### 7.2 Motion values

| What | Tokens |
|---|---|
| Ink hover | opacity to `--hover-opacity` over `--t-hover` |
| Grey hover, control colour | `--t-color` |
| Page tint following the work | `--t-tint` |
| Sheets (Index), field focus | `--t-overlay` |
| Tooltip | opacity + `scale(0.97)` from the trigger, `--t-pop` + `--ease-out` |
| Dialogs | opacity + 8px rise + `scale(0.98)`, `--t-dialog` + `--ease-out` |
| Feed motion: Settle | scale 0.985 → 1 and opacity 0.55 → 1 on arrival, scroll-linked (`SETTLE` in `Immersive.tsx`); hero −10% → 2% |
| Screen change | `--t-screen` + `--ease-out` for moving photos, linear crossfade for the rest |
| Lights out in / out | a screen change: the photo moves out to fill the window and back. From the label (photo off screen) the photo fades instead of moving |
| Post view idle | header and caption bar fade over `--t-idle` after `--idle-fade` without input at the top, and return on any pointer, key, wheel or scroll |
| Scroll cue | one draw every `--t-cue` |

- JavaScript reads the same values from named constants that mirror the tokens (`IDLE_FADE_MS`, `IDLE_CURSOR_MS`, `SETTLE`); change both together.
- Everything goes through `<MotionConfig reducedMotion="user">` plus `@media (prefers-reduced-motion: reduce)` overrides. With reduced motion, drift, settle, tint transitions and screen changes stop. Opacity fades may stay, and the scroll cue draws once.
- Never animate on page load except a short fade (≤0.4s). Never loop, except the hero scroll cue.

### 7.3 Screen changes

- Every navigation (links, Back/Forward, Esc, Close) runs through the View Transitions API (`withViewTransition` in `Harness.tsx`; in production, the router's navigation wrapped the same way). The old screen crossfades into the new one over `--t-screen`.
- **The header holds still** (`view-transition-name: i-header`), because it is the same on every screen.
- **The photo moves rather than cuts.** The photo on screen carries `view-transition-name: work-<post id>` (`workPhoto()`). Wherever that work appears on the next screen (post view, log in / sign up, lights out), it moves and scales into place. Names must be unique on a page: give the name only to the shown photo of a series, never to two copies of one work.
- Screens that stage a work keep it from the screen before when they can: log in / sign up open around the post you came from or the work on screen in the feed.
- No View Transitions support, or reduced motion: the change is instant.

## 8. Screen recipes

| Screen | Recipe |
|---|---|
| **Feed** (`ImmersiveFeed`) | A reel: the landing hero ("Photo Share / One photograph at a time."), slides, the end card. A visitor starts on the hero; a member on the first work. When the rules come down to one person, the reel becomes their profile (person hero on top, "That's everything by …" at the end). The Index link is the single way into the Index (contact sheet + sort/filter); the filter line names active filters |
| **Post** (`PostView`) | Two snapped screens. First: the photo as large as the screen allows between the header band (Close replaces the nav) and the caption bar (title + author \| Info, ‹ 1/n ›), opening on the photo index it was opened with. Second: the wall label alone on the page colour; nothing below it. One swipe, Info or I moves between them; Esc comes back up; Esc at the top, or Close, leaves. A click on the photo (or F) turns the lights out. ←/→ page the series. No text on the photo |
| **Profile** (`ImmersiveProfile`) | The feed filtered to that person (`PinnedAuthor`): person hero, their works, "That's everything by aoi.tanaka." + All works, with the Index link and filter line carried on from the feed. Sort and Only carry over between feed and profile; choosing other people, Clear or All works leaves for the feed. Author links and "Your profile" lead here |
| **Log in / Sign up** (`ImmersiveAuth`) | A slide with the form in its right-hand room (`.i-door`: work `1fr`, form `--form-w`). The staged work is the post you came from (on its shown photo), else the work on screen in the feed, else a default. Form: display-caps title, italic subtitle ("Welcome back."), fields, a block button, the alternate link ("No account yet? *Sign up*"). On phones: title, photo (max 34svh), then the form |
| **New post** (`ImmersiveCreate`) | Close replaces the nav (`CreateClose`: back to where you came from, else the feed; Esc too). A live preview of the slide it will become (`.i-compose-stage`): "Preview" kicker, the typed title up the margin ("Untitled" until typed), the cover on its colour (the drop zone before photos), and the credit line from your name, place and camera/lens (typed, else read from the photo). Below: the sortable filmstrip (first = cover). The side panel holds Title, Place, Camera, Lens (placeholders show EXIF values) and Publish ("Uploading 2 / 3") |
| **404 / errors** | `--paper` page with the standard header, one italic sentence and a text link back to the feed |

## 9. Accessibility checklist

- Real text everywhere. Photos get `alt` from the caption ("{caption}, photo 2 of 3" in a series). Decorative images get `alt=""`.
- Carousels have `aria-roledescription="carousel"` and a label. Hidden slides get `aria-hidden` and `tabIndex=-1`.
- Icon-only controls (chevrons, remove ×) have an `aria-label`. When a control's visible word needs context, the spoken label starts with that word ("Close, back to feed"; "4 of 10 works: index, sort and filter"; "Info: details below").
- Dialogs, tooltips and menus are Base UI parts (focus trap, Esc, a title), never the browser's `title` tooltip.
- Every action works by keyboard. Fixed controls never cover focused content.
- Contrast: `--muted` (black at 55%) on `--tint-default` is about 4.4:1, right at the limit, and darker tints lower it. Check each tint the backend produces. If it fails 4.5:1, use black at 62% for muted text on that page, or cap how dark tints can get.

## 10. Copy

- Name things the way people say them: "All works", "Series of 2+", "Choose photos", "Manage".
- Buttons state the action ("Publish", "Create account"). Toasts confirm in the past tense ("Post published"). Pending labels use present participles with an ellipsis ("Publishing…").
- Errors say what to do: "Enter an email address like name@example.com."
- Header actions pair as signs: "+ New" and "− Close".
- No exclamation marks, emoji or "Oops".
- Every string goes in `TranslationDictionary` + `en.ts` + `ja.ts` (CLAUDE.md, i18n). §11.2 lists the strings the redesign adds.

## 11. Building it

### 11.1 Rules for code

- **Libraries (already chosen):** Base UI (`@base-ui/react`) for dialog, tooltip, toggle and field behaviour, unstyled. `motion` for scroll-linked motion. Sonner (unstyled) for toasts. dnd-kit for reordering. `@number-flow/react` for counters. `clsx`. Don't add kits that bring their own look (MUI, Chakra, shadcn themes, Tailwind UI).
- **Tokens:** import `src/design/tokens.css` once at the app entry and use `var(--…)` for every value. A typed colour, size, gap, duration or z-index in a component stylesheet is a review comment. A component dimension (a chevron's 12px, a tile's 88px) may stay literal when it measures that component.
- **Hover** always inside `@media (hover: hover) and (pointer: fine)`.
- **Verify each change:** `npm run lint`, `npm run build`, `npm test`, and screenshots of every screen at 1440×900 and 390×844 (EN and JA), once with `reducedMotion: "reduce"`.

### 11.2 Production handoff

The prototype is the spec. The rebuild moves it into the app screen by screen, keeping behaviour and look.

**Before starting.** The prototype (`frontend/src/prototypes/`), `frontend/src/design/`, `DESIGN-SYSTEM.md`, `prototype-feedback.md` and `.claude/skills/` are not in git yet. Commit them first, so the rebuild has a fixed reference.

**Where each part goes** (production names drop the `i-` prefix and the "Immersive" names):

| Prototype | Production | Notes |
|---|---|---|
| `tokens.css` | import in `main.tsx` | Replaces the colours, fonts and sizes in `index.css` / `index-legacy.css` as screens move over. Check for clashes: `index-legacy.css` defines its own `--mono` |
| `Header`, `CloseButton` (`PostClose`, `CreateClose`) | `components/Header.tsx`, `components/CloseButton.tsx` | Replaces `NavBar` and `LanguageSwitcher` in the header. EN / JA moves into the heroes |
| `DriftHero`, `PersonHero`, `ScrollCue` | `components/Hero.tsx` | Landing hero needs the feature photo from data (the prototype uses post 103) |
| `Reel`, `Slide`, `Pager`, `AuthorLink` | `components/Reel.tsx`, `Slide.tsx`, `Pager.tsx`, `AuthorLink.tsx` | Replaces `PostCard` grids and `LoadMore`: the reel needs pagination (`usePostPages`) that loads as the end card nears |
| `IndexSheet`, `FilterPanel`, `FilterLine` (`ByNames`) | `components/Index/*` | Filters (`feedState.ts`) belong in the URL query so a filtered feed and a profile can be linked |
| `ImmersiveFeed` | `pages/FeedPage.tsx` | `/` |
| `ImmersiveProfile` + `PinnedAuthor` | `pages/ProfilePage.tsx` | `/users/:userId` renders the feed with the author pinned (`GET /posts?user_id=` already exists) |
| `PostView`, `Photos`, `WallLabel`, `OwnerActions`, `LightsOut` | `pages/PostDetailPage.tsx` + `components/WallLabel.tsx`, `LightsOut.tsx` | Replaces `ImageCarousel` on this page; keep its lazy loading of slides |
| `ImmersiveAuth` | `pages/LoginPage.tsx`, `SignupPage.tsx` | The staged work comes from router state (the post or reel position the visitor came from) |
| `ImmersiveCreate`, `SortablePhotos` | `pages/CreatePostPage.tsx` | Keep its upload/EXIF logic; restyle and restage |
| `EditPost`, `ConfirmDelete`, `GearLink`, `Toasts`, `TextField` | existing dialogs, `GearLinkAction`, `FormField` | Restyle to §6 |
| `useSnapTrack`, `useWheelToPage`, `useDocumentKeys`, `useInViewKey` | `hooks/` | As they are |
| `withViewTransition` (`Harness.tsx`) | the router's navigation | Wrap `navigate()` the same way; skip under reduced motion |

**Data the design needs that the API doesn't have yet:** a per-post `tint` (pale colour sampled from the cover, computed with the thumbnail); a user `bio` (the person hero shows it); counts for the person hero ("N works · N photographs").

**Strings to add to `TranslationDictionary`** (EN given; JA needed for each): "+ New", "− Close" and its spoken forms ("Close, back to feed / profile / the post"); "All {n} works", "{n} of {total} works", "…: index, sort and filter"; "One photograph at a time.", "Scroll", "Your profile", "All works", "{n} works · {n} photographs"; "Index", "Sort · Filter", "Sort", "By", "Only", "Newest first", "Oldest first", "Most photos", "Single photo", "Series of 2+", "Clear", "Clear all", "Clear filters", "by {names}", "and {n} others", "series only", "single photos only", "Nothing matches these rules.", "No works match these rules."; "That's everything here.", "That's everything by {name}.", "Back to the top"; "Info", "Info: details below", "Info: back to the photo", "View full screen: {photo}", "Previous photo", "Next photo", "Manage", "{caption}, lights out. Scroll for the label; Escape to close."; "Preview", "Untitled", "Choose photos", "Drag to reorder. The first photo is the cover.", "Camera and lens come from the photo unless you type your own.", "Welcome back.", "Signed out". Several exist under other wording in `nav`, `posts`, `profile` and `auth`; reuse those keys where the meaning is the same.

**Remove once a screen has moved:** the prototype harness and its retired variants, the fonts only they use (Inter, IBM Plex Mono, unused weights), and `index-legacy.css` rules the new components replace.

## 12. Open decisions (switchable in the prototype)

None are open, so the prototype's Options panel is hidden. When the owner asks for variations, list them here (and as a row in `COMBINED_OPTIONS`) until they pick one. Meanwhile build new work so it doesn't depend on the choice.

| Decision | Options | Notes |
|---|---|---|
| (none) | | |

## 13. Changing the system

1. Check this document and the Combined prototype for an existing part. Reuse beats new.
2. For a new pattern, run the `design-system` skill in **extend** mode and write the result into §6 (and §8 if it's a screen).
3. Anything visual the owner hasn't seen goes into the prototype harness first, as a variant or an Options row, so it can be compared.
4. When the owner decides, update §12 and the decision log, and remove the losing options from the code.
5. Change a value in `tokens.css`, not in components. Rename tokens only with a find-and-replace across the frontend in the same change. A value missing from a scale gets a new token (and a line in §3–§5), not a literal.
6. After a refactor that shouldn't change the look, compare screenshots of every screen before and after: they should match pixel for pixel.

## 14. Decision log

| Date | Decision | Why (owner feedback) |
|---|---|---|
| 2026-11 | Direction: Immersive for feed/post/profile, Exhibition for auth/create | Round 1: picked from 4 prototypes |
| 2026-11 | Feed and profile scroll the same way; the post opens on the photo the visitor was viewing | Round 1–2: mismatch felt broken; 2/3 must stay 2/3 |
| 2026-11 | No scripted scroll takeover; native snap + `scroll-snap-stop`; wheel hand-off only | Round 2: takeover "awkward"; round 3: likes B's tempo, wants horizontal to match |
| 2026-11 | Post photo never smaller than the feed; no frame/shrink | Round 2 |
| 2026-11 | No looping cue animations | Round 3: the animated Details line was distracting |
| 2026-11 | Back says "Back to feed" like production, only on the post view, away from the wordmark | Round 2–3 |
| 2026-11 | One Index entry = contact sheet + sort/filter on one page | Round 2–3: two entries to similar pages were redundant |
| 2026-11 | The Index link reads "All 10 works" / "4 of 10 works"; the filter line is no longer a second way in | Round 4: picked "4 of 10 works" |
| 2026-11 | The post is left through the shared Close, which replaces the header nav | Round 4: picked "Close", and it must be the Index's Close |
| 2026-11 | Reuse one component per job (principle 7) | Round 4: "ui components should generally be reused to be consistent" |
| 2026-11 | No text on photos in post views; content below the fold peeks, with a "Details"/"More" link | Round 4: Fullscreen text was hard to read on the image; Curtain/Edge scroll wasn't obvious |
| 2026-11 | Wheel hand-off only when a track has latched the gesture; shared per-reel state | Round 4: vertical scroll got faster and skipped works (regression from round 3) |
| 2026-11 | Exhibition retired: log in, sign up and new post rebuilt in Immersive (slide staging, work colour, same header) | Round 5: the switch between the two looks was too abrupt |
| 2026-11 | Screen changes use View Transitions: the header holds, the photo moves into place, the rest crossfades | Round 5: "make the transition smooth and natural" |
| 2026-11 | Hero scroll cue = the drawn line (the old Details animation), looping; draws once under reduced motion | Round 5: picked; it looked broken because reduced motion stopped it entirely |
| 2026-11 | Post view = Fullscreen + Info. Info sits left of the pager and scrolls down to the details instead of opening a side panel. Curtain, Edge print, Below and the Info panel are retired | Round 6: "use the fullscreen+info version as a base … upon clicking info … scroll down instead" |
| 2026-11 | No "Full screen" text: a click on the photo opens a distraction-free full view | Round 7: "remove the 'fullscreen' clickable text … implement a truly distraction free full screen when the user clicks on the image" |
| 2026-11 | Post details = the wall label (Bar docks, Sheet, Below, Tools-only, Colophon, Specs + plates and Poster retired). Full view = lights out, in the window (Black, On its colour and Edge to edge retired), and scrolling down in it shows the same wall label, white on black | Round 8: "use Wall label for post details … use Lights out (in window) … scrolling down … will show the same wall label except this time white on black" |
| 2026-11 | Combined B's scrolling is the only scrolling (Combined's plain snap and window-scrolled profile retired) | Round 9: "Make B the only version" |
| 2026-11 | The post page is two snapped screens, photo then wall label, with More from removed | Round 9: "do that for normal post details page too, and remove the more from xxx … top half post detail bottom half wall label" |
| 2026-11 | The wall label drops the photo count; filters drop camera brand, and Only offers Series of 2+ or Single photo | Round 10 |
| 2026-11 | Feed motion = Settle (Drift, Stairs, Walk the hall, Along the wall, Room to room, None, Slow photo and Label follows retired) | Round 11: "I decided to use Settle" |
| 2026-11 | Sort never counts as narrowing ("10 works", not "10 of 10") and never shows in the filter line; more than two people read "by a, b and N others"; Clear is a quiet link; Only lists Single photo before Series of 2+. Profile-as-filter variants Feed filtered, Solo show and Contact sheet retired | Round 11 |
| 2026-11 | One reel: a profile is the feed filtered to one person, and filtering to one person shows their hero and end card. The header holds only + New / Log in and the Index link; Your profile, Log out, Sign up and EN / JA live in the heroes (the account menu, menu sheet and separate profile page are retired). Landing hero for visitors: Log in (button) · Sign up; your person hero: New post · All works · Log out | Round 12: "Use one reel + index only", "+ New button to the left of the Index button", "swapping sign up and log in", All works "between new post and log out" |
| 2026-11 | Edit / Delete behind a quiet "Manage". "Clear all" only when a filter (not a sort) is on. The full list of people in the filter line opens in a Base UI Tooltip, not the browser's. One hover rule: ink links fade, grey links darken | Round 12 |
| 2026-11 | Hero readability opened as a decision (Gradient, Corner shade, Glass plate, Split, Band) | Round 13 |
| 2026-11 | Hero text = Corner shade (Gradient, Glass plate, Split and Band retired). The new-post page leaves through the shared Close (and Esc) instead of showing "+ New". Dialog links and buttons get hover feedback | Round 14: "corner shade works well"; "top right corner of create new post page shows + New which is the same page" |
| 2026-11 | Close reads "− Close", a header link like "+ New" that fades on hover (the diagonal line and its variations retired). The header over a hero is plain white with a halo, no shade on the photo (the veil, difference blend and other variations retired) | Round 15: "close can be like '- close' just like new photo is '+ new' … text brightens just like + new"; "use Halo only" |
| 2026-11 | Production prep: tokens are the only source of values (complete scales for type, tracking, spacing, layout, motion and layers; the prototype's private copies removed). One black (`--ink`; `--black` only for lights out), one halo. Stylesheet regrouped by component with dead rules removed; components renamed for production (`PostView`, `LightsOut`, `.i-post-*`, `.i-lights*`). Hover feedback added to the pager, EN / JA and the photo-reorder controls, and every hover limited to fine pointers. Values snapped to the scales by 1–2px; no layout changed | Audit after round 15: "take all actions necessary to improve design system … in preparation of production code updates" |
