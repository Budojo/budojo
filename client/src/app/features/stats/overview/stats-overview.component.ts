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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { mergeMap, range, toArray } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import {
  Athlete,
  AthleteService,
  AthleteStatus,
  Belt,
} from '../../../core/services/athlete.service';
import { LanguageService } from '../../../core/services/language.service';
import {
  BELT_KEYS,
  BELT_ORDER,
  STATUS_KEYS,
  STATUS_ORDER,
} from '../../../shared/utils/i18n-enum-keys';

/**
 * Belt colour palette — one entry per IBJJF rank. Hex values rather
 * than CSS custom properties because Chart.js renders to a `<canvas>`
 * and reads colours at draw time, not via the cascade. Lives here
 * (not in the global theme tokens) because it's domain-specific to
 * the stats surface — every other belt rendering uses the
 * `--budojo-belt-*` tokens via SCSS.
 *
 * The exception is documented in `client/CLAUDE.md` § Design canon
 * (gotchas): "Exceptions are belt colors (domain palette) with a
 * rationale comment".
 */
const BELT_COLORS: Readonly<Record<Belt, string>> = {
  grey: '#9ca3af',
  yellow: '#facc15',
  orange: '#f97316',
  green: '#22c55e',
  white: '#f3f4f6',
  blue: '#3b82f6',
  purple: '#a855f7',
  brown: '#92400e',
  black: '#1f2937',
  'red-and-black': '#dc2626',
  'red-and-white': '#ef4444',
  red: '#b91c1c',
};

/**
 * Status palette mirrors the in-app severity tokens used by the
 * paid badge / status tag — `success` / `warn` / `secondary`.
 */
const STATUS_COLORS: Readonly<Record<AthleteStatus, string>> = {
  active: '#22c55e',
  suspended: '#f59e0b',
  inactive: '#6b7280',
};

interface DoughnutData {
  readonly labels: readonly string[];
  readonly datasets: readonly {
    data: readonly number[];
    backgroundColor: readonly string[];
    borderWidth: number;
  }[];
}

/**
 * Stats overview child component (`/dashboard/stats/overview`). Surfaces
 * two client-side aggregations from the athletes list — belt distribution
 * and status breakdown — rendered as PrimeNG `<p-chart>` doughnuts.
 *
 * Why client-side aggregation: the existing `GET /api/v1/athletes`
 * endpoint paginates 20 rows per page, so we iterate through every
 * page on init to reach the full set. For typical academy sizes
 * (< 200 athletes) this is 5-10 round trips of ≤ 20 rows each — fast
 * enough that introducing a dedicated server-side aggregation
 * endpoint would be premature optimisation. When attendance / revenue
 * trends land later (separate PR), we'll add `/api/v1/stats/*`
 * endpoints because those aggregations don't have an existing
 * fetch-all endpoint to reuse.
 *
 * Locale-aware: the chart labels (belt names, status names) flow
 * through the `belts.*` / `statuses.*` translation keys, so toggling
 * EN ↔ IT re-renders both charts in the active language.
 */
@Component({
  selector: 'app-stats-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ChartModule, SkeletonModule],
  templateUrl: './stats-overview.component.html',
  styleUrl: './stats-overview.component.scss',
})
export class StatsOverviewComponent implements OnInit {
  private readonly athleteService = inject(AthleteService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly athletes = signal<readonly Athlete[]>([]);

  protected readonly totalAthletes = computed(() => this.athletes().length);

  /**
   * Belt distribution computed reactively against
   * `languageService.currentLang()` so the labels reflect the active
   * UI language without a manual subscription. Belt colours are
   * domain-stable (a blue belt is blue regardless of locale), so they
   * stay in the static palette above.
   */
  protected readonly beltChartData = computed<DoughnutData>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const counts = new Map<Belt, number>();
    for (const a of this.athletes()) {
      counts.set(a.belt, (counts.get(a.belt) ?? 0) + 1);
    }
    // Walk the canonical IBJJF order so the slices appear in rank
    // order (kids → adults → senior coral / red), making the chart
    // legend a glance-readable progression chart.
    const presentBelts = BELT_ORDER.filter((b) => counts.has(b));
    return {
      labels: presentBelts.map((b) => this.translate.instant(BELT_KEYS[b])),
      datasets: [
        {
          data: presentBelts.map((b) => counts.get(b) ?? 0),
          backgroundColor: presentBelts.map((b) => BELT_COLORS[b]),
          borderWidth: 1,
        },
      ],
    };
  });

  protected readonly statusChartData = computed<DoughnutData>(() => {
    this.languageService.currentLang();
    const counts = new Map<AthleteStatus, number>();
    for (const a of this.athletes()) {
      counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    }
    const presentStatuses = STATUS_ORDER.filter((s) => counts.has(s));
    return {
      labels: presentStatuses.map((s) => this.translate.instant(STATUS_KEYS[s])),
      datasets: [
        {
          data: presentStatuses.map((s) => counts.get(s) ?? 0),
          backgroundColor: presentStatuses.map((s) => STATUS_COLORS[s]),
          borderWidth: 1,
        },
      ],
    };
  });

  protected readonly chartOptions = {
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 16,
          usePointStyle: true,
          font: { size: 12 },
        },
      },
      tooltip: {
        // Show the absolute count + percentage of total in the
        // hover tooltip so the user can read the chart without doing
        // arithmetic in their head ("8 atleti — 53%").
        callbacks: {
          label: (ctx: { label: string; parsed: number; dataset: { data: number[] } }) => {
            const total = ctx.dataset.data.reduce((acc, v) => acc + v, 0);
            const pct = total === 0 ? 0 : Math.round((ctx.parsed / total) * 100);
            return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
          },
        },
      },
    },
    cutout: '60%',
    maintainAspectRatio: false,
  } as const;

  ngOnInit(): void {
    this.loadAllAthletes();
  }

  /**
   * Iterate every page of `GET /api/v1/athletes` and concat into one
   * flat array. The API paginates at 20 rows/page; we read page 1
   * first to learn `meta.last_page`, then fetch pages 2..N in
   * parallel via `mergeMap` (concurrency: 4 — polite to the
   * server, fast in practice). Empty academies short-circuit on the
   * first response.
   *
   * `takeUntilDestroyed(destroyRef)` ensures a slow tail of pending
   * page requests doesn't update the signal after the user has
   * navigated away.
   */
  private loadAllAthletes(): void {
    this.loading.set(true);
    this.errored.set(false);

    this.athleteService
      .list({ page: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (firstPage) => {
          const lastPage = firstPage.meta.last_page;
          if (lastPage <= 1) {
            this.athletes.set(firstPage.data);
            this.loading.set(false);
            return;
          }

          // Fetch pages 2..lastPage with bounded concurrency.
          range(2, lastPage - 1)
            .pipe(
              mergeMap((p) => this.athleteService.list({ page: p }), 4),
              toArray(),
              takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
              next: (rest) => {
                const allRows = [...firstPage.data, ...rest.flatMap((r) => r.data)];
                this.athletes.set(allRows);
                this.loading.set(false);
              },
              error: () => this.handleError(),
            });
        },
        error: () => this.handleError(),
      });
  }

  private handleError(): void {
    this.errored.set(true);
    this.loading.set(false);
  }
}
