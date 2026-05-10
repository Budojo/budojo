## What

Three iPhone-class viewport regressions caught visually after v2.3.2 shipped — one each on the profile page (pencil affordance falling under the value) and the athletes list (age chip wrapping `35` / `y`, belt label wrapping `Green` / `(kids)`).

## Why

- **Profile pencil** — the v2.1.0 polish sweep tried to pin the pencil to the row's top-right via `:host ::ng-deep .__row > p-button { position: absolute }`. The cascade lost on real iPhone hardware (the rule has been live for days but the pencil keeps rendering below the value). Refactor to a plain flex wrapper avoids the `::ng-deep` interaction with the PrimeNG `@layer primeng` cascade entirely.
- **Age chip** — `<p-tag value="35 y">` carried a literal space; with no `white-space: nowrap` and no IE-style nbsp, the chip wraps internally on narrow columns.
- **Belt label** — same shape as age, `(kids)` suffix on the kid variants breaks at the inner space when the column gets squeezed on phone-class viewports.

## How

### `profile.component.html` + `profile.component.scss`

- Wrap `<value> + <pencil>` in `<div class="profile-page__value-row">` for all four read-mode rows (firstName, lastName, handle, email).
- Drop the `:host ::ng-deep .profile-page__row > p-button { position: absolute }` block entirely.
- Drop the mobile `padding-right: 3rem` reservation on `__row` (no longer needed — the pencil is in normal flow now).
- New `__value-row { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }`. On desktop it expands across the row's free width.
- `__value` gets `flex: 1 1 auto; min-width: 0; word-break: break-word` so a long email pushes the pencil to the trailing edge and wraps inside the span instead of breaking the row.

### `age-badge.component.ts`

- Template `value="' y'"` → `value="'y'"` (`35y` instead of `35 y`). One token, can't wrap.

### `belt-badge.component.scss`

- `.belt-badge__label` gets `white-space: nowrap`. The pill grows in width when needed; height stays a single row.

## Notes

- **Visual smoke** — gates green (prettier + lint + 713 vitest specs), but I have NOT verified visually on a real iPhone 14 Pro Max. The fixes are mechanical (drop wrapping conditions, replace absolute positioning with normal flow), and the existing E2E specs cover the data-cy hooks unchanged. Worth a manual smoke pass on the user's device before declaring done.
- **No data-cy / aria changes** — all selectors and accessibility attrs stay the same. E2E + a11y unchanged.
- **No i18n keys touched** — purely structural.

## Out of scope

- Cache-bust strategy for users stuck on old SPA bundles (the "Luigi case") — separate decision, separate PR. Discussed in memory but not implemented yet.
- A reusable `<app-inline-edit-row>` primitive — `docs/design/component-audit-v2.1.0.md` § 9 flagged this as canonical-candidate work; out of scope here, this PR is mechanical.

## References

- v2.1.0 component audit § 1 — original "pencil-action sits on the same visual row at all viewports" canonical
- Visual report: user screenshots from iPhone 14 Pro Max on `/dashboard/profile` and `/dashboard/athletes`

## Test plan

- [x] Prettier clean
- [x] ESLint clean
- [x] Vitest 713 specs green
- [ ] Manual smoke on iPhone 14 Pro Max — Profile page: First name / Last name / Handle / Email rows show pencil inline next to value at all states (set, unset, verified, unverified)
- [ ] Manual smoke on iPhone 14 Pro Max — Athletes list: age chip shows `35y` on one line, belt pill shows `Green (kids)` on one line, neither wraps when name column is squeezed
- [ ] Cypress E2E (CI)
