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
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { AcademyService } from '../../../core/services/academy.service';
import { AttendanceService, AttendanceSummaryRow } from '../../../core/services/attendance.service';
import { attendanceRate, countScheduledTrainingDays } from '../../../shared/utils/attendance-rate';

interface YearMonth {
  year: number;
  month: number; // 1-indexed
}

function currentYearMonth(): YearMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function toMonthString(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

function parseMonthString(s: string | null): YearMonth | null {
  if (!s) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(s);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function shiftMonth(current: YearMonth, delta: number): YearMonth {
  const total = current.year * 12 + (current.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

@Component({
  selector: 'app-monthly-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonModule, InputTextModule, SkeletonModule, TableModule],
  templateUrl: './monthly-summary.component.html',
  styleUrl: './monthly-summary.component.scss',
})
export class MonthlySummaryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attendanceService = inject(AttendanceService);
  private readonly academyService = inject(AcademyService);
  private readonly destroyRef = inject(DestroyRef);

  /** Stale-response gate — same canon as DailyAttendanceComponent / AttendanceHistoryComponent. */
  private loadEpoch = 0;

  protected readonly rows = signal<AttendanceSummaryRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly visible = signal<YearMonth>(currentYearMonth());
  protected readonly nameFilter = signal<string>('');

  protected readonly monthLabel = computed(() => {
    const ym = this.visible();
    return new Date(ym.year, ym.month - 1, 1).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  });

  protected readonly canGoNext = computed(
    () => compareYearMonth(this.visible(), currentYearMonth()) < 0,
  );

  /** Filtered + sorted view — the table receives this directly. */
  protected readonly displayRows = computed(() => {
    const needle = this.nameFilter().trim().toLowerCase();
    const matches = needle
      ? this.rows().filter((r) => `${r.first_name} ${r.last_name}`.toLowerCase().includes(needle))
      : this.rows();
    return [...matches].sort((a, b) => b.count - a.count);
  });

  protected readonly totalDays = computed(() => this.rows().reduce((acc, r) => acc + r.count, 0));

  /**
   * Scheduled training-day count for the visible month, capped at today.
   * `null` when the academy hasn't configured `training_days` — rows fall
   * back to the bare-count display in that state (#88b).
   */
  protected readonly scheduledCount = computed<number | null>(() => {
    const ym = this.visible();
    return countScheduledTrainingDays(
      this.academyService.academy()?.training_days ?? null,
      ym.year,
      ym.month,
    );
  });

  ratePercent(count: number): number | null {
    const r = attendanceRate(count, this.scheduledCount());
    return r === null ? null : Math.round(r * 100);
  }

  ngOnInit(): void {
    // The `?month=YYYY-MM` query param is the single source of truth for the
    // visible month. Prev/next don't load directly — they navigate, the URL
    // emits, and this subscription is the one that mutates state. Removes
    // the duplicate load that would otherwise fire (one direct call + one
    // from the URL change).
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const fromQuery = parseMonthString(params.get('month'));
      const today = currentYearMonth();
      // Reject future months coming in from a hand-crafted URL — server-side
      // there is no data, and the PRD bans future-dated attendance entirely.
      // Re-sync the URL back to the current month and let the next emission
      // (from that navigate) drive the load.
      if (fromQuery && compareYearMonth(fromQuery, today) > 0) {
        this.syncQueryParam(today);
        return;
      }
      const target = fromQuery ?? today;
      this.visible.set(target);
      this.load();
    });
  }

  prevMonth(): void {
    this.syncQueryParam(shiftMonth(this.visible(), -1));
  }

  nextMonth(): void {
    if (!this.canGoNext()) return;
    this.syncQueryParam(shiftMonth(this.visible(), 1));
  }

  protected onFilterChange(value: string): void {
    this.nameFilter.set(value);
  }

  protected trackByAthlete = (_: number, row: AttendanceSummaryRow): number => row.athlete_id;

  private syncQueryParam(target: YearMonth): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { month: toMonthString(target) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private load(): void {
    const epoch = ++this.loadEpoch;
    this.loading.set(true);
    this.errored.set(false);
    this.attendanceService.getMonthlySummary(toMonthString(this.visible())).subscribe({
      next: (rows) => {
        if (epoch !== this.loadEpoch) return;
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        if (epoch !== this.loadEpoch) return;
        this.rows.set([]);
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }
}
