# Budojo Design System

An Apple HIG / iOS 17+ minimal override layer for the PrimeNG Material preset used by Budojo — a mobile-first PWA replacing Excel spreadsheets for BJJ academy owners and instructors. The primary user is an instructor on the mat, phone in hand; the design system exists to make that context feel native, restrained, and fast.

## Sources

Everything here was read from the `m-bonanno/budojo` GitHub repo (not pre-loaded — browsed via GitHub tooling on demand). Key files referenced while building:

- `CLAUDE.md` — workflow + conventions
- `client/CLAUDE.md` — design canon (MD3 8dp grid, mobile-first breakpoints, PWA scaffold)
- `server/CLAUDE.md` — rejected patterns
- `.claude/gotchas.md` — mistakes to not repeat
- `docs/specs/m4-attendance.md` — target for attendance mockup
- `client/src/styles/**` — current theme entry points
- `client/public/icons/*` — app icons (512, 192, apple-touch, favicon) — already shipped from M3.5, not duplicated into this folder

## Index

This folder (`docs/design/`) contains:

- **`DESIGN_SYSTEM.md`** — token inventory, per-component override specs for 13 PrimeNG atoms, ASCII mockups of the mobile screens, implementation notes + gotchas + PWA specifics. Source of truth for tokens is the live file at [`client/src/styles/budojo-theme.scss`](../../client/src/styles/budojo-theme.scss); the markdown keeps a collapsed historical snapshot for context only.
- **`README.md`** — this file. Brand context, content fundamentals, visual foundations, iconography.
- **[`screenshots/`](./screenshots/README.md)** — committed visual inventory of every canonical page at three viewports, regenerated on demand via `npm run design:inventory`. Start here when building a new feature: scan the folder, find the closest existing pattern, reuse it. See the folder's README for the full feature-building playbook.

The original Claude Design delivery also shipped a static CSS mirror, preview cards (HTML), a React UI kit, and a `SKILL.md` manifest. Those artifacts are reference-only and live in the local (gitignored) `.design-system-dropzone/` folder on the machine that did the integration — we deliberately don't duplicate them into the repo:

- App icons (192/512/apple-touch/favicon) already ship from `client/public/icons/`.
- The React UI kit and preview HTML are prototypes, not consumed by the Angular app.
- The `SKILL.md` manifest was for a Claude skill workflow that's not wired into this repo.

If you need any of those artifacts, re-unzip the original `Budojo Design System.zip` delivery into `.design-system-dropzone/` — both the filename and folder are gitignored for exactly this pattern.

## Content fundamentals

**Tone:** Sparse, direct, operational. No marketing warmth, no emoji, no "Let's…" openers. The user is a coach mid-class who needs an answer in under three seconds.

**Voice:** Second-person, active. *"Upload document"* not *"You can upload a document."* Buttons verb-first, headers noun-first.

**Casing:**
- Large-titles, screen headers — sentence case: *Athletes*, *Attendance*, *Upload document*.
- Buttons — sentence case: *Sign in*, *Add athlete*, *Upload*.
- Eyebrow labels — ALL CAPS + `letter-spacing: 0.06em`: *EXPIRING SOON*, *ALL DOCUMENTS*.
- Status tags — sentence case: *Valid*, *Expiring*, *Expired*, *Missing expiry*.
- Dates — ISO in inputs (`2027-01-15`), human in display (*Expires in 12 d*, *11 Jan*).

**I vs you:** Always *you* (the coach). The product never refers to itself as *we*. System messages are impersonal: *9 documents need attention* — not *We noticed 9 documents…*.

**Emoji:** None in product UI. PrimeIcons glyphs only. (Preview cards use emoji as placeholders for icons; production swaps in `pi pi-*` classes.)

**Numbers:** Leading zeros on dates (*02 Mar*), no leading zero on counts (*9 documents*). Use `·` (middle dot) as the universal separator in supporting text: *Blue · 3 stripes · Active*.

**Error copy:** State the fact, then the remedy. *"Medical certificate expired 4 days ago. Upload a new one to continue tracking."* Never blame the user, never use *oops*/*whoops*.

## Visual foundations

**Palette.** Near-monochrome. iOS system grays (`#fafafa` → `#0a0a0b`) as surfaces; a single indigo accent (`#5b6cff`) for CTAs, focus, and active nav. iOS system semantics for status only (`#34c759` success, `#ff9f0a` warning, `#ff3b30` danger, `#0a84ff` info). Accent is never used to indicate status or disabled state — status is semantic, disabled is `surface-400` on `surface-100`.

**Type.** Inter (SF-substitute) at the iOS HIG scale — Large Title 34/40, Title 1 28/34, Title 2 22/28, Title 3 20/25, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 12/16 and 11/13. Tight letter-spacing emulates SF Pro optical sizing: `-0.024em` display, `-0.018em` titles, `-0.003em` body.

**Spacing.** 8dp grid (canon). 4px allowed only as hairline gap. 48px is the touch-target floor; 44px only for supplementary controls wrapped in a 48px hit region.

**Backgrounds.** Flat. No full-bleed photography, no illustrations, no repeating patterns, no gradients on surfaces. The only depth comes from `surface-50` → `surface-0` elevation — a single shade lift, nothing more. Gradients appear only in the single app-icon tile.

**Animation.** iOS decelerate (`cubic-bezier(0.22, 1, 0.36, 1)`) is default. Three durations — 160/240/360 ms. Spring curve caps at 1.2 (gentle overshoot, never elastic). **No bounce, no ripple, no shrink-on-press.** PWAs in standalone mode amplify bounce — it reads as broken.

**Hover (desktop only).** Rows: background → `surface-100`. Buttons: background → hover variant (darker for fills, `surface-100` for ghost). Never use opacity for hover.

**Press.** Opacity → `0.88`, no transform. Applies to every pressable. iOS vocabulary.

**Borders.** 1px hairline at `surface-300` (14% white in dark mode). Zero heavier borders anywhere. Divider = hairline, card edge = hairline, input border invisible until focus (then `--budojo-accent`).

**Elevation.** Two levels, strictly. Level 1 (`shadow-surface`) = hairline inset border, used on cards, inputs, table rows. Level 2 (`shadow-floating`) = `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12)` — dialogs, menus, toasts, bottom sheets. A third ramp is forbidden; if something needs more depth, it's the wrong container.

**Protection gradients.** None. Toast + tab bar sit on a translucent white (`rgba(255,255,255,0.92)`) with hairline top border instead of a fade. Backdrop blur avoided — expensive on older iPhones in standalone PWA.

**Layout.** Every fixed element honors `env(safe-area-inset-*)`. `100dvh` always, never `100vh`. Tab bar is bottom-fixed, touches safe-area. Bottom sheets fill viewport width with 24px top radius and slide up at `--motion-slow` on decelerate.

**Transparency & blur.** Used sparingly. Modal scrim at 32% black (52% in dark). Tab bar at 92% white. No frosted-glass surfaces elsewhere.

**Imagery.** There is no imagery. User avatars are initials on a solid belt-color fill, 40–56 px, fully rounded. If imagery is ever added (e.g. athlete photos), it should be cool-neutral, slightly desaturated, 12px rounded corners, never full-bleed outside a dedicated detail route.

**Corner radii.** Buttons + cards 12. Dialogs 16. Bottom sheets 24 top. Tags + avatars fully rounded. Inputs 12.

**Card anatomy.** Flat `surface-0` background, 1px hairline border, 12px radius, no shadow. Internal structure via 1px hairline dividers between rows. Title in Title 3; supporting text in Footnote muted.

## Iconography

**Primary set: PrimeIcons** — already ships with PrimeNG. The repo uses `pi pi-user`, `pi pi-calendar`, `pi pi-upload`, `pi pi-pencil`, `pi pi-trash`, `pi pi-plus`, `pi pi-search`, `pi pi-ellipsis-h`, `pi pi-chevron-right`, `pi pi-exclamation-circle`, `pi pi-check-circle`. Stroke-weight is light enough to match the Apple-minimal direction. **Do not substitute SF Symbols in production** — they are Apple-system fonts and won't render in Firefox or Android.

**App icon.** Lives in `client/public/`:
- `icons/icon-maskable-512.png` — maskable PWA icon
- `icons/icon-512.png` — standard 512 px PWA icon
- `icons/icon-192.png` — standard 192 px PWA icon
- `icons/apple-touch-icon.png` — iOS home-screen icon
- `favicon.ico`

**SVGs.** None in the repo beyond the icon font. No custom illustrations.

**Emoji.** Not used in production UI. The preview cards occasionally use emoji as stand-ins for PrimeIcons glyphs (so the visual cards are font-stack-agnostic); the real Angular app uses `<i class="pi pi-*">`. This substitution is **flagged** — if you generate a new production template, use PrimeIcons, not emoji.

**Unicode.** `›` (U+203A) for chevrons in ASCII mockups and preview cards; `›` also works as a visual stand-in. In production use `<i class="pi pi-chevron-right">`.

**Color.** Icons inherit `--fg-primary` in body content, `--budojo-accent` when interactive, and semantic colors only inside status chips. Never multi-color.

## Font substitution

The production app loads Inter via `@fontsource/inter` (weights 400/500/600/700). The preview cards + UI kit reference Inter directly through the system stack and fall back to `-apple-system` / `BlinkMacSystemFont`. **No font files are committed to this design system** — `@fontsource` is the single source of truth and is already a dependency in `client/package.json`. If you need an offline mirror for a throwaway prototype, pull Inter from Google Fonts (`family=Inter:wght@400;500;600;700`) — metrics are identical.

## Caveats

- Attendance is a **target mock**, not reverse-engineered from existing code. It implements `docs/specs/m4-attendance.md` at the aesthetic level only; data model / check-in semantics are the spec's to define.
- The UI kit uses plain React-div re-implementations of PrimeNG atoms (not real `p-button` / `p-datatable` etc.). The goal is visual fidelity of *what the override produces*; the SCSS file in `DESIGN_SYSTEM.md` is what ships.
- No imagery was found in the repo beyond the app icons. If future routes add athlete photos, this system needs an imagery section.
