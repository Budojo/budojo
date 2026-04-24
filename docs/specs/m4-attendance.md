# M4 — Attendance (PRD)

> Status: Draft · Owner: m-bonanno · Target release: M4 (4 phased PRs)
> Supersedes the M4 one-liner on the README roadmap.

## Problem Statement

BJJ instructors today track who comes to class in a spreadsheet, a paper ledger behind the counter, or, honestly, their memory. None of those scale past about 30 athletes, and all of them break the moment the owner wants to answer a simple question: "has Marco trained enough this month to be on track for a blue belt?" or "who haven't we seen in three weeks?". The act of checking people in during class is itself clumsy in Excel — scrolling a phone screen in one hand, trying to tick cells in portrait mode, between rounds.

This problem is recurring: every training session, every month-end review, every parent who asks about their kid's consistency. Not solving it keeps Budojo at "document tracker" instead of "the app my instructor opens on the mat".

## Goals

1. An instructor can mark a full class of 20 athletes present in under 90 seconds on a phone. Measured end-to-end from opening the attendance page to the last check-in.
2. An instructor can answer "who came this month?" in under 3 seconds by glancing at a single dashboard surface.
3. An instructor can pull up Marco's attendance history for any month in the last year in two taps from the athlete list.
4. The feature is adopted by more than 60% of active academies at least 3 times per week in the first month after launch.
5. The data model supports a future athlete-facing view without schema migration.

## Non-Goals

1. **Class / session scheduling.** No recurring classes, no morning vs. evening differentiation, no "kids 17:00" calendar. A record is a date plus an athlete. Scheduling is an M6+ concern that needs its own PRD.
2. **Nuanced attendance states.** No late, no absent, no half-session, no "tapped out early". Either an athlete is in the `attendance_records` table for that day or they are not. If usage reveals a real need, revisit.
3. **Belt-promotion logic.** "Marco trained 12 days this month therefore eligible" is not in this scope. The count is available; the eligibility decision stays in M6.
4. **Excel import.** Academies onboarding to Budojo start fresh. The import pain is real but not blocking; deferred until there is evidence the cold-start cost actually kills adoption.
5. **Multi-instructor collaboration.** Two instructors editing today's attendance from two phones is not supported, not diagnosed, not conflict-resolved. Assume one instructor, one device per session.
6. **Offline check-in.** The PWA scaffold caches the app shell but write-sync for attendance is not implemented. Revisit when real wifi-failure reports land.
7. **Notifications.** "Marco hasn't shown up in 2 weeks, nudge him" is M5.

## User Stories

### Instructor / academy owner (primary)

- As an instructor, I want to open an attendance page on my phone during class and tap each athlete as they arrive, so that I am done before the class even starts.
- As an instructor, I want to mark several athletes present in one gesture (or, failing that, one tap per row), so that checking in a class of 20 does not take longer than the warm-up.
- As an instructor, I want to un-mark someone I tapped by mistake within a few seconds of the mistake, without navigating to a different screen.
- As an instructor, I want to backfill attendance for a class I forgot to check in, as long as it is in the last week.
- As an instructor, I want to see a monthly count of training days per athlete at a glance, so that I can spot patterns (rising stars, drop-offs) without scrolling through individual histories.
- As an instructor, I want to open Marco's profile and see his attendance history as a calendar, so that when he asks "am I on track?" I answer with data.
- As an instructor, I want the dashboard to tell me at a glance how much my academy trained this month.

### Athlete (secondary, no UI yet)

- As an athlete, in the future, I want to see my own attendance history so that I know when I need to show up more. The data model supports this without schema change; no UI ships in M4.

## Requirements

Organized into four phased P0 blocks that map to four pull requests. P1 items are fast-follow candidates. P2 items are architectural insurance.

### P0 — Must have

#### P0.1 — Data model

The `attendance_records` table:

```
attendance_records
- id (pk, bigint)
- athlete_id (fk athletes.id, cascade on delete, index)
- attended_on (date, not null, index)
- notes (text, nullable, max 500 chars)
- created_at, updated_at
- deleted_at (SoftDeletes)

UNIQUE (athlete_id, attended_on) where deleted_at IS NULL
Index (attended_on)
Index (athlete_id, attended_on)
```

The uniqueness constraint is conditional on `deleted_at IS NULL` so that correcting a mistaken record by soft-deleting the first one and inserting a correct one does not trip a duplicate-key error.

Given the instructor marks Marco present on 2026-04-24
When they accidentally mark him again on the same day
Then the second request is treated as a no-op, not a validation error.

Given an attendance record was soft-deleted
When the instructor creates a new record for the same athlete and date
Then the insert succeeds because the unique constraint only applies to active rows.

#### P0.2 — Backend CRUD API

Endpoints, all academy-scoped via athlete ownership. Same ownership pattern as documents.

- `GET /api/v1/attendance?date=YYYY-MM-DD` — cross-athlete list for that day. Default date is today. Returns the athletes present.
- `POST /api/v1/attendance` — bulk upsert. Body `{ date, athlete_ids: [17, 42, 99] }`. Idempotent.
- `DELETE /api/v1/attendance/{id}` — soft-delete a single record.
- `GET /api/v1/athletes/{athlete}/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` — per-athlete history, windowed by date range.
- `GET /api/v1/attendance/summary?month=YYYY-MM` — aggregate counts per athlete for the given month across the whole academy.

All responses soft-delete-filter by default. `?trashed=1` on the list endpoint opts into seeing tombstones.

Given a bulk POST with five athlete IDs
When one of them already has a record for that date
Then the request completes 200 OK, the existing record is preserved, and only the four new records are created.

Given an instructor from Academy A sends a bulk POST for an athlete from Academy B
When the controller validates ownership
Then the response is 403 Forbidden with the same `{"message":"Forbidden."}` body used by documents.

Given a bulk POST with a `date` seven days in the past
When the server evaluates the request
Then it accepts it (backfill within the window).

Given a bulk POST with a future `date`
When the server evaluates the request
Then it returns 422 with a validation error on the `date` field.

Given a GET `/attendance/summary?month=2026-04`
When the response is assembled
Then it lists only athletes with at least one attendance record that month, and each row carries `{ athlete_id, first_name, last_name, count }`.

#### P0.3 — Daily check-in UI, mobile-first

A new route `/dashboard/attendance` renders the `DailyAttendanceComponent`. The page is designed for a phone held one-handed on the mat.

- Default date is today. A date picker allows backfill up to seven days in the past and blocks future dates.
- The body is a list of the academy's active athletes. Each row is a full-width touch target that is either in the "present" state (checkmark, filled background) or "not recorded" state (outline only).
- A swipe-right on a row marks it present with an optimistic UI update; the POST fires in the background.
- A swipe-left on a marked row un-marks it, also optimistic, firing a DELETE.
- A tap on any row also toggles the state, for desktop and for accessibility parity (screen readers, users who prefer not to swipe).
- Every mark / unmark shows a toast with an "Undo" link, live for 5 seconds. Tapping Undo reverts the local state and sends the inverse API call. No new toast is emitted for the undo itself.
- If an API call fails, the local state rolls back and a failure toast replaces the success toast.

Given the instructor opens `/dashboard/attendance` for the first time that day
When the page renders
Then the date is today, every athlete row is in the "not recorded" state, and no network request has fired for marking yet.

Given the instructor swipes right on Marco's row
When the swipe gesture completes past the threshold
Then Marco's row flips to "present" immediately and a POST is sent in the background.

Given the swipe is intentionally cancelled mid-motion
When the user lifts their finger before the threshold
Then the row state does not change and no network request is sent.

Given the instructor swiped Marco by mistake
When they tap the "Undo" link in the toast within 5 seconds
Then Marco's row flips back to "not recorded" and a DELETE is sent for that record.

Given a user on desktop or on a screen reader
When they activate the row with tap, click, Enter, or Space
Then the row toggles state identically to the swipe behavior.

#### P0.4 — Per-athlete attendance history

A new tab appears on the `AthleteDetailComponent`, rendering `AttendanceHistoryComponent`. It shows a calendar grid of the current month with attended days highlighted. Prev and next month arrows allow navigation up to the athlete's creation date and not beyond today. Tapping an attended day shows the notes if any. The header displays the count of attended days for the visible month.

Given the instructor opens Marco's profile and taps the Attendance tab
When the component renders
Then a month-grid appears, days with a record are highlighted, and the count header reads correctly.

Given the displayed month has zero records for this athlete
When the component renders
Then the grid still draws correctly, no days are highlighted, and the count reads "0".

#### P0.5 — Monthly summary widget and page

A widget on the existing `/dashboard/athletes` page sits next to the expiring-documents widget shipped in M3.4. It shows, for the current calendar month, the top three athletes by attendance count and a single summary line ("N sessions across X athletes"). Clicking the widget navigates to `/dashboard/attendance/summary?month=YYYY-MM`, which shows the full table: one row per athlete with attendance in that month, sortable by count descending, clickable to jump to that athlete's history tab. The month selector on the summary page lets the instructor travel up to twelve months back.

Given the widget renders during a month where at least one athlete has attended
When the data loads
Then the top three athletes are listed with their counts, and the summary line is correct.

Given the month has zero records
When the widget renders
Then it shows a muted "No attendance recorded yet this month" state and the link still works (to an empty table).

Given the instructor is on the summary page and clicks on Anna Bianchi's row
When the navigation completes
Then the athlete detail Attendance tab is open with Anna's calendar for the currently-selected month.

### P1 — Nice to have, fast follows

- Gesture hint overlay on first visit of the attendance page ("swipe right to check in") that dismisses permanently after the first real swipe.
- Notes inline editing from the daily check-in UI: long-press on a marked row opens a textarea to add "30min private" or similar.
- Keyboard shortcut on desktop: number keys 1–9 to check in the nth athlete in the list.
- Summary page "compared to last month" column showing delta counts.

### P2 — Architectural insurance, no UI in M4

- Multi-record-per-day support: the unique constraint is on (athlete_id, attended_on); if the product pivots to morning/evening classes later, the index can be extended to include a session identifier without breaking current data.
- Athlete-facing view: a future `/portal/athlete/attendance` route can consume `GET /api/v1/athletes/{athlete}/attendance` with the athlete's own id, once athlete auth ships.
- CSV export: the summary endpoint returns JSON with all the fields needed; a CSV writer on the same query is a small follow-up with no schema impact.

## Success Metrics

### Leading indicators (measurable within the first four weeks)

- **Time-to-first-check-in per new academy**: median under 2 minutes from first login after M4 ships. Instrumented with a client-side timestamp event on route entry and on the first successful POST.
- **Time to check in 20 athletes** on mobile: under 90 seconds in a scripted Cypress run; verified manually on real phone during field test before launch.
- **Feature adoption rate**: more than 60% of academies active in the trailing seven days have at least one attendance record in that window, measured at 28 days post-launch.
- **Daily-check-in completion rate**: of academies that open the attendance page, more than 80% end the session with at least one record. Sessions opening but leaving with zero records signal confusion or discovery-only visits.

### Lagging indicators (measurable at 60 to 90 days)

- **Retention**: academies with at least one attendance record per week retain at 60 days at more than 2x the rate of academies using only M3 documents. Hypothesis to validate with real data.
- **Feature-mix breadth**: more than 40% of academies use attendance, documents, and athlete list weekly by day 60. Signal that Budojo is used as a system, not as a one-trick tool.
- **Support volume about attendance tracking**: zero tickets. If instructors ask for help, the UX failed.

## Open Questions

- **Time-of-day for check-in** (morning vs. evening class same day = two records?). Default answer for M4 is no, one record per athlete per day. Revisit when classes are modeled in M6+. Owner to resolve: product at that milestone.
- **QR-code scanning** for check-in. Default answer is no for M4. Reserve the top-right of the attendance header for a future "scan" button. Owner to resolve: design, when a scan-in flow is proposed.
- **Backfill cutoff**. M4 allows up to seven days back. Is that right? Not enough data to decide. Revisit after one month of real usage. Owner: product.
- **CSV export**. Default is no for M4. Add to M6 Reports alongside belt promotion history. Owner: product.
- **Offline check-in**. Default is no for M4. PWA cache is read-only. Revisit when the first real "I was in the basement and wifi dropped" report comes in. Owner: product + engineering when evidence arrives.
- **Notes discoverability**. If an instructor writes "30min private" on a Marco record, where does that notes text show up? In the calendar tooltip on M4.3, fine. But should it show in the summary table row? Engineering decision during M4.4 implementation; default is no, keep the table clean.

## Timeline Considerations

### Suggested phasing

- **M4.1 — Backend CRUD API**. Migration, model with SoftDeletes and the conditional unique constraint, five Actions (MarkAttendance, DeleteAttendance, GetDailyAttendance, GetAthleteAttendance, GetMonthlyAttendanceSummary), FormRequests, Resources, controller, routes. Full PEST feature coverage. Data model is final after this PR; subsequent PRs consume it.
- **M4.2 — Daily check-in UI**. The mobile-first bulk view. Swipe gestures with tap fallback. Optimistic UI with undo. This is the longest of the four because it is the only feature in the roadmap that needs gesture work; budget extra time.
- **M4.3 — Per-athlete history**. Calendar view in the athlete detail. Small PR.
- **M4.4 — Monthly summary**. Dashboard widget + full table page. Small PR. Ships the M4 milestone close to zero.

### Dependencies

- M3.5 (mobile shell + PWA) is shipped and merged; M4 UI assumes it.
- `AthleteDetailComponent` tab architecture from M3 is reused for M4.3.
- The dashboard widget slot added in M3.4 is the model for M4.4.
- No external vendor dependencies.

### Hard deadlines

None. M4 ships when it ships. Treat the 4-PR cadence as the target, adjust based on review feedback.
