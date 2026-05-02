## What

Per-athlete payments table (Athlete → Payments tab) now keeps **uniform row heights** across the year instead of bouncing between ~40px (future months, empty action cell) and ~56px (past + current months, where the "Mark paid" / "Unmark" label wraps to two lines).

## Why

Reviewer caught the jitter on the live screen — adjacent rows in the same table rendering at visibly different heights breaks scan-friendliness (Krug § self-evident UI, Aesthetic-Usability effect, MD3 § 8dp grid). The cause was the conditional structure of the action cell:

- **Past + current months** rendered `<p-button label="Mark paid" .../>`. The 9rem column was narrow enough that the label wrapped to a second line on most viewports → tall row.
- **Future months** rendered an empty `<td>` (no `canEdit` → no button) → short row.

Two-pronged fix per the canon:

1. **Icon-only action button** (`pi pi-check` / `pi pi-times`) carrying the verb in `pTooltip` + `ariaLabel`. Same pattern the athletes-list pencil/trash buttons already use (`athletes-list.component.html` line 212–232) — the canonical row-action shape on this codebase. No label means no wrap, single-line height for every row. Touch target ≥ 32px from PrimeNG's `size="small"` text variant; the page is a desktop-first table tab.
2. **Read-only rows render a `—` placeholder** in the same slot. Future months (and every row when the academy has no monthly fee configured) keep the same vertical occupancy as paid/unpaid rows — the eye scans down a uniform column instead of registering the empty cells as "shorter".

The action column shrinks 9rem → 3.5rem since the label is gone — buys back horizontal space for Month / Status / Amount / Paid on without crowding the icon button (canon § 8dp grid).

## How

### `payments-list.component.html`

- Stripped `label="..."` from both `<p-button>`. Added `ariaLabel`, `pTooltip="..."`, `tooltipPosition="left"` to each.
- Wrapped the `@if (row.canEdit)` block with an `@else { <span class="payments-list__dash" aria-hidden="true">—</span> }` — placeholder for future months and the read-only-no-fee state.

### `payments-list.component.ts`

- Imported `Tooltip` from `primeng/tooltip` and added it to the component's `imports` array.

### `payments-list.component.scss`

- `__th-actions { width: 9rem }` → `width: 3.5rem`. Added a comment block explaining the canon rationale (8dp grid + scan-friendly tables) so a future "let me make this wider for affordance" change carries an argument first.
- No new selectors — the existing `.payments-list__dash` rule (already used for empty Amount / Paid on cells) is reused for the action placeholder.

## Tests

- `bash .claude/scripts/test-client.sh` — prettier clean, lint clean, vitest 380 → 380.
- Spec selectors are `data-cy="payment-mark-{month}"` / `data-cy="payment-unmark-{month}"` — unchanged. The label string was never asserted.

## Out of scope

- A min-height on `<tr>` belt-and-suspenders. Not needed once the cell content is uniform; would only mask future drift.
- Touch target size on mobile. Mobile users see the same icon button at the same `size="small"`. If real-device reports come back saying "fingers miss the icon," bump to `size` default (~40px) in a follow-up — not a YAGNI fix today.

## Test plan

- [x] `bash .claude/scripts/test-client.sh` green end-to-end.
- [ ] Manual smoke after merge: open Athlete → Payments tab, confirm all 12 rows have the same height regardless of paid / unpaid / future-month / no-fee state.
- [ ] Hover an icon button: tooltip shows "Mark paid" / "Unmark paid".

## References

- Reviewer screenshots showed the jitter on live deploy.
- Pattern source: `athletes-list.component.html` lines 212–232 (pencil + trash icon buttons).
- Canon: client/CLAUDE.md § Design canon — Krug, MD3 8dp grid, Norman § signifier, Fitts.
