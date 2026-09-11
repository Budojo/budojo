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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { AcademyService } from '../../../core/services/academy.service';
import { AttendanceService, AttendanceSummaryRow } from '../../../core/services/attendance.service';
import { LanguageService } from '../../../core/services/language.service';
import {
  attendanceRate,
  countScheduledTrainingDays,
  schedulesForAcademy,
} from '../../../shared/utils/attendance-rate';
import { localeFor } from '../../../shared/utils/locale';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { SortToggleComponent } from '../../../shared/components/sort-toggle/sort-toggle.component';
import {
  nameSortAria,
  nameSortSignifier,
  nameSortTooltipKey,
  nextNameSort,
  type SortState,
} from '../../../shared/utils/athlete-sort';
import type { AthleteSortOrder } from '../../../core/services/athlete.service';

interface YearMonth {
  year: number;
  month: number; // 1-indexed
}

/** What this table can be ordered by. `days` is the column only it has. */
type SummarySortField = 'first_name' | 'last_name' | 'days';

/**
 * Locale-aware name comparison, leading with `primary` and breaking ties on the
 * other field in the same direction — the same CYCLE as the server's
 * `applyNameSort` (#196), but not the same collation.
 *
 * The server orders through SQLite's default BINARY collation, which sorts by
 * code point: `Ángela` lands after `Zoe`, and a lower-case `de Rossi` after
 * `Zanetti`. `localeCompare` puts both where an Italian reader expects them, so
 * this list and the roster can disagree on an accented surname. The client
 * behaviour is the right one; aligning the server is #1527, not this.
 */
function compareNames(
  a: AttendanceSummaryRow,
  b: AttendanceSummaryRow,
  primary: 'first_name' | 'last_name',
  direction: number,
): number {
  const secondary = primary === 'first_name' ? 'last_name' : 'first_name';
  const lead = a[primary].localeCompare(b[primary]);
  return (lead !== 0 ? lead : a[secondary].localeCompare(b[secondary])) * direction;
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
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    SkeletonModule,
    TableModule,
    TranslatePipe,
    PageHeaderComponent,
    ErrorStateComponent,
    SortHeaderComponent,
    SortToggleComponent,
  ],
  templateUrl: './monthly-summary.component.html',
  styleUrl: './monthly-summary.component.scss',
})
export class MonthlySummaryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attendanceService = inject(AttendanceService);
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
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
    const locale = localeFor(this.languageService.currentLang());
    const label = new Date(ym.year, ym.month - 1, 1).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });

    // Italian writes month names lower-case in running text, so the formatter
    // hands back "agosto 2026" — correct as prose, wrong as a page title, which
    // the design canon says is sentence case. English already arrives
    // capitalised, so this is a no-op there rather than a second code path.
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  });

  protected readonly canGoNext = computed(
    () => compareYearMonth(this.visible(), currentYearMonth()) < 0,
  );

  /**
   * How the table is ordered (#1526). `days` is the default and the reason
   * this page exists — who turned up, most first — but it was the ONLY order
   * on offer, and the opposite question ("who has stopped coming") is the one
   * an instructor opens a monthly summary to answer.
   *
   * Sorted here rather than on the wire: the endpoint returns the month whole,
   * so every order is a comparison away and a round-trip would buy nothing.
   */
  protected readonly sortField = signal<SummarySortField>('days');
  protected readonly sortOrder = signal<AthleteSortOrder>('desc');

  /**
   * The order as the shared name helpers want it — `days` is not a name, so it
   * reads to them as "sorted by something else", which is exactly right.
   */
  private readonly nameState = computed<SortState>(() => {
    const field = this.sortField();
    return { field: field === 'days' ? null : field, order: this.sortOrder() };
  });

  /** Filtered + sorted view — the table receives this directly. */
  protected readonly displayRows = computed(() => {
    const needle = this.nameFilter().trim().toLowerCase();
    const matches = needle
      ? this.rows().filter((r) => `${r.first_name} ${r.last_name}`.toLowerCase().includes(needle))
      : this.rows();

    const field = this.sortField();
    const direction = this.sortOrder() === 'asc' ? 1 : -1;

    return [...matches].sort((a, b) => {
      if (field === 'days') {
        // A count over a roster of dozens ties constantly — half a class shares
        // "3 this month" — so the name breaks it, always ascending. Without a
        // stable second key the tied block reorders itself on every recompute.
        // Same reasoning as the roster's server-side tiebreak (#1447).
        return (a.count - b.count) * direction || compareNames(a, b, 'last_name', 1);
      }
      return compareNames(a, b, field, direction);
    });
  });

  protected readonly totalDays = computed(() => this.rows().reduce((acc, r) => acc + r.count, 0));

  /** "21 giorni · 32 atleti" — single combined chip for the page-header. */
  protected readonly summaryCountLabel = computed<string>(() => {
    const days = this.totalDays();
    const athletes = this.rows().length;
    const daysKey = days === 1 ? 'attendance.summary.daysOne' : 'attendance.summary.daysOther';
    const athletesKey =
      athletes === 1 ? 'attendance.summary.athletesOne' : 'attendance.summary.athletesOther';
    return `${this.translate.instant(daysKey, { count: days })} · ${this.translate.instant(athletesKey, { count: athletes })}`;
  });

  /**
   * Scheduled training-day count for the visible month, capped at today.
   * `null` when the academy hasn't configured `training_days` — rows fall
   * back to the bare-count display in that state (#88b).
   */
  protected readonly scheduledCount = computed<number | null>(() => {
    const ym = this.visible();
    // Schedule-history aware (#1094) — see attendance-history.component
    // for the segment-math rationale.
    return countScheduledTrainingDays(
      schedulesForAcademy(this.academyService.academy()),
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

  // ── Sorting (#1526) ────────────────────────────────────────────────────────
  // The name column borrows the roster's 4-state cycle wholesale; `days` gets
  // the 2-state one, because a single count has no lead to choose — only a
  // direction — and it opens descending for the reason every leaderboard does.

  protected cycleNameSort(): void {
    const next = nextNameSort(this.nameState());
    // `nextNameSort` only ever returns a name field, so this is total.
    this.sortField.set(next.field as 'first_name' | 'last_name');
    this.sortOrder.set(next.order);
  }

  protected cycleDaysSort(): void {
    if (this.sortField() === 'days') {
      this.sortOrder.set(this.sortOrder() === 'desc' ? 'asc' : 'desc');
      return;
    }
    this.sortField.set('days');
    this.sortOrder.set('desc');
  }

  protected readonly nameSortLabel = computed<string | null>(() =>
    nameSortSignifier(this.nameState()),
  );

  protected readonly nameSortTooltip = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return this.translate.instant(nameSortTooltipKey(this.nameState()));
  });

  protected readonly nameAriaSort = computed<'ascending' | 'descending' | 'none'>(() =>
    nameSortAria(this.nameState()),
  );

  /**
   * One arrow, no letter: the column carries a single number, so there is no
   * lead to abbreviate — unlike the roster's Sessions column, which carries
   * two and needs `M` / `T` to say which one is driving.
   */
  protected readonly daysSortLabel = computed<string | null>(() => {
    if (this.sortField() !== 'days') return null;
    return this.sortOrder() === 'asc' ? '↑' : '↓';
  });

  protected readonly daysSortTooltip = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    if (this.sortField() !== 'days') {
      return this.translate.instant('attendance.summary.tooltip.daysInitial');
    }
    return this.translate.instant(
      this.sortOrder() === 'asc'
        ? 'attendance.summary.tooltip.daysAsc'
        : 'attendance.summary.tooltip.daysDesc',
    );
  });

  protected readonly daysAriaSort = computed<'ascending' | 'descending' | 'none'>(() => {
    if (this.sortField() !== 'days') return 'none';
    return this.sortOrder() === 'asc' ? 'ascending' : 'descending';
  });

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
