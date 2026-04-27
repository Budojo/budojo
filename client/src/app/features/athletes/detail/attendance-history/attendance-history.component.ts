import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyService } from '../../../../core/services/academy.service';
import { Athlete, AthleteService } from '../../../../core/services/athlete.service';
import { AttendanceRecord, AttendanceService } from '../../../../core/services/attendance.service';
import { attendanceRate, countScheduledTrainingDays } from './attendance-rate';
import { YearMonth, buildCalendarGrid, shiftMonth } from './calendar-grid';

/**
 * YYYY-MM-DD from local components — same canon as the daily check-in surface;
 * `toISOString()` would shift to UTC and round-trip the wrong calendar day.
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

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

/**
 * Pull the YYYY-MM tuple straight off the ISO string instead of going through
 * `new Date()`. Going through Date applies the user's local timezone, which
 * can shift the calendar day for `created_at` values near midnight UTC and
 * silently change the prev-month boundary by one. We treat `created_at` as
 * "the calendar instant the server recorded" — the server's UTC view is the
 * source of truth, not the client's wall clock.
 */
function parseCreatedYearMonth(createdAt: string): YearMonth {
  const [y, m] = createdAt.slice(0, 7).split('-');
  return { year: Number(y), month: Number(m) };
}

function currentYearMonth(): YearMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

@Component({
  selector: 'app-attendance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, PopoverModule, SkeletonModule],
  templateUrl: './attendance-history.component.html',
  styleUrl: './attendance-history.component.scss',
})
export class AttendanceHistoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly athleteService = inject(AthleteService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly academyService = inject(AcademyService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('notesPopover') private notesPopover?: Popover;

  /**
   * Epoch counter — every load increments it, every response checks it. A
   * stale response (e.g. month flipped twice while the first GET was in
   * flight) sees its captured epoch is no longer the current one and bails
   * before mutating state. Mirrors `DailyAttendanceComponent.loadDay`.
   */
  private loadEpoch = 0;

  protected readonly athlete = signal<Athlete | null>(null);
  protected readonly records = signal<AttendanceRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly activeNotes = signal<string | null>(null);

  protected readonly visible = signal<YearMonth>(currentYearMonth());

  protected readonly attendedDates = computed(
    () => new Set(this.records().map((r) => r.attended_on)),
  );
  protected readonly attendedCount = computed(() => this.records().length);

  /**
   * Sessions actually held by the academy in the visible month (capped at
   * today). The denominator for the attendance percentage. `null` when the
   * academy hasn't configured `training_days` — the template falls back to
   * the raw "X days this month" display in that case (#106).
   */
  protected readonly scheduledCount = computed(() => {
    const ym = this.visible();
    return countScheduledTrainingDays(
      this.academyService.academy()?.training_days ?? null,
      ym.year,
      ym.month,
    );
  });

  /** Ratio of attended-to-scheduled, 0..1 (or > 1 for off-schedule sessions). */
  protected readonly rate = computed(() =>
    attendanceRate(this.attendedCount(), this.scheduledCount()),
  );

  /** Whole-percent integer for the eyebrow display (e.g. 67). `null` when no rate. */
  protected readonly ratePercent = computed(() => {
    const r = this.rate();
    return r === null ? null : Math.round(r * 100);
  });

  /** 0..100 progress-bar width as a CSS percentage string. Clamped at 100. */
  protected readonly progressBarWidth = computed(() => {
    const p = this.ratePercent();
    if (p === null) return null;
    return `${Math.min(100, p)}%`;
  });

  /**
   * `aria-valuenow` clamped to the [0, 100] range so the ARIA contract stays
   * consistent with `aria-valuemax="100"` (assistive tech rejects an out-of-
   * range value). The literal percentage — including off-schedule values
   * over 100 — is conveyed via `aria-valuetext` so the SR narration matches
   * what's on screen.
   */
  protected readonly ariaValueNow = computed(() => {
    const p = this.ratePercent();
    if (p === null) return null;
    return Math.min(100, Math.max(0, p));
  });

  /** Days that have non-empty notes — drives interactivity and cursor in the template. */
  protected readonly notedDates = computed(
    () =>
      new Set(
        this.records()
          .filter((r) => !!r.notes)
          .map((r) => r.attended_on),
      ),
  );

  protected readonly weeks = computed(() => {
    const ym = this.visible();
    return buildCalendarGrid(ym.year, ym.month);
  });

  protected readonly monthLabel = computed(() => {
    const ym = this.visible();
    const d = new Date(ym.year, ym.month - 1, 1);
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });

  protected readonly canGoPrev = computed(() => {
    const a = this.athlete();
    if (!a) return false;
    return compareYearMonth(this.visible(), parseCreatedYearMonth(a.created_at)) > 0;
  });

  protected readonly canGoNext = computed(
    () => compareYearMonth(this.visible(), currentYearMonth()) < 0,
  );

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

  prevMonth(): void {
    if (!this.canGoPrev()) return;
    this.shiftAndReload(-1);
  }

  nextMonth(): void {
    if (!this.canGoNext()) return;
    this.shiftAndReload(1);
  }

  protected dayKey(day: number): string {
    const ym = this.visible();
    return `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  openNotesFor(event: Event, key: string): void {
    const record = this.records().find((r) => r.attended_on === key);
    if (!record || !record.notes) {
      this.activeNotes.set(null);
      this.notesPopover?.hide();
      return;
    }
    this.activeNotes.set(record.notes);
    this.notesPopover?.show(event);
  }

  /**
   * Initial load — also called when the parent's :id changes (e.g. instructor
   * navigates from athlete A's history to athlete B's). Resets `visible` to
   * the current month so the contract "default = current month" holds for the
   * newly selected athlete.
   */
  private loadAll(athleteId: number): void {
    this.visible.set(currentYearMonth());
    this.activeNotes.set(null);
    this.notesPopover?.hide();
    this.loading.set(true);

    const epoch = ++this.loadEpoch;
    let pending = 2;
    const settle = () => {
      if (--pending === 0) this.loading.set(false);
    };

    this.athleteService
      .get(athleteId)
      .pipe(
        catchError(() => of<Athlete | null>(null)),
        finalize(settle),
      )
      .subscribe((athlete) => {
        if (epoch !== this.loadEpoch || athlete === null) return;
        this.athlete.set(athlete);
      });

    this.attendanceService
      .getAthleteHistory(athleteId, {
        from: firstOfMonth(this.visible()),
        to: lastOfMonth(this.visible()),
      })
      .pipe(
        catchError(() => of<AttendanceRecord[]>([])),
        finalize(settle),
      )
      .subscribe((records) => {
        if (epoch !== this.loadEpoch) return;
        this.records.set(records);
      });
  }

  private shiftAndReload(delta: number): void {
    this.visible.set(shiftMonth(this.visible(), delta));
    this.activeNotes.set(null);
    this.notesPopover?.hide();
    const a = this.athlete();
    if (!a) return;

    const epoch = ++this.loadEpoch;
    this.loading.set(true);
    this.attendanceService
      .getAthleteHistory(a.id, {
        from: firstOfMonth(this.visible()),
        to: lastOfMonth(this.visible()),
      })
      .pipe(
        catchError(() => of<AttendanceRecord[]>([])),
        finalize(() => {
          if (epoch === this.loadEpoch) this.loading.set(false);
        }),
      )
      .subscribe((records) => {
        if (epoch !== this.loadEpoch) return;
        this.records.set(records);
      });
  }
}
