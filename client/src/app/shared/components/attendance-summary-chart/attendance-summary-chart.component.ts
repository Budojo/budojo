import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import {
  AttendanceSummary,
  AttendanceSummaryRange,
  AttendanceSummaryService,
} from '../../../core/services/attendance-summary.service';

/**
 * Shared "% di presenze" chart (#894).
 *
 * Reads `/api/v1/athletes/{id}/attendance/summary?range=N` and renders:
 *  - A donut with the headline rate in the centre (e.g. "75%").
 *  - A short bar timeline below it, one bar per realized lesson day,
 *    colour-encoded (primary = attended, muted = missed).
 *  - A 30 / 90 / 365 range switcher above.
 *
 * Three render states besides loading:
 *  - `errored`     — fetch failed, friendly retry hint.
 *  - `empty`       — `expected_count === 0` (no lessons in the window).
 *                    Do NOT render `0%` — that's misleading; show a hint.
 *  - `ready`       — donut + timeline.
 *
 * Reused by:
 *  - athlete detail attendance tab (owner-side, athleteId from route)
 *  - /me/attendance (athlete-side, athleteId from currentUser.athlete_id)
 */
@Component({
  selector: 'app-attendance-summary-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, FormsModule, SelectButtonModule, SkeletonModule, TranslatePipe],
  templateUrl: './attendance-summary-chart.component.html',
  styleUrl: './attendance-summary-chart.component.scss',
})
export class AttendanceSummaryChartComponent {
  private readonly summaryService = inject(AttendanceSummaryService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly athleteId = input.required<number>();
  /** Initial range. The user can switch via the dropdown afterwards. */
  readonly initialRange = input<AttendanceSummaryRange>(90);

  protected readonly range = signal<AttendanceSummaryRange>(90);
  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly summary = signal<AttendanceSummary | null>(null);

  // `p-selectbutton` types `options` as `any[]` (not readonly), so a
  // ReadonlyArray here trips the strict-templates check (TS4104).
  protected readonly rangeOptions: { label: string; value: AttendanceSummaryRange }[] = [
    { label: '30g', value: 30 },
    { label: '90g', value: 90 },
    { label: '1a', value: 365 },
  ];

  protected readonly hasData = computed<boolean>(() => {
    const s = this.summary();
    return s !== null && s.expected_count > 0;
  });

  /**
   * Headline rate string for the donut centre. The empty-state branch
   * is rendered separately; here we know `expected_count > 0`.
   */
  protected readonly rateLabel = computed<string>(() => {
    const s = this.summary();
    if (s === null || s.rate === null) return '—';
    return `${Math.round(s.rate * 100)}%`;
  });

  protected readonly attendedExpectedLabel = computed<string>(() => {
    const s = this.summary();
    if (s === null) return '';
    return this.translate.instant('attendanceSummary.attendedOfExpected', {
      attended: s.attended_count,
      expected: s.expected_count,
    });
  });

  /**
   * Donut data — single dataset with two slices (attended / missed).
   * Colours are literal hex because the Chart.js canvas can't resolve
   * `var(--*)` tokens. Indigo primary + muted surface, mirroring the
   * stats charts.
   */
  protected readonly donutData = computed(() => {
    const s = this.summary();
    if (s === null) return { labels: [], datasets: [] };
    const missed = Math.max(0, s.expected_count - s.attended_count);
    return {
      labels: [
        this.translate.instant('attendanceSummary.legend.attended'),
        this.translate.instant('attendanceSummary.legend.missed'),
      ],
      datasets: [
        {
          data: [s.attended_count, missed],
          backgroundColor: ['#5b6cff', '#e5e7eb'],
          borderWidth: 0,
        },
      ],
    };
  });

  protected readonly donutOptions = {
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
  } as const;

  /**
   * Timeline bars — one bar per realized lesson day. Height is constant
   * (1 = "lesson happened"); colour is the encoding (primary = athlete
   * attended, muted = missed). Keeps the read fast without needing a
   * legend.
   */
  protected readonly timelineData = computed(() => {
    const s = this.summary();
    if (s === null) return { labels: [], datasets: [] };
    return {
      labels: s.series.map((p) => p.date),
      datasets: [
        {
          data: s.series.map(() => 1),
          backgroundColor: s.series.map((p) => (p.attended ? '#5b6cff' : '#e5e7eb')),
          borderWidth: 0,
        },
      ],
    };
  });

  protected readonly timelineOptions = {
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, max: 1, min: 0 },
    },
    maintainAspectRatio: false,
  } as const;

  constructor() {
    // Pull the input value once on construction; the input is required,
    // so by the time effects run it'll be set. Range switcher updates
    // re-fetch via the effect below.
    effect(() => {
      // Read both signals so the effect re-runs when EITHER changes.
      const athleteId = this.athleteId();
      const range = this.range();
      this.refetch(athleteId, range);
    });

    // Sync the initial range from the input on first run. Has to come
    // BEFORE the effect would otherwise tick with the default 90 —
    // computed signals chain handles it because `range()` is read in
    // the effect above and `set()` here is synchronous.
    queueMicrotask(() => {
      this.range.set(this.initialRange());
    });
  }

  protected onRangeChange(next: AttendanceSummaryRange): void {
    this.range.set(next);
  }

  private refetch(athleteId: number, range: AttendanceSummaryRange): void {
    this.loading.set(true);
    this.errored.set(false);
    this.summaryService
      .fetch(athleteId, range)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.summary.set(s);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
