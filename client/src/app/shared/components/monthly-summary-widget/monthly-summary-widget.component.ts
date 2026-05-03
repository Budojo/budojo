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
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyService } from '../../../core/services/academy.service';
import { AttendanceService, AttendanceSummaryRow } from '../../../core/services/attendance.service';
import { LanguageService } from '../../../core/services/language.service';
import { attendanceRate, countScheduledTrainingDays } from '../../utils/attendance-rate';
import { localeFor } from '../../utils/locale';

/**
 * YYYY-MM for the current calendar month, derived from local components so the
 * label matches what the user reads on the wall clock — `toISOString()` would
 * shift to UTC and could pick the wrong month near midnight in non-UTC TZs.
 */
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Dashboard widget: top training-day counts for the current month.
 *
 * Same shape as `ExpiringDocumentsWidgetComponent` — self-contained fetch on
 * init, skeleton while loading, muted error fallback. The whole tile is a
 * `<a routerLink>` to the full summary page so the keyboard surface stays
 * one element (Jakob's: links look like links).
 */
@Component({
  selector: 'app-monthly-summary-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SkeletonModule, TranslatePipe],
  templateUrl: './monthly-summary-widget.component.html',
  styleUrl: './monthly-summary-widget.component.scss',
})
export class MonthlySummaryWidgetComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly academyService = inject(AcademyService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<AttendanceSummaryRow[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);

  protected readonly month = currentYearMonth();

  /** Top 5 by descending count — typical small dojos may have fewer rows total. */
  protected readonly topRows = computed<AttendanceSummaryRow[]>(() =>
    [...this.rows()].sort((a, b) => b.count - a.count).slice(0, 5),
  );

  /** Total training-days across the academy this month. */
  protected readonly totalDays = computed<number>(() =>
    this.rows().reduce((acc, r) => acc + r.count, 0),
  );

  /**
   * Headline metric (#170): average athletes per session this month.
   * Computed as `total attendance events / scheduled sessions elapsed`,
   * where the denominator is the same `scheduledCount` value the per-row
   * rate already uses (a count of weekdays in `training_days` whose
   * date is ≤ today — i.e. sessions that *should* have happened by now,
   * not literally those with attendance records). Same denominator as
   * the per-row `X / Y · Z%` display, so the headline and the rows
   * stay numerically consistent.
   *
   * Returns `null` when the denominator is missing — academies that
   * haven't configured `training_days` (no scheduledCount) or before
   * the first scheduled session of the month has elapsed
   * (scheduledCount === 0). The template renders an em-dash in those
   * cases so the user gets a clear "not enough data yet" signal
   * instead of a misleading zero.
   *
   * Decimal precision: rounded to 1 decimal so small dojos (10–20
   * athletes, 12–20 sessions/month) see the value move meaningfully
   * across the month without integer banding hiding the signal. Note
   * that 0.0 IS a valid value here (e.g. 1 attendance event / 25
   * scheduled sessions rounds to 0.0) — the template binds via an
   * explicit null check, not truthiness, so the zero shows.
   */
  protected readonly avgAthletesPerSession = computed<number | null>(() => {
    const sessions = this.scheduledCount();
    const total = this.totalDays();
    if (sessions === null || sessions === 0 || total === 0) return null;
    return Math.round((total / sessions) * 10) / 10;
  });

  /**
   * Sessions actually held by the academy in the current month (capped at
   * today). Drives the per-row "count / scheduled · pct%" display when the
   * academy has configured `training_days`. `null` when not configured —
   * rows fall back to the bare count display (#88b).
   */
  protected readonly scheduledCount = computed<number | null>(() => {
    const [y, m] = this.month.split('-').map(Number);
    return countScheduledTrainingDays(this.academyService.academy()?.training_days ?? null, y, m);
  });

  /** Per-row whole-percent helper. `null` when the row has no denominator yet. */
  ratePercent(count: number): number | null {
    const r = attendanceRate(count, this.scheduledCount());
    return r === null ? null : Math.round(r * 100);
  }

  protected readonly monthLabel = computed<string>(() => {
    const [y, m] = this.month.split('-').map(Number);
    const locale = localeFor(this.languageService.currentLang());
    return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  });

  ngOnInit(): void {
    this.attendanceService
      .getMonthlySummary(this.month)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
