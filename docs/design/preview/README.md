# Design-system previews

Static HTML reference cards. Open directly in a browser — self-contained,
no build step, no Angular app running. They exist so we can settle
"which variant goes here" without booting the stack.

## Variant matrices (v2 — authoritative variant rules)

- **[`components-buttons-matrix.html`](./components-buttons-matrix.html)**
  — primary, secondary, destructive, destructive-soft, ghost, icon-only
  ghost. Includes disabled states, hover, press, focus.
- **[`components-tags-matrix.html`](./components-tags-matrix.html)** —
  status (success / warn / danger / info), neutral, outlined, domain
  (belts).
- **[`components-fields-matrix.html`](./components-fields-matrix.html)** —
  resting, hover, focus, invalid, disabled for inputtext, select,
  datepicker, textarea, inputnumber.
- **[`components-cards-matrix.html`](./components-cards-matrix.html)** —
  surface card + four alert tints (warn / danger / info / success).

## Brand / logo lockups (v3)

- **[`brand-logo.html`](./brand-logo.html)** — the four logo treatments
  (app-icon · dark, on-accent, light-surface, wordmark). Use this to
  confirm which treatment belongs on which surface.
- **[`brand-icons.html`](./brand-icons.html)** — the filled-chip brand
  icon language (used for empty states, marketing, the launcher tile).
  NOT to be mixed with PrimeIcons inside in-app UI.

## When to open these

- Before building a new screen — confirm you know which variant goes
  where.
- During PR review — point at a specific variant to confirm
  consistency ("this is the `destructive-soft` variant from the
  buttons matrix").
- When extending the design system — any new variant gets a new
  preview file here, same format.

The authoritative source for the SCSS that *produces* these variants is
[`client/src/styles/budojo-variants.scss`](../../../client/src/styles/budojo-variants.scss).
The preview HTML and the SCSS must stay in sync — if you change one,
update the other in the same PR.
