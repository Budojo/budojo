# Entity — `AcademyClosure`

## Purpose

The days an academy is shut (#1766): the summer break, Christmas, a seminar weekend. Before this table nothing in Budojo could say so. Mid-August read as twelve sessions the whole roster had missed, and the missed-streak alert fired for everyone.

A closure only ever **subtracts**: a day inside one is not a scheduled training day, whatever the weekly pattern says. It is never modelled as a schedule row with no training days. That would make the weekly pattern come back wrong on the other side of the closure; `academies.training_days` and `academy_schedules` keep describing the pattern.

## Schema — `academy_closures`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete | Owner academy |
| `starts_on` | date | not null | First closed day, stored `Y-m-d` |
| `ends_on` | date | not null | Last closed day, **inclusive**, stored `Y-m-d`; equal to `starts_on` for a single day |
| `label` | string(80) | nullable | "Chiusura estiva" |
| `created_at` / `updated_at` | timestamp | nullable | |

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(academy_id, starts_on)`

## Relations

- `belongsTo(Academy::class)`; the inverse is `Academy::closures()`

## Business rules

- **Whole days.** A closure covers every class of every day in its range. Cancelling one class of one evening is a different feature. Do not add an `academy_class_id` here, or the attendance denominator stops being about days.
- **Inclusive range**, `ends_on >= starts_on`, enforced by the FormRequest (422 otherwise).
- **Overlaps are allowed** and mean nothing more: a day is shut or it is not.
- **Read through `App\Support\ScheduledDays`**, which removes closed days from every window it returns (`between`, `countBetween`, `isScheduledOn`, `lastBefore`). A window that is all closure counts **zero**, not unknown. The schedule is configured; the academy was just shut.
- **A presence on a closed day still counts** in the numerator: an open mat during the break is real training, and a rate may exceed 100% for off-schedule sessions; it is not clamped.
- **The missed-streak alert** reads its last three sessions through `ScheduledDays::lastBefore()`, so it walks over a closure instead of into it. After a break longer than its 30-day reach it stays quiet until three sessions have been held again.
- **Every denominator is the server's** (#1767–#1769): the month summary, the roster and the athlete tab all divide by `ScheduledDays`, closures out. On the client, `closureOn()` in `training-days.ts` only paints: the athlete calendar shows a closed day as "not a training day" and lists the month's closures under its legend, and the check-in lands on the last session actually held and says the academy is closed today.
- **Dates stay `Y-m-d` strings**, uncast, so they compare as dates in SQLite's TEXT, as `academy_schedules.effective_from` does.

## API surface

- `GET /api/v1/academy/closures`: requires `academy_settings_read`.
- `POST /api/v1/academy/closures`, `PATCH|DELETE /api/v1/academy/closures/{closure}`: require `academy_settings_update`, the timetable's gate. Another academy's closure is a 403.
- `GET /api/v1/academy` carries `closures: [{id, starts_on, ends_on, label}]` in date order, for the calendar and the check-in.

## Related

- [`academy.md`](./academy.md): owning entity
- [`academy-schedule.md`](./academy-schedule.md): the weekly pattern closures take days out of
- [`attendance-record.md`](./attendance-record.md): the numerator the scheduled days divide
