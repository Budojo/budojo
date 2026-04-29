import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { AcademyService } from '../../../core/services/academy.service';
import {
  Athlete,
  AthleteService,
  AthleteSortField,
  AthleteSortOrder,
  Belt,
} from '../../../core/services/athlete.service';
import { AttendanceService } from '../../../core/services/attendance.service';
import { BeltBadgeComponent } from '../../../shared/components/belt-badge/belt-badge.component';

interface SelectOption<T extends string> {
  label: string;
  value: T | '';
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * YYYY-MM-DD from the LOCAL date components — NOT `toISOString()`, which
 * converts to UTC and can cross midnight in non-UTC timezones (e.g. a user
 * in Europe/Rome at 23:00 local time would land on tomorrow's UTC date).
 * Reused from the athlete form for the same canon reason.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-daily-attendance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    DatePickerModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    Toast,
    BeltBadgeComponent,
  ],
  providers: [MessageService],
  templateUrl: './daily-attendance.component.html',
  styleUrl: './daily-attendance.component.scss',
})
export class DailyAttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly athleteService = inject(AthleteService);
  private readonly academyService = inject(AcademyService);
  private readonly messageService = inject(MessageService);

  /**
   * Weekdays the academy does NOT train on, expressed as Carbon-compatible
   * `dayOfWeek` ints (0=Sun..6=Sat). Bound to `<p-datepicker [disabledDays]>`
   * so the picker greys out Sat/Sun for an academy that runs Mon/Wed/Fri —
   * the instructor can't accidentally log attendance on a non-class day
   * (#88c). Empty array when `training_days` is unconfigured (null) so
   * every weekday stays selectable: the legacy 7-day-window behaviour
   * survives until the owner opts in via the academy form.
   */
  protected readonly disabledWeekdays = computed<number[]>(() => {
    const days = this.academyService.academy()?.training_days ?? null;
    if (days === null || days.length === 0) return [];
    const trainingSet = new Set(days);
    return ALL_WEEKDAYS.filter((d) => !trainingSet.has(d));
  });

  /**
   * Backfill window (#181). The PRD originally capped backfilling at 7
   * days; user feedback after the M4 release was that the cap was too
   * tight (post-hoc data entry, holiday catch-up). Single-instructor
   * academy → trust the user. We keep `maxDate` so future dates stay
   * blocked at the picker layer (semantically wrong + the FormRequest
   * still rejects them with 422), and drop the floor entirely so the
   * coach can backfill arbitrarily far back.
   */
  protected readonly maxDate = new Date();

  /**
   * `selectedDate` is bound via FormsModule `[(ngModel)]` to the date
   * picker. `<p-datepicker>` emits a Date, we convert to YYYY-MM-DD when
   * crossing the wire boundary (see loadDay).
   *
   * Initialised to today; ngOnInit() reseats this to the most recent past
   * training day when today isn't one (#195) — without that step the user
   * lands on a non-training-day default and every check-in click 422s.
   */
  protected readonly selectedDate = signal<Date>(new Date());

  /**
   * The full list of active athletes for the academy. Page 1 only for
   * MVP — typical dojos are < 20 active so this covers the case; if a
   * larger academy hits the limit we'll add load-more / pagination in
   * M4.2.5. There's a "showing 20 of N" hint at the foot of the list
   * to surface the limit explicitly.
   */
  protected readonly athletes = signal<Athlete[]>([]);
  protected readonly totalActiveAthletes = signal<number>(0);

  /**
   * athlete_id → record_id for each present athlete. The record_id is the
   * server-generated PK; we need it to fire a DELETE on un-mark. While a
   * mark is in flight we set the value to a sentinel (-1) so the row
   * renders as present optimistically; on success we swap in the real id.
   */
  protected readonly presentMap = signal<Map<number, number>>(new Map());

  protected readonly loading = signal<boolean>(false);

  /**
   * Set of athlete_ids whose mark/unmark is currently in flight. Used to
   * disable the row's tap handler — preventing double-tap during a slow
   * round-trip from spawning two POSTs that race.
   */
  protected readonly inflight = signal<Set<number>>(new Set());

  /**
   * Monotonic counter for `loadDay()` calls. A request whose captured
   * epoch no longer matches the current value is stale (the user clicked
   * the date picker again before the previous response landed) and its
   * tap() into our signals is a no-op. Mirrors AcademyService.epoch.
   */
  private loadEpoch = 0;

  // ── Search + filters (#184) ────────────────────────────────────────────────
  // Mirrors the athletes-list filter strip — same shape, same debounce
  // pipeline. Filter parameters are forwarded to the SAME paginated
  // athletes endpoint the page already calls, so server-side filtering
  // applies. Keeps the chrome consistent and the muscle memory shared
  // with the main list (Jakob's law).

  protected readonly searchTerm = signal<string>('');
  protected readonly selectedBelt = signal<Belt | ''>('');
  protected readonly sortField = signal<AthleteSortField | null>(null);
  protected readonly sortOrder = signal<AthleteSortOrder>('desc');

  /**
   * Debounce pipeline matching athletes-list (#102): each keystroke
   * pushes here, the trim+distinct guard collapses redundant emissions,
   * the 200 ms window keeps the load count low without making the
   * filter feel laggy (Doherty < 400 ms).
   */
  private readonly searchInputSubject = new Subject<string>();

  // Order = IBJJF rank (kids first, adults after).
  protected readonly beltOptions: SelectOption<Belt>[] = [
    { label: 'All belts', value: '' },
    { label: 'Grey (kids)', value: 'grey' },
    { label: 'Yellow (kids)', value: 'yellow' },
    { label: 'Orange (kids)', value: 'orange' },
    { label: 'Green (kids)', value: 'green' },
    { label: 'White', value: 'white' },
    { label: 'Blue', value: 'blue' },
    { label: 'Purple', value: 'purple' },
    { label: 'Brown', value: 'brown' },
    { label: 'Black', value: 'black' },
  ];

  constructor() {
    this.searchInputSubject
      .pipe(
        debounceTime(200),
        map((value) => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => this.applySearch(q));
  }

  // Clear any pending undo toast before the next add to avoid stacked Undo
  // buttons. The component-scoped MessageService isolates this from global
  // toasts (see providers above). We intentionally don't use per-message
  // keys: PrimeNG ignores keyed messages when the rendered `<p-toast>` is
  // keyless, so adding keys can silently make undo/error toasts stop
  // appearing — a non-obvious gotcha worth recording at the call site.

  ngOnInit(): void {
    this.initSelectedDate();
    this.loadDay();
  }

  /**
   * If today isn't one of the academy's `training_days`, walk back from
   * today (up to a week) and pick the most recent past training day as
   * the default selection (#195). Without this, an academy that trains
   * Mon/Wed/Fri loads the page on Thursday with today's date pre-selected
   * — every "mark present" click then 422s server-side because Thursday
   * isn't a valid training day for that academy. The future-date guard
   * (#190) already handles tomorrow at the picker layer; this is the
   * symmetric fix on the past side.
   *
   * Legacy fallback: if `training_days` is null (academy hasn't opted
   * into the schedule yet) we keep today as the default — the field is
   * unconfigured so every weekday is fair game.
   */
  private initSelectedDate(): void {
    const trainingDays = this.academyService.academy()?.training_days ?? null;
    if (trainingDays === null || trainingDays.length === 0) {
      return;
    }
    const trainingSet = new Set(trainingDays);
    const today = new Date();
    if (trainingSet.has(today.getDay())) {
      return;
    }
    // Walk back up to 7 days to find the most recent past training day.
    // The 7-iteration cap guarantees termination even if `training_days`
    // ever ends up containing only weekday values that aren't actually
    // weekdays — the early-out `length === 0` check above is the common
    // case, this loop's bound is the defensive backstop.
    const cursor = new Date(today);
    for (let i = 0; i < 7; i++) {
      cursor.setDate(cursor.getDate() - 1);
      if (trainingSet.has(cursor.getDay())) {
        this.selectedDate.set(cursor);
        return;
      }
    }
  }

  /**
   * Date-driven full refresh: roster + the day's attendance records.
   * Used on init, on date change, and as the public name the existing
   * test suite exercises. Internally splits to `fetchAthletes()` +
   * `fetchAttendance()` so filter/sort changes can re-fetch ONLY the
   * roster side without clobbering an in-flight optimistic mark on
   * the present-map (#184 follow-up to Copilot review).
   *
   * Epoch-gated against double-trigger: the user clicking the date
   * picker rapidly fires multiple loadDay() calls; each captures its
   * own epoch and only writes to the signals if its epoch is still
   * current. A late response from a previous date can no longer
   * clobber the freshly-selected date's state.
   */
  protected loadDay(): void {
    this.loading.set(true);
    const epoch = ++this.loadEpoch;

    let pending = 2;
    const settle = (): void => {
      pending -= 1;
      if (pending === 0 && epoch === this.loadEpoch) {
        this.loading.set(false);
      }
    };

    this.fetchAthletes(epoch, settle);
    this.fetchAttendance(epoch, settle);
  }

  /**
   * Fetches ONLY the athletes list — used by filter/sort changes
   * (q, belt, sort_by, sort_order). Crucially does NOT touch the
   * present-map, so an in-flight optimistic mark can't be clobbered
   * by a parallel attendance refetch racing the POST.
   */
  private loadAthletes(): void {
    this.loading.set(true);
    const epoch = ++this.loadEpoch;
    this.fetchAthletes(epoch, () => {
      if (epoch === this.loadEpoch) {
        this.loading.set(false);
      }
    });
  }

  /**
   * The actual athletes-list HTTP call. Epoch-gated so a stale
   * response from a previous filter / sort / date change can no
   * longer clobber the current state.
   */
  private fetchAthletes(epoch: number, settle: () => void): void {
    const belt = this.selectedBelt();
    const sortBy = this.sortField();
    const q = this.searchTerm().trim();
    this.athleteService
      .list({
        status: 'active',
        ...(belt ? { belt } : {}),
        ...(q ? { q } : {}),
        ...(sortBy ? { sortBy, sortOrder: this.sortOrder() } : {}),
      })
      .subscribe({
        next: (page) => {
          if (epoch === this.loadEpoch) {
            this.athletes.set(page.data);
            this.totalActiveAthletes.set(page.meta.total);
          }
          settle();
        },
        error: () => {
          if (epoch === this.loadEpoch) {
            this.toastError('Could not load the athletes list.');
          }
          settle();
        },
      });
  }

  /**
   * The attendance-records HTTP call. Same epoch-gated pattern.
   * Rebuilds the present-map from the server's records on success
   * — ONLY safe to call when no mark/unmark is in flight, hence the
   * filter/sort handlers route through `loadAthletes()` instead of
   * `loadDay()` to avoid clobbering an optimistic update.
   */
  private fetchAttendance(epoch: number, settle: () => void): void {
    const date = toLocalDateString(this.selectedDate());
    this.attendanceService.getDaily(date).subscribe({
      next: (records) => {
        if (epoch === this.loadEpoch) {
          const map = new Map<number, number>();
          for (const r of records) {
            map.set(r.athlete_id, r.id);
          }
          this.presentMap.set(map);
        }
        settle();
      },
      error: () => {
        if (epoch === this.loadEpoch) {
          this.toastError("Could not load today's attendance.");
        }
        settle();
      },
    });
  }

  protected isPresent(athleteId: number): boolean {
    return this.presentMap().has(athleteId);
  }

  protected isInflight(athleteId: number): boolean {
    return this.inflight().has(athleteId);
  }

  /**
   * The single user-facing entry point. Routes to mark or unmark based on
   * current state. Disabled (no-op) while a request for this athlete is
   * already in flight.
   */
  protected togglePresent(athlete: Athlete): void {
    if (this.isInflight(athlete.id)) {
      return;
    }
    const existingRecordId = this.presentMap().get(athlete.id);
    if (existingRecordId !== undefined && existingRecordId > 0) {
      this.unmark(athlete, existingRecordId);
    } else {
      this.mark(athlete);
    }
  }

  /**
   * Optimistic mark. Adds a sentinel `-1` record-id so the row flips
   * to present immediately, then fires the POST. On success we swap in
   * the real record id; on error we roll back.
   *
   * `silent` skips the success toast — used when the caller is itself
   * an undo of a previous unmark (PRD § P0.3: "No new toast is emitted
   * for the undo itself").
   */
  private mark(athlete: Athlete, options: { silent?: boolean } = {}): void {
    const date = toLocalDateString(this.selectedDate());
    this.optimisticAdd(athlete.id, -1);
    this.markInflight(athlete.id, true);

    this.attendanceService.markBulk({ date, athlete_ids: [athlete.id] }).subscribe({
      next: (records) => {
        // The server returns the FULL "now present on this date" list for
        // the posted athletes; idempotent path returns the existing record.
        // Either way we want the record id for this athlete.
        const fresh = records.find((r) => r.athlete_id === athlete.id);
        if (fresh) {
          this.optimisticAdd(athlete.id, fresh.id);
          if (!options.silent) {
            this.toastUndo(`${athlete.first_name} ${athlete.last_name} marked present.`, () =>
              this.unmark(athlete, fresh.id, { silent: true }),
            );
          }
        }
        this.markInflight(athlete.id, false);
      },
      error: () => {
        this.optimisticRemove(athlete.id);
        this.markInflight(athlete.id, false);
        this.toastError(`Couldn't mark ${athlete.first_name} present. Try again.`);
      },
    });
  }

  /**
   * Optimistic unmark. Removes from the present-map immediately, fires
   * the DELETE, on error puts it back. `silent` skips the success toast
   * for the same Undo-of-undo reason as `mark()`.
   */
  private unmark(athlete: Athlete, recordId: number, options: { silent?: boolean } = {}): void {
    this.optimisticRemove(athlete.id);
    this.markInflight(athlete.id, true);

    this.attendanceService.delete(recordId).subscribe({
      next: () => {
        if (!options.silent) {
          this.toastUndo(`${athlete.first_name} ${athlete.last_name} un-marked.`, () =>
            this.mark(athlete, { silent: true }),
          );
        }
        this.markInflight(athlete.id, false);
      },
      error: () => {
        this.optimisticAdd(athlete.id, recordId);
        this.markInflight(athlete.id, false);
        this.toastError(`Couldn't un-mark ${athlete.first_name}. Try again.`);
      },
    });
  }

  protected onDateChanged(): void {
    // ngModel pushes the new Date into selectedDate(). Reload accordingly.
    this.loadDay();
  }

  // ── Filter handlers (#184) ─────────────────────────────────────────────────

  /** Each keystroke pushes into the debounce pipeline. */
  protected onSearchInput(value: string): void {
    this.searchInputSubject.next(value);
  }

  protected applySearch(q: string): void {
    this.searchTerm.set(q.trim());
    // Filter/sort changes reload the ROSTER only — the date hasn't
    // moved, so the attendance records on the wire are unchanged
    // and a parallel re-fetch would race any in-flight optimistic
    // mark on the present-map.
    this.loadAthletes();
  }

  protected onBeltChange(belt: Belt | ''): void {
    this.selectedBelt.set(belt);
    this.loadAthletes();
  }

  /**
   * 2-state header sort. Mirrors athletes-list's `onSort()` minus the
   * Full-name 4-state cycle — daily attendance is small enough that a
   * single primary sort + direction toggle covers the use case. Same
   * allowlist (`first_name`, `last_name`, `belt`) the backend honors.
   */
  protected onSort(event: { field?: string; order?: number }): void {
    const allowed: AthleteSortField[] = ['first_name', 'last_name', 'belt'];
    const field = event.field;
    if (!field || !(allowed as string[]).includes(field)) return;

    this.sortField.set(field as AthleteSortField);
    this.sortOrder.set(event.order === 1 ? 'asc' : 'desc');
    this.loadAthletes();
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private optimisticAdd(athleteId: number, recordId: number): void {
    const next = new Map(this.presentMap());
    next.set(athleteId, recordId);
    this.presentMap.set(next);
  }

  private optimisticRemove(athleteId: number): void {
    const next = new Map(this.presentMap());
    next.delete(athleteId);
    this.presentMap.set(next);
  }

  private markInflight(athleteId: number, on: boolean): void {
    const next = new Set(this.inflight());
    if (on) {
      next.add(athleteId);
    } else {
      next.delete(athleteId);
    }
    this.inflight.set(next);
  }

  private toastUndo(summary: string, undo: () => void): void {
    this.messageService.clear();
    this.messageService.add({
      severity: 'success',
      summary,
      // The custom toast template (see html) reads .data.undo and renders
      // a button that calls it. PrimeNG dismisses the toast on its own
      // after `life` ms; the user has 5 seconds to act.
      data: { undo },
      life: 5000,
    });
  }

  private toastError(summary: string): void {
    this.messageService.clear();
    this.messageService.add({
      severity: 'error',
      summary,
      life: 4000,
    });
  }
}
