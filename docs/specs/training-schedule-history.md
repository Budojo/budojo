# PRD — Training-schedule history (#1094)

**Status**: drafted 2026-05-28, awaiting PR-1 implementation.

## Why

`academies.training_days` is a single mutable JSON array of Carbon weekday ints (0=Sun…6=Sat). When the academy owner changes it (e.g. Tue/Thu → Mon/Wed/Fri starting June 1), the change is destructive — there is no history. Concretely:

- `attendance_records` are date-stamped + correct (the FACTS are preserved).
- But every *derived* count that asks "how many lesson days were scheduled in May?" recomputes against the **current** `training_days`, not the schedule that was actually in effect in May.
- Affected surfaces: athletes-detail `attendance-history`, attendance `monthly-summary`, dashboard `monthly-summary-widget`, athlete-portal `my-attendance` (all consume `countScheduledTrainingDays` in `client/src/app/shared/utils/attendance-rate.ts`).

The bug isn't in the data — it's in the **denominator**.

## Goal

For any date `d`, "the schedule that was in effect on `d`" is a stable, knowable thing. Past months' percentages recalculate correctly after a schedule change. The owner UI stays simple — they only ever see "current schedule" and (optionally) "next change."

## Non-goals

- Multiple stacked pending future versions (e.g. "from June Mon/Wed/Fri, from September Tue/Thu/Sat"). Only one upcoming change at a time, by decision in #1094.
- Retroactive editing of past schedules (correcting an old period after its `effective_from` has passed). Past rows are frozen.
- Per-class schedules (separate days for kids vs adults, weekend seminars on top of the weekly grid).

---

## Data model

New table `academy_schedules`:

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `academy_id` | bigint fk → `academies.id`, cascade delete | |
| `training_days` | json (nullable) | `list<int>` Carbon dayOfWeek ints (0=Sun…6=Sat). `null` ≡ "schedule not configured" (parity with today's nullable `academies.training_days`). |
| `effective_from` | date (not null) | The day this schedule starts applying. Inclusive. |
| `created_at`, `updated_at` | timestamps | |

Indexes / constraints:

- Unique on `(academy_id, effective_from)` — at most one schedule transition per academy per day.
- Application-level (PEST + FormRequest) constraint: per academy, at most **one** row with `effective_from > today`. The "current" schedule is the row with the latest `effective_from <= today`.
- Cascade delete with `academies`.

Backfill (in the same migration, post-create):

```php
DB::table('academies')
    ->orderBy('id')
    ->chunkById(500, function ($rows) {
        foreach ($rows as $a) {
            DB::table('academy_schedules')->insert([
                'academy_id'     => $a->id,
                'training_days'  => $a->training_days, // already JSON; copy as-is
                'effective_from' => $a->created_at->toDateString(),
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);
        }
    });
```

Decision: **keep** `academies.training_days` as a denormalised "current-schedule cache" for now. Reads of "what is the schedule today?" still go through the column → no FE-wide refactor in PR 1. PR 3 rewrites the FE util to take a schedule **history** for date-aware lookups; the column stays valid as the convenience accessor for "right now."

Future tightening (deferred): a daily cron flips `academies.training_days` to the next-pending row's value when its `effective_from` arrives. For PR 1 we update the column synchronously inside the same transaction that inserts a `academy_schedules` row whose `effective_from <= today`. (Insert with a future `effective_from` doesn't touch the column yet — the column reflects "today.")

---

## API surface

All under the academy-scoped owner namespace; mirrors existing `PATCH /api/v1/academy` conventions for auth + envelope.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| `GET` | `/api/v1/academy/schedules` | — | `{ data: AcademySchedule[] }` ordered `effective_from DESC` | History + the optional pending future row |
| `POST` | `/api/v1/academy/schedules` | `{ training_days: int[] | null, effective_from: 'YYYY-MM-DD' }` | The created row | `effective_from` must be `>= today`. Rejects if a pending future row already exists (one-at-a-time rule). |
| `PATCH` | `/api/v1/academy/schedules/{id}` | `{ training_days?, effective_from? }` | The updated row | Only the **pending future** row is editable. 422 otherwise. |
| `DELETE` | `/api/v1/academy/schedules/{id}` | — | 204 | Only the pending future row is deletable. 422 otherwise (history is frozen). |

Existing `PATCH /api/v1/academy` keeps accepting `training_days` as a top-level field for backward compat, but a write there now **inserts a row** with `effective_from = today` instead of overwriting. The "old" payload semantics survive — the call still works — but its persistence path is the new one. Deprecation note in the OpenAPI for clients to migrate to the schedules endpoint.

`AcademyResource` adds:

```json
{
  "id": 1,
  "name": "…",
  "training_days": [1, 3, 5],         // unchanged — "current" cache
  "current_schedule": {                // new
    "id": 42,
    "training_days": [1, 3, 5],
    "effective_from": "2026-06-01"
  },
  "next_schedule": {                   // new — null when no pending change
    "id": 47,
    "training_days": [2, 4],
    "effective_from": "2026-09-01"
  }
}
```

---

## FE behaviour

### Settings UI

`academy/settings` (or wherever the existing training-days form lives — to be located in PR 2):

- **Current schedule**: "Lun · Mer · Ven (in vigore dal 01/06/2026)" — read-only summary.
- **Pending change** (only when `next_schedule` exists):
  - "Prossimo cambio: Mar · Gio dal 01/09/2026"
  - `[Modifica]` and `[Annulla]` buttons.
- **Plan a change** (only when `next_schedule` is null):
  - `[Pianifica cambio]` button → opens a form: weekday picker + date picker (`effective_from`, minimum = today).

Editing the current schedule directly is **deprecated in the UI** — owners are nudged toward "plan a change effective from today" instead. Avoids the foot-gun of accidentally rewriting history.

### `countScheduledTrainingDays` rewrite (PR 3)

New signature:

```ts
export function countScheduledTrainingDays(
  schedules: readonly { trainingDays: number[] | null; effectiveFrom: string }[],
  year: number,
  month: number,
  today: Date = new Date(),
): number | null
```

`schedules` is the full history ordered `effectiveFrom DESC` (so `schedules[0]` is current / most-recent-applicable). For each calendar day of the (year, month) up to `today`, find the schedule with the largest `effectiveFrom <= dayDate` and check membership in `trainingDays`.

Mid-month change (decided behaviour): June 1-14 against the old schedule, June 15-30 against the new. The function sums both segments transparently — there is no per-segment branching in the consumer code.

### Consumers (PR 3)

| File | Today | After |
|---|---|---|
| `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts` | Passes `academy.training_days` | Passes the schedule history (from the AcademyResource) |
| `client/src/app/features/attendance/summary/monthly-summary.component.ts` | Same | Same |
| `client/src/app/shared/components/monthly-summary-widget/monthly-summary-widget.component.ts` | Same | Same |

The schedule history comes from `AcademyService` — needs a new field or a separate getter (TBD in PR 2). One source of truth: the FE shouldn't recompute the "is this day a training day?" predicate; it always asks `countScheduledTrainingDays` (or a sibling `isTrainingDay(schedules, date)` helper added in the same PR).

---

## Edge cases

- **`training_days` is null** (academy hasn't configured yet) — the schedule row stores `null`. `countScheduledTrainingDays` returns `null` for any month entirely covered by a null schedule. Mid-month with one segment null: the null segment doesn't contribute days (denominator from the non-null segment only).
- **No pending change, user adds one with `effective_from = today`** — accepted. Sets the column synchronously.
- **User edits the pending change's `effective_from`** — allowed as long as the new date is still `>= today`. If they move it to a past date, 422 (would silently rewrite history).
- **User deletes the pending change** — fine; `current_schedule` stays in effect indefinitely.
- **Academy created before this feature shipped, `training_days` is `null`** — backfill row is `training_days = null, effective_from = academy.created_at`. Identical observed behaviour.
- **`schedules[]` empty** (shouldn't happen post-backfill, but defensive) — `countScheduledTrainingDays` returns `null` (treat as "schedule not configured").

---

## Implementation slices

### PR 1 — BE (this epic's first PR)

- Migration: create `academy_schedules` + backfill from `academies`.
- `AcademySchedule` model + `Academy::schedules()` hasMany + `Academy::scheduleForDate($date)` helper.
- `AcademyController` schedule endpoints (list / create / edit / delete) + FormRequests.
- `AcademyResource` exposes `current_schedule` + `next_schedule`. Existing `training_days` field unchanged (current-cache).
- Update existing `PATCH /api/v1/academy` so a `training_days` write inserts a row with `effective_from = today` instead of overwriting.
- PEST feature tests: backfill, list, create-with-future-date, reject-stacked-future, edit-pending, delete-pending, reject-edit-past, schedule-for-date helper.

### PR 2 — FE settings UI

- Read `current_schedule` + `next_schedule` from `AcademyResource`.
- Render summary + planning form.
- Wire `[Pianifica cambio]` to `POST /api/v1/academy/schedules`; `[Modifica]` to `PATCH`; `[Annulla]` to `DELETE`.
- Vitest + Cypress for the planning flow.

### PR 3 — FE consumer rewrite

- Rewrite `countScheduledTrainingDays` to take a schedule history (signature above).
- Adapt the 3 consumers (`attendance-history`, `monthly-summary`, `monthly-summary-widget`).
- Add `isTrainingDay(schedules, date)` sibling helper for per-day predicates if needed by attendance heat-maps.
- Vitest: mid-month segment math, null-schedule branches, the no-change-yet case.

### PR 4 — Cypress E2E + docs

- Cypress: owner schedules a change effective from a future date; navigate past month → old denominator; navigate future month → new denominator.
- `docs/entities/academy-schedule.md` (new).
- `docs/entities/academy.md` — update `training_days` row to point to the schedule history.
- `docs/api/v1.yaml` — schedule endpoints + AcademyResource shape change.

---

## Open items (raise before / during PR 1)

- **Cron job for the "today reached, flip the cache" transition** — the deferred future row. PR 1 takes the synchronous-on-insert path; the cron version becomes its own ticket once we see the prod usage.
- **Auth scoping**: the schedule endpoints inherit the existing academy ownership rules. Single-owner-per-academy today (per #1010 PII context). Multi-owner is `#747` adjacent — when that ships, schedule writes need re-scoping.
- **Default `effective_from` in the FE form** — first of next month? Today + 7 days? Decided in PR 2 with the UX once the form lands.
