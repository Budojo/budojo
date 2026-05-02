## What

Closes #283. Adds `<app-unpaid-this-month-widget>` to the dashboard home (the athletes-list page), mirroring the rhythm of the existing **expiring-documents** + **monthly-summary** tiles. Shows a count of athletes whose current-month payment is unpaid, the top 5 as deep-links into each athlete's Payments tab, and a "View all" CTA to `/dashboard/athletes?paid=no`.

## Why

Reading the issue verbatim: *"After the 15th of the current month, an academy with a configured monthly fee has half-or-more of its expected payments due. There's no surface today that tells an instructor 'you've got 4 unpaid athletes for April, here's who'."* This widget closes that gap with one glanceable tile, in the same place the instructor already looks for "things to chase this week".

Canon: Norman § feedback (the data was already in the system, the user couldn't see it); Hick's law (the dashboard widgets stack now reads as a coherent set of three "things-to-chase" tiles); Krug § forgiveness (tap-to-deep-link to the actionable view).

## How

### Visibility — two gates, both required

- The academy must have `monthly_fee_cents` configured (`hasMonthlyFee()` — the same gate the inline mark-paid toggle and the per-athlete Payments tab already use). No fee, no widget — zero noise for academies that don't track payments through Budojo.
- Today must be on or after the **16th of the month** (issue § visibility threshold). First half of the month reads as "still early"; second half reads as "actually chase".

Both gates fail → the component's template root is `@if (visible()) { … }` and the host renders **nothing**. The athletes-list page drops `<app-unpaid-this-month-widget />` unconditionally; visibility lives entirely in the component, so a future caller doesn't have to duplicate the logic.

### Data path

- `GET /api/v1/athletes?paid=no` — the existing #105 server filter, no new endpoint needed.
- `meta.total` carries the cross-page count (works for academies with > 20 unpaid athletes, where page 1 only has the first 20).
- Body `data` truncated to top 5 names rendered inline; the "View all" CTA links to the full filtered list.

### UI shape

- Outer card is a plain `<div>` (not an `<a>`) because each row's name is its own deep-link anchor — nested `<a>` is invalid HTML and browsers silently un-nest. The bottom-of-card "View all" anchor covers the whole-tile click intent.
- Headline copy varies by state: empty (`"Everyone paid — nice month"`), one (`"1 athlete still owes"`), many (`"N athletes still owe"`), error (`"Couldn't check"` muted).
- CTA copy varies by truncation: when count > 5, `"View all N →"`; when count ≤ 5, `"View on the athletes list →"` (no truncation to call out).

### Date-gate test ergonomics

The component exposes a signal-typed `now: () => Date` provider. Default returns `new Date()`. Tests override it via `cmp.now.set(() => fixedDate)` so the chasing-threshold gate is **deterministic without patching the global Date constructor** — same testability win as `MonthlySummaryWidgetComponent` got from `vi.useFakeTimers()`, but more local and signal-friendly.

## Tests

8 vitest cases on the widget:

- **Visibility gates**: no fee → no render + no fetch; before the 16th → no render + no fetch; on the 16th boundary → renders + fetches (boundary inclusive).
- **Happy path**: 7 unpaid athletes → "7 athletes still owe" + 5 rows + "View all 7 →" CTA; 0 unpaid → "Everyone paid" muted state + no CTA; 1 unpaid → singular "athlete still owes" copy; 500 server response → muted error tile fallback; per-row deep-link `href` matches `/dashboard/athletes/:id/payments`.

Local gates: 410/410 vitest (was 402, +8), prettier + eslint clean.

## Out of scope (per the issue)

- Email reminders to unpaid athletes — defer; nuance about who receives the email needs preference UI.
- Multi-month historical view — covered by the per-athlete Payments tab.
- A "view paid" widget — there's no chasing pattern around "athlete paid", so no widget there.
- Server-side denormalised count endpoint — the page-1 + meta.total path already gives us the count; defer until cardinality actually bites.

## References

- Closes #283
- Mirror tile: `client/src/app/shared/components/monthly-summary-widget/`
- Filter reuse: #105 `paid=no` server filter
- Per-athlete deep-link target: #260 Payments tab
