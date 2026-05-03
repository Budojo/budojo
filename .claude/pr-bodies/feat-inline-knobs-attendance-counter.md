## What

Replaces the `8 / 9 · 87%` + thin linear progress bar on the athlete attendance tab with a single PrimeNG `<p-knob>` (circular meter) plus a small caption. Second slice of the stats-visualisation work the user asked for in the "facciamo i grafici" thread — first slice was #366 (the dedicated stats page).

## Why

You explicitly asked for visual UI components instead of textual readouts like "8/9" / "87%". The attendance tab is the most visible offender — opens for every athlete, displays both the count and the rate inline as plain text. A knob keeps both data points (the percentage in the centre, the absolute "8 / 9 days" caption alongside) but reads at a glance, in a Norman-feedback sense — the user's eye lands on the ring before the text.

The knob is `[readonly]="true"` so it's display-only, not an interactive control. ARIA is preserved via PrimeNG's built-in semantics (knob carries its own role + value).

## How

`features/athletes/detail/attendance-history/`

### `attendance-history.component.ts`

- Added `KnobModule` (PrimeNG knob) + `FormsModule` (knob's `[ngModel]` binding) to the imports.
- `progressBarWidth()` and `ariaValueNow()` computeds **kept**: the knob still receives `ariaValueNow()` (clamped to `[0,100]`) so the ARIA contract on the meter rejects out-of-range values like the previous progress bar's `aria-valuemax="100"` did. `progressBarWidth()` is now unused but I'm leaving it for one PR cycle in case the knob doesn't ship cleanly to prod and we need to revert quickly — will delete in a follow-up.

### `attendance-history.component.html`

```diff
- <p class="attendance-history__counter" data-cy="attendance-counter">
-   <span class="attendance-history__counter-numbers">
-     {{ 'athletes.detail.attendance.daysFormat' | translate: { … } }}
-   </span>
-   <span class="attendance-history__counter-pct" data-cy="attendance-rate-pct">
-     · {{ ratePercent() }}%
-   </span>
- </p>
- @if (progressBarWidth(); as w) {
-   <div class="attendance-history__progress" role="progressbar" …>
-     <div class="attendance-history__progress-fill" [style.width]="w"></div>
-   </div>
- }
+ <div class="attendance-history__rate" data-cy="attendance-counter">
+   <p-knob
+     [ngModel]="ariaValueNow()"
+     [readonly]="true"
+     [size]="100"
+     [strokeWidth]="10"
+     [valueTemplate]="'{value}%'"
+     data-cy="attendance-rate-knob"
+   />
+   <span class="attendance-history__rate-detail" data-cy="attendance-rate-detail">
+     {{ 'athletes.detail.attendance.daysFormat' | translate: { attended, scheduled } }}
+   </span>
+ </div>
```

The bare-count fallback (used when `training_days` isn't configured and `ratePercent()` returns null) stays as plain text — there's no rate to ring-meter when no schedule exists.

### `attendance-history.component.scss`

- Removed the old `.__progress` / `.__progress-fill` rules that drove the linear progress bar.
- Replaced with `.__rate` (flex row, knob + caption, wraps below tablet) and `.__rate-detail` (muted-text caption).
- Kept `.__counter` rule but tightened its purpose to "bare-count fallback" — the knob path doesn't go through it anymore.

## Out of scope

- **`monthly-summary` page** uses the same "X / Y days" pattern — same treatment goes there in a follow-up. Keeping this PR scoped to the per-athlete attendance tab to limit the review surface.
- **Belt + status numeric badges in the athletes list**, **payments tab**, etc. — separate visualisation passes; this PR is the one Copilot/user-visible "8/9 87%" call-out.
- **Trend charts** (attendance / revenue over 12 months) — needs `/api/v1/stats/*` server endpoints, separate PR-C.

## References

- Triggered by the chat brief — "magari anche da altre parti dove possiamo usare qualche libreria UI invece che mostrare il testo 8/9 87%".
- Builds on #366 (the stats page that introduced `<p-chart>` for doughnuts; this PR introduces `<p-knob>` for the gauge family).

## Test plan

- [ ] CI green
- [x] Vitest 428/428 still passes — no spec touched the inline `attendance-rate-pct` / `attendance-progress` `[data-cy]` hooks (verified by grepping cypress + .spec.ts)
- [x] ESLint clean
- [ ] Smoke on the athlete attendance tab post-merge:
  - [ ] Knob renders with the integer percentage in the centre, EUR-friendly stroke
  - [ ] "X / Y days" caption sits to the right of the knob on desktop, below it on mobile
  - [ ] Bare-count fallback (academy with `training_days = null`) still reads as plain text
  - [ ] Toggle language → "X / Y giorni" in IT
  - [ ] Tab key navigation skips the knob (it's readonly, not focusable as a control)
