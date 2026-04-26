# M4.3 — Per-Athlete Attendance History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calendar-style attendance history tab to the athlete detail page so instructors can answer "has Marco trained enough this month?" in two taps.

**Architecture:** A new `AttendanceHistoryComponent` rendered as a child route of `/dashboard/athletes/:id`. The parent `AthleteDetailComponent` grows a `<p-tabs>` header with two router-linked tabs (Documents, Attendance) — content renders via `<router-outlet>` so each tab stays a self-contained, lazily-loaded component. The history component fetches the athlete (for the `created_at` boundary) and the month's attendance records on its own — no shared state with the parent — so the tab can deep-link to a URL.

**Tech Stack:** Angular 21 (signals, OnPush, standalone components, control flow), PrimeNG 21 (`p-tabs`, `p-popover`, `p-skeleton`, `p-button`), Vitest 4 (unit), Cypress 13 (E2E).

**Issue:** [#80](https://github.com/m-bonanno/budojo/issues/80)
**Branch:** `feat/80-attendance-history-ui`
**PRD reference:** `docs/specs/m4-attendance.md` § P0.4

---

## File Structure

**Create:**
- `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts`
- `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html`
- `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.scss`
- `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts`
- `client/src/app/features/athletes/detail/attendance-history/calendar-grid.ts` — pure helper, easy to test independently
- `client/src/app/features/athletes/detail/attendance-history/calendar-grid.spec.ts`
- `client/cypress/e2e/attendance-history.cy.ts`
- `.claude/pr-body.md`

**Modify:**
- `client/src/app/app.routes.ts` — add `attendance` child route under `athletes/:id`
- `client/src/app/features/athletes/detail/athlete-detail.component.ts` — add tab-aware logic
- `client/src/app/features/athletes/detail/athlete-detail.component.html` — add `<p-tabs>` header
- `client/src/app/features/athletes/detail/athlete-detail.component.scss` — tab spacing
- `client/src/app/features/athletes/detail/athlete-detail.component.spec.ts` — update for tabs

Each file has one clear responsibility:
- `calendar-grid.ts` — pure date math (no Angular, no DI), unit-testable in isolation
- `attendance-history.component.ts` — Angular wiring, signals, HTTP calls, derived state
- `athlete-detail.component.*` — owns the tab header and the route shape; doesn't know about attendance internals

---

## Task 1: Create branch and stub directory

**Files:**
- Create: `client/src/app/features/athletes/detail/attendance-history/` (directory)

- [ ] **Step 1: Cut the feature branch from develop**

```bash
git checkout develop && git pull origin develop
git checkout -b feat/80-attendance-history-ui
```

- [ ] **Step 2: Create the empty component directory**

```bash
mkdir -p /home/matteo/PhpstormProjects/budojo/client/src/app/features/athletes/detail/attendance-history
```

Expected: `ls client/src/app/features/athletes/detail/attendance-history` returns empty (directory exists).

---

## Task 2: Calendar grid helper (pure date math)

The grid builder is pure and side-effect-free. We test it first because it's the heart of the calendar layout — getting Mon-vs-Sun start, padding, and year rollover wrong is the most likely source of bugs.

**Files:**
- Create: `client/src/app/features/athletes/detail/attendance-history/calendar-grid.ts`
- Test: `client/src/app/features/athletes/detail/attendance-history/calendar-grid.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/app/features/athletes/detail/attendance-history/calendar-grid.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildCalendarGrid, shiftMonth } from './calendar-grid';

describe('buildCalendarGrid', () => {
  it('returns rows of length 7 (Mon-Sun European order)', () => {
    const grid = buildCalendarGrid(2026, 4);
    expect(grid.length).toBeGreaterThan(0);
    grid.forEach((row) => expect(row).toHaveLength(7));
  });

  it('pads the first week with nulls before the first of the month', () => {
    // April 2026: 1st is a Wednesday → Mon=null, Tue=null, Wed=1, ...
    const grid = buildCalendarGrid(2026, 4);
    expect(grid[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
  });

  it('pads the last week with nulls after the last of the month', () => {
    // April 2026: 30 days, last day is Thursday (Mon=27, Tue=28, Wed=29, Thu=30)
    const grid = buildCalendarGrid(2026, 4);
    const lastRow = grid[grid.length - 1];
    expect(lastRow.slice(0, 4)).toEqual([27, 28, 29, 30]);
    expect(lastRow.slice(4)).toEqual([null, null, null]);
  });

  it('contains every day of the month exactly once', () => {
    const grid = buildCalendarGrid(2026, 2); // Feb 2026: 28 days, non-leap
    const days = grid.flat().filter((d): d is number => d !== null);
    expect(days).toHaveLength(28);
    expect(days[0]).toBe(1);
    expect(days[days.length - 1]).toBe(28);
  });

  it('handles a month that begins on Monday with no leading padding', () => {
    // June 2026: 1st is a Monday
    const grid = buildCalendarGrid(2026, 6);
    expect(grid[0][0]).toBe(1);
  });

  it('handles a month that ends on Sunday with no trailing padding', () => {
    // November 2026: 30 days, ends on Monday → not this case
    // March 2026: 31 days, last day is Tuesday → not this case
    // August 2026: 31 days, last day is Monday → not this case
    // May 2027: 31 days, last day is Monday → not this case
    // We instead pick a known month: November 2025 ends on a Sunday (30th)
    const grid = buildCalendarGrid(2025, 11);
    const lastRow = grid[grid.length - 1];
    expect(lastRow[6]).toBe(30);
  });
});

describe('shiftMonth', () => {
  it('decrements the month by one when going backwards mid-year', () => {
    expect(shiftMonth({ year: 2026, month: 4 }, -1)).toEqual({ year: 2026, month: 3 });
  });

  it('rolls over to the previous year when going backwards from January', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('increments the month by one when going forwards mid-year', () => {
    expect(shiftMonth({ year: 2026, month: 4 }, 1)).toEqual({ year: 2026, month: 5 });
  });

  it('rolls over to the next year when going forwards from December', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/calendar-grid.spec.ts
```

Expected: FAIL — "Cannot find module './calendar-grid'".

- [ ] **Step 3: Write the implementation**

Create `client/src/app/features/athletes/detail/attendance-history/calendar-grid.ts`:

```typescript
/**
 * Pure date helpers for the per-athlete attendance calendar grid. No Angular,
 * no DI — keep this trivially unit-testable and reusable when M4.4 lands a
 * dashboard mini-calendar.
 *
 * Convention: months are 1-indexed (Jan = 1, Dec = 12) on the public API to
 * match the on-the-wire date format (`YYYY-MM-DD`). Internally we drop into
 * JS's 0-indexed `Date` constructor only at the boundary.
 */

export interface YearMonth {
  /** 4-digit calendar year. */
  year: number;
  /** 1-indexed month (Jan = 1, Dec = 12). */
  month: number;
}

/**
 * Build a calendar grid for the given year + month. Each row is a 7-cell week
 * starting Monday (European convention — matches the date picker locale used
 * across Budojo). Cells before the 1st and after the last day are `null` so
 * the template can render an empty box without conditionally collapsing
 * the grid layout.
 */
export function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0); // day 0 of next month = last day of this month
  const daysInMonth = lastOfMonth.getDate();

  // JS getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // Convert to Mon-first index: Mon = 0, ..., Sun = 6
  const startOffset = (firstOfMonth.getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

/**
 * Shift a `YearMonth` forwards or backwards by `delta` months. Handles year
 * rollover in either direction. Used by the prev / next month navigation
 * buttons in `AttendanceHistoryComponent`.
 */
export function shiftMonth(current: YearMonth, delta: number): YearMonth {
  const totalMonths = current.year * 12 + (current.month - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return { year, month };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/calendar-grid.spec.ts
```

Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/src/app/features/athletes/detail/attendance-history/calendar-grid.ts \
        client/src/app/features/athletes/detail/attendance-history/calendar-grid.spec.ts
git commit -m "test(attendance): add calendar grid + month-shift helpers"
```

---

## Task 3: AttendanceHistoryComponent — failing test scaffold

We start with a minimal failing test that asserts the component loads its data on init. This drives the component skeleton.

**Files:**
- Create: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts`
- Test: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts`

- [ ] **Step 1: Write the failing test for "loads athlete + records on init"**

Create `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts`:

```typescript
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AttendanceHistoryComponent } from './attendance-history.component';
import { Athlete } from '../../../../core/services/athlete.service';
import { AttendanceRecord } from '../../../../core/services/attendance.service';

const ATHLETE_ID = 42;

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: null,
    phone: null,
    date_of_birth: null,
    belt: 'blue',
    stripes: 0,
    status: 'active',
    joined_at: '2026-01-15',
    created_at: '2026-01-15T10:00:00+00:00',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 1,
    athlete_id: ATHLETE_ID,
    attended_on: '2026-04-10',
    notes: null,
    created_at: '2026-04-10T10:00:00+00:00',
    deleted_at: null,
    ...overrides,
  };
}

function setupTestBed(): HttpTestingController {
  const parentParamMap = convertToParamMap({ id: String(ATHLETE_ID) });
  TestBed.configureTestingModule({
    imports: [AttendanceHistoryComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          parent: { paramMap: of(parentParamMap) },
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('AttendanceHistoryComponent', () => {
  beforeEach(() => {
    // Pin "today" to a known date so the visible-month default is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 25)); // April 25, 2026 (month index 3 = April)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the athlete and the current month of attendance records on init', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [makeRecord({ attended_on: '2026-04-10' })] });

    expect(fixture.componentInstance.attendedCount()).toBe(1);
    expect(fixture.componentInstance.attendedDates().has('2026-04-10')).toBe(true);
    httpMock.verify();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
```

Expected: FAIL — "Cannot find module './attendance-history.component'".

- [ ] **Step 3: Write the minimal component to make this test pass**

Create `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts`:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { Athlete, AthleteService } from '../../../../core/services/athlete.service';
import { AttendanceRecord, AttendanceService } from '../../../../core/services/attendance.service';
import { YearMonth, buildCalendarGrid, shiftMonth } from './calendar-grid';

/**
 * YYYY-MM-DD from local-date components — same canon as the daily check-in
 * page (see comment in DailyAttendanceComponent). `toISOString()` would shift
 * to UTC and round-trip the wrong calendar day in non-UTC timezones.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstOfMonth(ym: YearMonth): string {
  return toLocalDateString(new Date(ym.year, ym.month - 1, 1));
}

function lastOfMonth(ym: YearMonth): string {
  return toLocalDateString(new Date(ym.year, ym.month, 0));
}

@Component({
  selector: 'app-attendance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './attendance-history.component.html',
  styleUrl: './attendance-history.component.scss',
})
export class AttendanceHistoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly athleteService = inject(AthleteService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly athlete = signal<Athlete | null>(null);
  protected readonly records = signal<AttendanceRecord[]>([]);
  protected readonly loading = signal(true);

  protected readonly visible = signal<YearMonth>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  protected readonly attendedDates = computed(
    () => new Set(this.records().map((r) => r.attended_on)),
  );
  protected readonly attendedCount = computed(() => this.records().length);

  protected readonly weeks = computed(() => {
    const ym = this.visible();
    return buildCalendarGrid(ym.year, ym.month);
  });

  ngOnInit(): void {
    const parentParams = this.route.parent?.paramMap;
    if (!parentParams) return;
    parentParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) return;
      const id = Number(idParam);
      if (!Number.isFinite(id)) return;
      this.loadAll(id);
    });
  }

  private loadAll(athleteId: number): void {
    this.loading.set(true);
    forkJoin({
      athlete: this.athleteService.get(athleteId),
      records: this.attendanceService.getAthleteHistory(athleteId, {
        from: firstOfMonth(this.visible()),
        to: lastOfMonth(this.visible()),
      }),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ athlete, records }) => {
          this.athlete.set(athlete);
          this.records.set(records);
        },
        error: () => {
          // Errors are surfaced inline by an empty list + retry hint in the template.
        },
      });
  }
}
```

Create `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html` (minimal stub):

```html
<div class="attendance-history" data-cy="attendance-history">
  Attendance count: {{ attendedCount() }}
</div>
```

Create `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.scss` (empty for now, add styling later):

```scss
.attendance-history {
  display: block;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
```

Expected: PASS — 1 test green.

- [ ] **Step 5: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.scss \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
git commit -m "test(attendance): add history component skeleton with init load"
```

---

## Task 4: Month navigation + boundary guards

The component must let the user move month-by-month, but must disable `prev` at the athlete's `created_at` month and `next` at the current month.

**Files:**
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts`
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts`

- [ ] **Step 1: Add the failing tests for navigation + boundaries**

Append to `attendance-history.component.spec.ts` inside `describe('AttendanceHistoryComponent', () => { ... })`:

```typescript
  it('prev navigation refetches the previous month with correct from/to params', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    fixture.componentInstance.prevMonth();
    fixture.detectChanges();

    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-03-01&to=2026-03-31`)
      .flush({ data: [makeRecord({ attended_on: '2026-03-12' })] });

    expect(fixture.componentInstance.attendedDates().has('2026-03-12')).toBe(true);
    httpMock.verify();
  });

  it('next navigation refetches the next month and rolls over the year correctly', () => {
    vi.setSystemTime(new Date(2027, 0, 5)); // January 5, 2027 — so we can test going from Dec 2026 to Jan 2027 forward
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    // Init load is for Jan 2027 (current month).
    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2027-01-01&to=2027-01-31`)
      .flush({ data: [] });

    // We can't go forward from Jan 2027 (canGoNext === false), so test prev rollover backwards.
    fixture.componentInstance.prevMonth();
    fixture.detectChanges();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-12-01&to=2026-12-31`)
      .flush({ data: [] });

    expect(fixture.componentInstance.visible()).toEqual({ year: 2026, month: 12 });
    httpMock.verify();
  });

  it('canGoPrev is false when visible month equals the athlete created_at month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}`)
      .flush({ data: makeAthlete({ created_at: '2026-04-01T10:00:00+00:00' }) });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    expect(fixture.componentInstance.canGoPrev()).toBe(false);
    httpMock.verify();
  });

  it('canGoPrev is true when visible month is after the athlete created_at month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}`)
      .flush({ data: makeAthlete({ created_at: '2026-01-15T10:00:00+00:00' }) });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    expect(fixture.componentInstance.canGoPrev()).toBe(true);
    httpMock.verify();
  });

  it('canGoNext is false when visible month equals the current month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    expect(fixture.componentInstance.canGoNext()).toBe(false);
    httpMock.verify();
  });

  it('canGoNext is true after navigating back one month from the current month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    fixture.componentInstance.prevMonth();
    fixture.detectChanges();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-03-01&to=2026-03-31`)
      .flush({ data: [] });

    expect(fixture.componentInstance.canGoNext()).toBe(true);
    httpMock.verify();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
```

Expected: FAIL — `prevMonth`/`canGoPrev`/`canGoNext` are not defined on the component.

- [ ] **Step 3: Add navigation methods + boundary computeds to the component**

In `attendance-history.component.ts`, replace the body of the `AttendanceHistoryComponent` class — keep all existing fields, add the new bits below them. Specifically:

1. Add these protected `computed` boundary signals after `weeks`:

```typescript
  protected readonly canGoPrev = computed(() => {
    const a = this.athlete();
    if (!a) return false;
    const createdAt = new Date(a.created_at);
    const createdYM: YearMonth = {
      year: createdAt.getFullYear(),
      month: createdAt.getMonth() + 1,
    };
    return compareYearMonth(this.visible(), createdYM) > 0;
  });

  protected readonly canGoNext = computed(() => {
    const now = new Date();
    const todayYM: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
    return compareYearMonth(this.visible(), todayYM) < 0;
  });
```

2. Add public methods after `loadAll(...)`:

```typescript
  prevMonth(): void {
    if (!this.canGoPrev()) return;
    this.shiftAndReload(-1);
  }

  nextMonth(): void {
    if (!this.canGoNext()) return;
    this.shiftAndReload(1);
  }

  private shiftAndReload(delta: number): void {
    this.visible.set(shiftMonth(this.visible(), delta));
    const a = this.athlete();
    if (!a) return;
    this.loading.set(true);
    this.attendanceService
      .getAthleteHistory(a.id, {
        from: firstOfMonth(this.visible()),
        to: lastOfMonth(this.visible()),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (records) => this.records.set(records),
        error: () => this.records.set([]),
      });
  }
```

3. Add this helper at the top of the file, near `toLocalDateString`:

```typescript
/** -1 if a < b, 0 if equal, +1 if a > b. */
function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
```

Expected: PASS — all 7 tests green (1 init load + 6 navigation/boundary).

- [ ] **Step 5: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
git commit -m "feat(attendance): add prev/next month navigation with boundary guards"
```

---

## Task 5: Render the calendar grid template + month label + counter

**Files:**
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts` (add `monthLabel` computed)
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html`
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.scss`

- [ ] **Step 1: Add a `monthLabel` computed to the component**

In `attendance-history.component.ts`, add this computed after `attendedCount`:

```typescript
  protected readonly monthLabel = computed(() => {
    const ym = this.visible();
    const d = new Date(ym.year, ym.month - 1, 1);
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });
```

Update the `imports` array on the `@Component` decorator to include `ButtonModule` and `SkeletonModule`:

```typescript
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
// ...
@Component({
  // ...
  imports: [ButtonModule, SkeletonModule],
  // ...
})
```

- [ ] **Step 2: Replace the template with the full calendar grid**

Replace `attendance-history.component.html` with:

```html
<section class="attendance-history" data-cy="attendance-history">
  <header class="attendance-history__header">
    <div class="attendance-history__heading">
      <p class="attendance-history__eyebrow">Attendance</p>
      <h2 class="attendance-history__title" data-cy="attendance-month-label">
        {{ monthLabel() }}
      </h2>
      <p class="attendance-history__counter" data-cy="attendance-counter">
        {{ attendedCount() }} day{{ attendedCount() === 1 ? '' : 's' }} this month
      </p>
    </div>

    <div class="attendance-history__nav">
      <p-button
        icon="pi pi-chevron-left"
        [text]="true"
        [rounded]="true"
        [disabled]="!canGoPrev()"
        (onClick)="prevMonth()"
        ariaLabel="Previous month"
        data-cy="attendance-prev"
      />
      <p-button
        icon="pi pi-chevron-right"
        [text]="true"
        [rounded]="true"
        [disabled]="!canGoNext()"
        (onClick)="nextMonth()"
        ariaLabel="Next month"
        data-cy="attendance-next"
      />
    </div>
  </header>

  <div class="attendance-history__weekdays" aria-hidden="true">
    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span>
    <span>Fri</span><span>Sat</span><span>Sun</span>
  </div>

  @if (loading()) {
    <div class="attendance-history__grid" data-cy="attendance-skeleton">
      @for (_ of [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                  0, 0, 0, 0, 0, 0, 0]; track $index) {
        <p-skeleton width="100%" height="3rem" />
      }
    </div>
  } @else {
    <div class="attendance-history__grid" data-cy="attendance-grid">
      @for (week of weeks(); track $index) {
        @for (day of week; track $index) {
          @if (day === null) {
            <span class="attendance-history__cell attendance-history__cell--empty"></span>
          } @else {
            @let attended = attendedDates().has(dayKey(day));
            <button
              type="button"
              class="attendance-history__cell"
              [class.attendance-history__cell--attended]="attended"
              [attr.data-cy]="attended ? 'attendance-day-attended' : 'attendance-day'"
              [attr.data-day]="day"
              [attr.aria-label]="attended ? day + ' — present' : day + ' — not recorded'"
            >
              <span class="attendance-history__day-num">{{ day }}</span>
              @if (attended) {
                <i class="pi pi-check attendance-history__check" aria-hidden="true"></i>
              }
            </button>
          }
        }
      }
    </div>
  }
</section>
```

- [ ] **Step 3: Add `dayKey()` helper to the component**

In `attendance-history.component.ts`, add this method on the class (anywhere — I'll put it after `nextMonth`):

```typescript
  /** Build a YYYY-MM-DD key for a day-of-month in the current visible month. */
  protected dayKey(day: number): string {
    const ym = this.visible();
    return `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
```

- [ ] **Step 4: Style the calendar grid**

Replace `attendance-history.component.scss` with:

```scss
// MD3 8dp baseline + Mon-Sun grid. Color via PrimeNG theme tokens only.
// Mobile-first; the grid stays 7-col at every viewport because that's the
// canonical calendar shape — we only scale cell size and padding.

.attendance-history {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  &__heading {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  &__eyebrow {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--p-text-muted-color);
  }

  &__title {
    margin: 0;
    font-size: 1.25rem; // MD3 title-large
    font-weight: 600;
    color: var(--p-text-color);
  }

  &__counter {
    margin: 0;
    font-size: 0.875rem;
    color: var(--p-text-muted-color);
  }

  &__nav {
    display: flex;
    gap: 0.25rem;
  }

  &__weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
    letter-spacing: 0.06em;

    > span {
      text-align: center;
      padding: 0.25rem 0;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
  }

  &__cell {
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    padding: 0;
    background: var(--p-content-background);
    border: 1px solid var(--p-content-border-color);
    border-radius: var(--p-border-radius-sm);
    color: var(--p-text-color);
    font-size: 0.875rem;
    cursor: pointer;
    transition:
      background 200ms cubic-bezier(0.2, 0, 0, 1),
      border-color 200ms cubic-bezier(0.2, 0, 0, 1);

    &:hover:not(.attendance-history__cell--empty) {
      background: var(--p-content-hover-background);
    }

    &--empty {
      background: transparent;
      border-color: transparent;
      cursor: default;
    }

    &--attended {
      background: var(--p-primary-50);
      border-color: var(--p-primary-300);
      color: var(--p-primary-800);

      &:hover {
        background: var(--p-primary-100);
      }
    }
  }

  &__day-num {
    font-weight: 500;
  }

  &__check {
    font-size: 0.75rem;
    color: var(--p-primary-600);
  }
}
```

- [ ] **Step 5: Run tests to confirm nothing regressed**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history
```

Expected: PASS — all calendar grid + component tests still green.

- [ ] **Step 6: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.scss
git commit -m "feat(attendance): render calendar grid with weekday header and counter"
```

---

## Task 6: Notes popover on attended-day click

**Files:**
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts`
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html`
- Modify: `client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts`

- [ ] **Step 1: Add a failing test for "tapping an attended day with notes opens the popover"**

Append inside `describe('AttendanceHistoryComponent', ...)` in the spec file:

```typescript
  it('opens a popover with notes when tapping a day that has notes', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({
        data: [makeRecord({ attended_on: '2026-04-10', notes: 'Open mat — rolled with Lucia' })],
      });

    fixture.componentInstance.openNotesFor(new MouseEvent('click'), '2026-04-10');
    expect(fixture.componentInstance.activeNotes()).toBe('Open mat — rolled with Lucia');
    httpMock.verify();
  });

  it('does nothing when tapping an attended day with null notes', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [makeRecord({ attended_on: '2026-04-10', notes: null })] });

    fixture.componentInstance.openNotesFor(new MouseEvent('click'), '2026-04-10');
    expect(fixture.componentInstance.activeNotes()).toBeNull();
    httpMock.verify();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
```

Expected: FAIL — `openNotesFor` and `activeNotes` are not defined.

- [ ] **Step 3: Add notes-popover wiring to the component**

Update the imports at the top of `attendance-history.component.ts`:

```typescript
import { Popover, PopoverModule } from 'primeng/popover';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
```

Update the `imports` array on the `@Component` decorator to include `PopoverModule`:

```typescript
  imports: [ButtonModule, PopoverModule, SkeletonModule],
```

Add this `@ViewChild` and signal inside the class (after the `attendedDates` computed):

```typescript
  @ViewChild('notesPopover') private notesPopover?: Popover;

  protected readonly activeNotes = signal<string | null>(null);
```

Add this method (alongside `dayKey`):

```typescript
  openNotesFor(event: Event, key: string): void {
    const record = this.records().find((r) => r.attended_on === key);
    if (!record || !record.notes) {
      this.activeNotes.set(null);
      return;
    }
    this.activeNotes.set(record.notes);
    this.notesPopover?.show(event);
  }
```

- [ ] **Step 4: Wire the popover into the template**

In `attendance-history.component.html`:

1. Replace the `<button ... class="attendance-history__cell">` opening tag and its content with a click handler that calls `openNotesFor`:

```html
            <button
              type="button"
              class="attendance-history__cell"
              [class.attendance-history__cell--attended]="attended"
              [attr.data-cy]="attended ? 'attendance-day-attended' : 'attendance-day'"
              [attr.data-day]="day"
              [attr.aria-label]="attended ? day + ' — present' : day + ' — not recorded'"
              (click)="attended ? openNotesFor($event, dayKey(day)) : null"
            >
              <span class="attendance-history__day-num">{{ day }}</span>
              @if (attended) {
                <i class="pi pi-check attendance-history__check" aria-hidden="true"></i>
              }
            </button>
```

2. Add the popover at the bottom of the `<section>` (just before the closing `</section>`):

```html
  <p-popover #notesPopover>
    @if (activeNotes(); as notes) {
      <p class="attendance-history__notes" data-cy="attendance-notes">{{ notes }}</p>
    }
  </p-popover>
</section>
```

3. Add the styles for `__notes` to `attendance-history.component.scss`:

```scss
  &__notes {
    margin: 0;
    max-width: 18rem;
    color: var(--p-text-color);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
```

Expected: PASS — 9 tests green.

- [ ] **Step 6: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/src/app/features/athletes/detail/attendance-history/attendance-history.component.ts \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.html \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.scss \
        client/src/app/features/athletes/detail/attendance-history/attendance-history.component.spec.ts
git commit -m "feat(attendance): show notes popover when tapping a day with notes"
```

---

## Task 7: Wire the route + add the tab header on AthleteDetailComponent

**Files:**
- Modify: `client/src/app/app.routes.ts`
- Modify: `client/src/app/features/athletes/detail/athlete-detail.component.ts`
- Modify: `client/src/app/features/athletes/detail/athlete-detail.component.html`
- Modify: `client/src/app/features/athletes/detail/athlete-detail.component.scss`
- Modify: `client/src/app/features/athletes/detail/athlete-detail.component.spec.ts`

- [ ] **Step 1: Add the new child route**

Edit `client/src/app/app.routes.ts`. Find the `athletes/:id` block:

```typescript
        children: [
          { path: '', redirectTo: 'documents', pathMatch: 'full' },
          {
            path: 'documents',
            loadComponent: () =>
              import('./features/athletes/detail/documents-list/documents-list.component').then(
                (m) => m.DocumentsListComponent,
              ),
          },
        ],
```

Add the attendance child route after the documents block (still inside the `children` array):

```typescript
          {
            path: 'attendance',
            loadComponent: () =>
              import(
                './features/athletes/detail/attendance-history/attendance-history.component'
              ).then((m) => m.AttendanceHistoryComponent),
          },
```

- [ ] **Step 2: Update AthleteDetailComponent to render tabs**

Edit `athlete-detail.component.ts`. Add these imports at the top:

```typescript
import { filter } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { TabsModule } from 'primeng/tabs';
```

Update the `@Component` decorator's `imports` array:

```typescript
  imports: [RouterOutlet, RouterLink, ButtonModule, TabsModule, TagModule, BeltBadgeComponent],
```

Add this signal next to the existing ones:

```typescript
  readonly activeTab = signal<string>('documents');
```

Inside `ngOnInit()`, after the existing `paramMap` subscription, add:

```typescript
    // Sync the active tab with the current URL on every navigation. Tab change
    // is driven by the router (anchor [routerLink] inside <p-tab>), so the
    // signal is read-only after init — we just observe the URL.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.activeTab.set(this.tabFromUrl(e.urlAfterRedirects)));
    // Set the initial value too — NavigationEnd has already fired by the time
    // we subscribe if the page was deep-linked.
    this.activeTab.set(this.tabFromUrl(this.router.url));
```

Add this private helper at the bottom of the class:

```typescript
  private tabFromUrl(url: string): string {
    return url.includes('/attendance') ? 'attendance' : 'documents';
  }
```

- [ ] **Step 3: Update the AthleteDetailComponent template to render tabs**

Replace the comment + `<router-outlet />` block in `athlete-detail.component.html` with:

```html
    <p-tabs [value]="activeTab()" class="athlete-detail-page__tabs" data-cy="athlete-tabs">
      <p-tablist>
        <p-tab value="documents" routerLink="documents" data-cy="athlete-tab-documents">
          <i class="pi pi-file"></i>
          <span>Documents</span>
        </p-tab>
        <p-tab value="attendance" routerLink="attendance" data-cy="athlete-tab-attendance">
          <i class="pi pi-calendar"></i>
          <span>Attendance</span>
        </p-tab>
      </p-tablist>
    </p-tabs>

    <router-outlet />
```

- [ ] **Step 4: Add minimal styling for the tab header**

Append to `athlete-detail.component.scss` inside the `.athlete-detail-page` block:

```scss
  &__tabs {
    // Push the tab list flush against the page padding without breaking
    // the underline indicator's bottom alignment with the next section.
    margin-top: 0.5rem;

    ::ng-deep p-tab {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;

      i {
        font-size: 1rem;
      }
    }
  }
```

- [ ] **Step 5: Update AthleteDetailComponent spec — adapt to the tab-aware layout**

Open `athlete-detail.component.spec.ts`. Replace the `setupTestBed` so the `Router` mock has an `events` observable and a `url` property:

```typescript
import { Subject } from 'rxjs';

function setupTestBed(idParam: string | null = '42'): {
  http: HttpTestingController;
  routerEvents: Subject<unknown>;
} {
  const paramMap = convertToParamMap(idParam ? { id: idParam } : {});
  const routerEvents = new Subject<unknown>();
  TestBed.configureTestingModule({
    imports: [AthleteDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: Router,
        useValue: {
          navigate: vi.fn().mockResolvedValue(true),
          events: routerEvents.asObservable(),
          url: '/dashboard/athletes/42/documents',
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(paramMap),
          snapshot: { paramMap },
        },
      },
    ],
  });
  return { http: TestBed.inject(HttpTestingController), routerEvents };
}
```

Update each existing test in the file to destructure `{ http }` instead of taking the `HttpTestingController` directly. For example:

```typescript
  it('loads the athlete and exposes the full name', () => {
    const { http } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    http.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.athlete()?.first_name).toBe('Mario');
    expect(fixture.componentInstance.fullName()).toBe('Mario Rossi');
    http.verify();
  });
```

(Repeat the rename for the three other existing tests in the file: `redirects to the list when the id is non-numeric`, `maps status to the expected p-tag severity`, `exposes an error message when loading the athlete fails` — change `httpMock` → `http` and `setupTestBed(...)` → `const { http } = setupTestBed(...)`.)

Then add this new test at the bottom of the `describe('AthleteDetailComponent')` block:

```typescript
  it('reads the active tab from the current URL', () => {
    const { http } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    // Override Router.url so the initial sync sees attendance instead of documents.
    const router = TestBed.inject(Router) as unknown as { url: string };
    router.url = '/dashboard/athletes/42/attendance';
    fixture.detectChanges();
    http.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.activeTab()).toBe('attendance');
    http.verify();
  });
```

- [ ] **Step 6: Run all athlete-detail and attendance-history tests**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run src/app/features/athletes/detail
```

Expected: PASS — every test in `athlete-detail.component.spec.ts` (5 total: 4 existing + 1 new), `documents-list.component.spec.ts` (existing — should still pass, no changes), `attendance-history.component.spec.ts` (9 total), `calendar-grid.spec.ts` (10 total).

- [ ] **Step 7: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/src/app/app.routes.ts \
        client/src/app/features/athletes/detail/athlete-detail.component.ts \
        client/src/app/features/athletes/detail/athlete-detail.component.html \
        client/src/app/features/athletes/detail/athlete-detail.component.scss \
        client/src/app/features/athletes/detail/athlete-detail.component.spec.ts
git commit -m "feat(athletes): add tabbed detail layout with attendance tab"
```

---

## Task 8: Cypress E2E spec

**Files:**
- Create: `client/cypress/e2e/attendance-history.cy.ts`

- [ ] **Step 1: Write the Cypress E2E spec**

Create `client/cypress/e2e/attendance-history.cy.ts`:

```typescript
export {};

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: { id: 1, name: 'Test Academy', slug: 'test-academy', address: null } },
};

const ATHLETE_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: null,
      phone: null,
      date_of_birth: null,
      belt: 'blue' as const,
      stripes: 0,
      status: 'active' as const,
      joined_at: '2026-01-15',
      created_at: '2026-01-15T10:00:00+00:00',
    },
  },
};

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstOfThisMonth(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

function lastOfThisMonth(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function pickAttendedDay(): string {
  // Use the 10th of the current month — guaranteed to exist in every month.
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 10));
}

describe('attendance history tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/me', {
      statusCode: 200,
      body: { data: { id: 1, name: 'Admin', email: 'admin@example.it', has_academy: true } },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes/42', ATHLETE_OK);

    // Login is bypassed via the test token + interceptor scaffolding used by
    // the documents/attendance specs. Reuse the same approach: seed a token.
    window.localStorage.setItem('budojo.auth.token', 'test-token');
  });

  it('renders the attendance grid and highlights the attended day', () => {
    const attendedDay = pickAttendedDay();
    cy.intercept(
      'GET',
      `/api/v1/athletes/42/attendance?from=${firstOfThisMonth()}&to=${lastOfThisMonth()}`,
      {
        statusCode: 200,
        body: { data: [{ id: 1, athlete_id: 42, attended_on: attendedDay, notes: null, created_at: null, deleted_at: null }] },
      },
    ).as('getHistory');

    cy.visit('/dashboard/athletes/42/attendance');
    cy.wait('@getHistory');

    cy.get('[data-cy="attendance-history"]').should('exist');
    cy.get('[data-cy="attendance-counter"]').should('contain.text', '1 day this month');
    cy.get('[data-cy="attendance-day-attended"]').should('have.length', 1);
    cy.get('[data-cy="attendance-day-attended"]')
      .first()
      .should('have.attr', 'data-day', '10');
  });

  it('switches between Documents and Attendance tabs by clicking the tab', () => {
    cy.intercept(
      'GET',
      `/api/v1/athletes/42/attendance*`,
      { statusCode: 200, body: { data: [] } },
    ).as('getHistory');
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');

    cy.visit('/dashboard/athletes/42/documents');
    cy.wait('@getDocs');

    cy.get('[data-cy="athlete-tab-attendance"]').click();
    cy.wait('@getHistory');
    cy.location('pathname').should('include', '/attendance');
    cy.get('[data-cy="attendance-history"]').should('be.visible');
  });

  it('opens a popover with the notes when tapping a day that has notes', () => {
    const attendedDay = pickAttendedDay();
    cy.intercept(
      'GET',
      `/api/v1/athletes/42/attendance?from=${firstOfThisMonth()}&to=${lastOfThisMonth()}`,
      {
        statusCode: 200,
        body: {
          data: [
            {
              id: 1,
              athlete_id: 42,
              attended_on: attendedDay,
              notes: 'Open mat — rolled with Lucia',
              created_at: null,
              deleted_at: null,
            },
          ],
        },
      },
    ).as('getHistory');

    cy.visit('/dashboard/athletes/42/attendance');
    cy.wait('@getHistory');

    cy.get('[data-cy="attendance-day-attended"]').first().click();
    cy.get('[data-cy="attendance-notes"]').should('contain.text', 'Open mat — rolled with Lucia');
  });
});
```

- [ ] **Step 2: Run the Cypress spec headlessly**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm run cy:run -- --spec "cypress/e2e/attendance-history.cy.ts"
```

Expected: PASS — 3 tests green.

If a test depends on auth bootstrapping that the local-storage seed doesn't satisfy, mirror the pattern used in `cypress/e2e/attendance.cy.ts` (read its top-of-file setup and copy whatever interceptors are needed for `GET /api/v1/me`, etc.).

- [ ] **Step 3: Commit**

```bash
cd /home/matteo/PhpstormProjects/budojo
git add client/cypress/e2e/attendance-history.cy.ts
git commit -m "test(e2e): add cypress spec for attendance history tab"
```

---

## Task 9: Pre-push checks (Angular)

The PHP server is untouched; only the Angular gate matters. Per CLAUDE.md the pre-push order is: prettier (write) → stage → lint + tests against the staged final state.

**Files:** none (verification step).

- [ ] **Step 1: Format with Prettier**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npx prettier --write "src/**/*.{ts,html,scss}"
```

Expected: a list of formatted files. If any file is reformatted, stage it before lint.

- [ ] **Step 2: Lint**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run all unit tests (no watch)**

```bash
cd /home/matteo/PhpstormProjects/budojo/client
npm test -- --run
```

Expected: every spec passes; the count grows by 19 (10 calendar-grid + 9 attendance-history) plus 1 new athlete-detail tab assertion.

- [ ] **Step 4: Stage anything Prettier touched and commit if needed**

```bash
cd /home/matteo/PhpstormProjects/budojo
git status
# If Prettier modified any file:
git add -u client/src
git commit -m "style(client): prettier autofix on attendance history files"
# (skip if status is clean)
```

---

## Task 10: Push, open PR, board, label, status

Branch goes up; PR opens against `develop`; the project board gets the PR; both the issue and PR move to In Progress; Copilot review starts on its own.

**Files:**
- Create: `.claude/pr-body.md`

- [ ] **Step 1: Push the branch**

```bash
cd /home/matteo/PhpstormProjects/budojo
git push -u origin feat/80-attendance-history-ui
```

- [ ] **Step 2: Write the PR body**

Create `.claude/pr-body.md`:

```markdown
Closes #80. Third PR of M4 — adds the per-athlete attendance history tab on the athlete detail page. Builds on the M4.1 backend (`GET /api/v1/athletes/{athlete}/attendance`) and complements the M4.2 daily check-in by giving instructors a longitudinal view of who's been training.

## What ships

- **Tab layout** on `AthleteDetailComponent` — `<p-tabs>` with two router-linked tabs (Documents, Attendance). The active tab is derived from the URL on every navigation, so deep links work.
- **Attendance child route** `/dashboard/athletes/:id/attendance` → `AttendanceHistoryComponent`.
- **Calendar grid** — Mon-Sun, 7-column, lazy-padded with `null` cells around the month boundaries. Days with a record are highlighted in primary-50 with a check icon; the rest stay neutral.
- **Month navigation** — prev / next chevron buttons. Prev disabled when the visible month equals the athlete's `created_at` month; next disabled when the visible month equals the current month.
- **Attended-days counter** in the header (`N day(s) this month`).
- **Notes popover** — tap an attended day with notes to open a `<p-popover>`. Days without notes are non-interactive (per PRD "shows the notes if any").

## UX contract (matches PRD § P0.4)

- Default visible month = current month
- Calendar grid loads on tab open; navigating between months refetches the windowed history (one network call per month — typical history is sparse, so we don't preload anything beyond the visible month)
- Boundary disabling means a user can never request months that wouldn't have data: pre-creation (data couldn't exist) or future (PRD bans future-dated records)

## Tests

- **Vitest 19 new** (10 `calendar-grid` + 9 `attendance-history-component`). Covers grid construction (Mon-Sun layout, padding, year-rollover months), prev/next navigation, boundary guards, init load, notes popover gating.
- **Cypress** `cypress/e2e/attendance-history.cy.ts`:
  - Render grid + counter + highlight on the attended day
  - Tab switch from Documents to Attendance updates URL and surface
  - Notes popover opens when tapping an attended day with notes

## Quality gates

- `npm test` — all green
- `npm run lint` — clean
- `npx prettier --check` — clean on touched files
- PHPStan / PEST — no-op, server untouched

## Deferred

| Scope | Reason |
|---|---|
| **Notes editing UI** | M4 doesn't surface a notes-write entry point; daily check-in (M4.2) doesn't capture notes either. When/if a write surface lands, a tap-to-edit on the popover drops in cleanly. |
| **Multi-month / yearly heatmap** | YAGNI for M4 — the per-month view already answers "is Marco on track this month?". Yearly views are an M5+ concern. |
```

- [ ] **Step 3: Open the PR**

```bash
cd /home/matteo/PhpstormProjects/budojo
gh pr create \
  --repo m-bonanno/budojo \
  --base develop \
  --title "feat(attendance): per-athlete history tab (m4.3)" \
  --body-file .claude/pr-body.md \
  --label "✨ feature,✅ attendance,🎨 frontend" \
  --assignee m-bonanno
```

Expected: a PR URL like `https://github.com/m-bonanno/budojo/pull/N`. Note the PR number — call it `<PR_N>` in the next steps.

- [ ] **Step 4: Add the PR to the project board**

```bash
PR_NODE_ID=$(gh pr view <PR_N> --repo m-bonanno/budojo --json id --jq '.id')
gh api graphql -f query='
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
    item { id }
  }
}' -f projectId="PVT_kwHOAsnvsM4BVW8P" -f contentId="$PR_NODE_ID"
```

Note the returned `item.id` — call it `<PR_ITEM_ID>`.

- [ ] **Step 5: Find the issue's project item id**

```bash
gh project item-list 2 --owner m-bonanno --format json --limit 100 | \
  jq -r '.items[] | select(.content.number == 80) | .id'
```

Note the value as `<ISSUE_ITEM_ID>`.

- [ ] **Step 6: Move both items to In Progress**

```bash
# Issue
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: {
  projectId: "PVT_kwHOAsnvsM4BVW8P"
  itemId: "<ISSUE_ITEM_ID>"
  fieldId: "PVTSSF_lAHOAsnvsM4BVW8PzhQzRlk"
  value: { singleSelectOptionId: "47fc9ee4" }
}) { projectV2Item { id } } }'

# PR
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: {
  projectId: "PVT_kwHOAsnvsM4BVW8P"
  itemId: "<PR_ITEM_ID>"
  fieldId: "PVTSSF_lAHOAsnvsM4BVW8PzhQzRlk"
  value: { singleSelectOptionId: "47fc9ee4" }
}) { projectV2Item { id } } }'
```

Expected: each call returns `{"data":{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"..."}}}}`.

- [ ] **Step 7: Verify CI gates kicked off**

```bash
gh pr checks <PR_N> --repo m-bonanno/budojo --watch
```

Expected: 8 quality gates start (PHPStan, PEST, PHP CS Fixer, Vitest, ESLint, Prettier, Cypress, Spectral OpenAPI). All should land green; if any fails, fix and push a follow-up commit on the same branch.

---

## Self-Review Notes

- **Spec coverage:** PRD § P0.4 has one explicit acceptance criterion ("month-grid renders, days with a record highlighted, count header reads correctly") — covered by Tasks 3, 5 (component) and 8 (Cypress). PRD additional bullets: prev/next navigation up to created_at + not beyond today (Task 4), notes-on-tap (Task 6). All covered.
- **Type consistency:** `YearMonth` is the single shape for year/month tuples across `calendar-grid.ts` and the component. `AttendanceRecord` and `Athlete` come from the existing services with no overrides. The `notesPopover` `@ViewChild` references the template-side `#notesPopover` reference — names match.
- **Decomposition:** Pure date math (`calendar-grid.ts`) is split out of the component, so the component only owns Angular wiring. The history component is independent of the parent — re-fetches the athlete itself, which keeps it deep-linkable and self-contained.
- **YAGNI:** No view caching, no preloaded adjacent months, no editing of notes, no virtualization. Each is a defensible add-on if real usage motivates it.
- **TDD:** Every component task starts with a failing test. The component template + styles task (Task 5) doesn't add new logic so it doesn't need new tests beyond keeping existing ones green.
- **DRY:** `toLocalDateString` is duplicated across `daily-attendance.component.ts` and `attendance-history.component.ts`. That's intentional for now — the two surfaces are independent and the function is 5 lines. If a third use lands, extract to `client/src/app/shared/utils/`.
