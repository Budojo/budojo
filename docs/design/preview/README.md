# Variant matrix previews (v2)

Static HTML renderings of the authoritative button / tag / form field /
card variants locked in design-system v2. These files are the canon
reference for **which variant to pick when** — not just visual
exploration.

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

Open these directly in a browser — they're self-contained and load
`colors_and_type.css` from this folder for the CSS custom properties.
No build step, no Angular app running.

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
