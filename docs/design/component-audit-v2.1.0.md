# Component audit — v2.1.0 baseline

Walk-through of the SPA's UI surfaces as of `v2.1.0` (tag `336a1de`),
focused on the categories where bugs and inconsistencies have shown
up in user testing. Each finding cites files + line numbers as
evidence. **No code changes in this doc — pure inventory.** The
canonical patterns chosen from these findings will land in
`DESIGN_SYSTEM.md` as a follow-up; the per-component apply PRs come
after that.

The reference canon is unchanged: Material Design 3 + Apple HIG
override layer + Don't Make Me Think + Norman + Laws of UX (see
`docs/design/DESIGN_SYSTEM.md`). This audit doesn't add new canon —
it surfaces where the codebase drifts from the canon we already have.

---

## 1. Card-row pattern (label / value / action)

**Three different row patterns coexist for the same primitive.** A
"card row" is a horizontal label-value pair, optionally with a
trailing action (pencil), separated by a hairline border, stacked
inside a card. Implemented three different ways:

| Surface | File | Padding | Label size/weight | Label color | Align (≥768) |
|---------|------|---------|-------------------|-------------|--------------|
| Academy detail | `academy-detail.component.scss:73-89` | `1rem` (all sides) | `0.8125rem` / 500 | `--p-text-muted-color` | `baseline` |
| Profile | `profile.component.scss:54-69` | `1rem 0` (h: 0) | `0.875rem` / 400 (default) | `--p-text-color-secondary` | `center` |
| Email-change card | `email-change-card.component.scss:2-14` | `0.5rem 0` | `0.875rem` / 500 | `--p-text-color` | `center` |

User-reported symptoms tracking back to this:
- "altezza diversa tra academy e profile" — direct consequence of the
  padding and label-size split above.
- "prima/ultima riga non centrata" on profile — `align-items: center`
  desktop with a column-direction value that contains a `<small>`
  hint can produce uneven baseline alignment when one row has hint
  text and another doesn't.
- "brutto su iPhone 14 Pro Max" — the profile mobile layout drops
  the pencil-action onto its own row below the value because the
  row is `flex-direction: column` and the actions are siblings.
  Academy doesn't have this because its rows are read-only (single
  page-level Edit button at the top, `academy-detail.component.html`).

**Canonical candidate**: take the academy shape (`1rem` all-side
padding, `0.8125rem / 500` muted label, `baseline` desktop align),
add the action positioning rule "pencil-action sits on the same
visual row as the value at all viewports — `position: absolute;
top: 0.75rem; right: 0` is the safest shape because it survives
column-flex collapse on mobile". Email-change-card is the cleanest
flex layout but uses different label tokens; harmonize the tokens
when applying.

## 2. Card surface — `<p-card>` vs. custom `<div class="…-card">`

| Where | Component | Wrapper |
|-------|-----------|---------|
| Profile | `profile.component.html` | `<p-card>` |
| Email-change | `email-change-card.component.html:2` | `<p-card>` |
| Athlete invitation | `invitation-card.component.html` | `<p-card>` |
| Academy detail | `academy-detail.component.html` | `<div class="card">` (raw) |
| Auth pages | `_auth-page.scss` | `<div class="auth-card">` (raw) |
| Stats charts | various `*-card.scss` | `<div class="…-card">` (raw) |

`<p-card>` carries a `<div class="p-card-body">` wrapper with
`padding: 1.25rem` from the Material preset; raw cards each
re-implement the chrome (border, radius, padding) with slightly
different values. Visually similar but not identical.

**Canonical candidate**: collapse to one rule. Either everything
becomes `<p-card>` (lose explicit control of inner padding) or
everything becomes a raw `class="card"` rule defined once in
`budojo-variants.scss` (consistent chrome, no PrimeNG body wrapper
to fight). Recommend the raw rule — academy already uses it and the
shape is the one we want; the `<p-card>` call sites would simplify
to `<section class="card">` with no behavioural loss. Document in
the design system that `<p-card>` is reserved for specific cases
(none identified yet — likely candidate to drop entirely).

## 3. Page wrapper — 12 different BEM roots

```
athlete-detail-page    athletes-page       help-page         stats-page
athlete-form-page      auth-page           legal-page        summary-page
                       expiring-page       profile-page      support-page
                                                             verify-page
```

Each page declares its own root class with its own opinions about
padding, max-width, and gap. The token rule from `DESIGN_SYSTEM.md`
§ 1.7 (`--budojo-page-{content,prose}-max`, padding inherited from
the dashboard shell `.main`) is followed by some pages and ignored
by others. Specifically:

- `profile-page` (`profile.component.scss:11`) declares its OWN
  `max-width: 640px` instead of consuming `--budojo-page-prose-max`.
  This is why profile renders narrower than other pages on desktop.
- `legal-page` (`_legal-page.scss`) reaches outside the dashboard
  shell, so its bespoke padding is correct (documented).
- The other 10 wrappers don't carry their own padding — good.

**Canonical candidate**: keep the BEM root per page (the per-feature
namespacing is useful for SCSS scoping) but require every page wrapper
to consume `--budojo-page-content-max` or `--budojo-page-prose-max`
for max-width — never invent a px / rem value. Add a lint rule (or
just a code-review checklist item) for `max-width:.*\d+(px|rem)` on
any class containing `-page`.

## 4. Button severity distribution

```
  45 secondary
  11 primary
   9 error
   4 success
   3 danger        ← duplicate role with `error`
   1 warn
   1 info
```

**Issue**: `error` (9 uses) and `danger` (3 uses) are the same
semantic role — destructive / error states. PrimeNG accepts both
because the Material preset maps them through, but they're aliases.
Two names for one role is exactly the kind of drift the canon warns
against.

**Canonical candidate**: pick one, codemod the other away. Recommend
`danger` since destruction is the broader semantic (covers "delete"
actions that aren't strictly errors), and PrimeNG's own Tailwind-
inspired token set leans toward `danger`. Add to design-system doc.

## 5. Icon dimensions — random font-size jungle

`grep "font-size:.*[0-9].*rem" client/src/app/features/**/*.scss`
turns up `1.0625rem`, `1.125rem`, `1.25rem`, `1.5rem`, `1.75rem`,
`1.875rem`, etc. — no clear rhythm.

The `pi pi-*` PrimeIcon font sets glyphs that nominally scale to the
parent's `font-size`. The CSS canvases are then 14px / 16px / 18px /
20px / 24px in different places.

**Canonical candidate**: define a **5-step icon scale** in tokens —
`--budojo-icon-xs: 12px`, `--budojo-icon-sm: 14px`, `--budojo-icon-md: 16px`,
`--budojo-icon-lg: 20px`, `--budojo-icon-xl: 24px`. Document where each
goes (eyebrow icons → xs, inline-button icons → sm, body icons → md,
section-header icons → lg, page-hero icons → xl). Apply via
`%budojo-icon-{size}` SCSS placeholders.

PrimeNG SVG icons from `@primeng/icons` have a fixed 14×14 viewBox
(verified in `primeng-icons-baseicon.mjs` § BaseIcon host attrs).
That's the `sm` step. Document as the "default for inline icons in
form chrome" so we don't fight the framework.

## 6. PrimeNG icon rendering — class names AND element shape

Already addressed in the v2.1.x ux-polish branch (commit `b7f04da`),
but worth promoting to a permanent canon line so we don't relearn
it: `feedback_verify_primeng_classnames_in_source` in agent memory
covers the class-name half; the element-shape half is new from #491
follow-up.

**Canonical pattern**: when overriding any PrimeNG component's icon
rendering, grep the bundled `.mjs` for both:

1. **Classes** stamped on the icon: `node_modules/primeng/fesm2022/<component>.mjs`
   `Classes` enum — e.g. `PasswordClasses.maskIcon`,
   `PasswordClasses.unmaskIcon`, `PasswordClasses.clearIcon`.
2. **Element shape** the icon component renders as: `primeng-icons-baseicon.mjs`
   § `BaseIcon` host attrs. PrimeNG 21 is `<svg width="14" height="14"
   viewBox="0 0 14 14">` for ALL its built-in icons; it is NOT
   `<i class="pi">`. Padding on `<svg>` doesn't paint inside the
   viewBox — use `width`/`height` + `margin` for spacing, never
   `padding`.

This belongs in `DESIGN_SYSTEM.md` § "Working with PrimeNG icons".

## 7. Form input shells — `%budojo-field` is the source of truth

The `%budojo-field` placeholder in `budojo-variants.scss:261-296`
defines the canonical input shell (48px min-height, 12/14px padding,
17/22 body type, 12px radius). Components extending it:
`.p-inputtext`, `.p-textarea`, `.p-select`, `.p-inputnumber-input`,
`.p-datepicker` (composite), `.p-password` (composite),
`.p-iconfield` (composite).

**No drift here** — this part of the canon is healthy. The composite
controls (`p-datepicker`, `p-password`, `p-iconfield`) all hoist
chrome onto the wrapper and make the inner input a transparent
inheritor. The pattern is documented at each site.

The bugs we hit on v2.1.0 were inside the `.p-iconfield` icon-cap
positioning and `.p-password` SVG icon dimensions — neither broke
the wrapper-chrome contract; both were inside-the-wrapper details.
Nothing to consolidate here other than the icon-shape canon noted
above (§ 6).

## 8. Mobile responsive — the breakpoint discipline holds, except…

`DESIGN_SYSTEM.md` § Mobile-first is the default lists the breakpoint
tokens (`<768px`, `768px`, `1024px`, `1440px`) and says base styles
are mobile, `@media (min-width: <token>)` blocks scale up.

Walked all `*.component.scss` looking for violations:

- ✓ Most components follow the rule. `@media (min-width: 768px)`
  blocks dominate.
- ✗ `auth-page` (`_auth-page.scss`) defines its hero illustration
  with desktop dimensions and shrinks down — the inverse pattern.
  Probably fine because auth pages are a narrow viewport baseline
  by design (the form is the focus, the illustration is decoration).
- ✗ Inline-edit composites like `profile.component.scss` § `__row`
  use the mobile-first column layout but don't reflow the trailing
  pencil-action onto the value's row. This is the user-reported
  "iPhone 14 Pro Max brutto" issue. Fix lives at the row level
  (§ 1 above).

## 9. Inline-edit pattern — implemented in two places, two ways

**Profile** (`profile.component.html` § handle / email rows): the
row has a `pencil` p-button that toggles `editing()` state, swapping
the read-only value for an inline form (input + save/cancel). The
form lives in the SAME row. Mobile breakage as above.

**Email-change-card** (`email-change-card.component.html`): the
card's TOP row has the pencil; clicking opens the inline form
INSIDE the card, replacing the read-only row. State A direct save,
state B/C confirm dialog before save.

These are two implementations of the same UX pattern with subtly
different shapes (button copy, validation error placement, mobile
behaviour). User reported "two emails which one do I edit" because
the EDIT mode of the athlete-form ALSO shows an `email` field
(`athlete-form.component.html:88-112`), creating three editors for
the same `athletes.email` column.

**Canonical candidate**: one inline-edit primitive. Probably a
shared `<app-inline-edit-row>` component that takes
`label / value / [edit-template]` inputs. Out of scope for the
v2.1.x polish branch — kicked into the standards-apply effort.
Short-term: at least remove the email field from the EDIT mode of
the athlete-form (the dedicated card on athlete-detail is the
canonical editor; the form's email is the redundant third one).

## 10. Tab strips — already corrected in this branch

`p-tabs` + `p-tab` for the athlete-detail page (`athlete-detail.component.html:96-120`).
Edit moved to the leftmost slot in commit `557e92c` — primary action
gets the most-predictable position (Norman § Fitts).

No other multi-tab strip in the SPA right now. Convention to
document: **the left-most tab is the most-frequent default
destination**, not the alphabetical first.

---

## Summary — apply order for the standards rollout

The follow-up "apply" PRs should land in this order:

1. **Card-row primitive** (§ 1) — bring the academy shape to profile +
   email-change-card. Single biggest user-visible win. Likely 1 PR.
2. **Page wrappers consume tokens** (§ 3) — codemod `profile-page`'s
   bespoke `max-width: 640px` to `--budojo-page-prose-max`. Tiny PR.
3. **Severity codemod** (§ 4) — `error` → `danger` everywhere. Tiny PR.
4. **Icon scale tokens** (§ 5) — define the 5 steps in `budojo-theme.scss`,
   apply at the call sites that have the most random sizes
   (`stats-overview.component.scss`, `monthly-summary.component.scss`).
   Medium PR.
5. **Card surface unification** (§ 2) — drop `<p-card>` if we can,
   migrate the 3 call sites to the raw rule. Small PR.
6. **Inline-edit primitive** (§ 9) — design + extract the shared
   component. Larger PR — needs its own brainstorm session before
   implementation.

Items already addressed in the current `fix/ux-polish-v2.1.x` branch
(canon kept here for the standards-apply rollout to reference):

- § 6 — PrimeNG icon shape canon (commit `b7f04da`).
- § 10 — tab-strip ordering convention (commit `557e92c`).
