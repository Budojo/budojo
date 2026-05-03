import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { LanguageService } from '../../../core/services/language.service';
import { AgeBandsPayload, StatsService } from '../../../core/services/stats.service';

type ScopeValue = 'kids' | 'adults' | 'all';

@Component({
  selector: 'app-stats-athletes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, FormsModule, SelectButtonModule, SkeletonModule, TranslatePipe],
  templateUrl: './stats-athletes.component.html',
  styleUrl: './stats-athletes.component.scss',
})
export class StatsAthletesComponent {
  private readonly stats = inject(StatsService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly payload = signal<AgeBandsPayload>({ bands: [], total: 0, missing_dob: 0 });
  protected readonly scope = signal<ScopeValue>('all');

  /** Scope toggle options — re-evaluated when the active locale changes. */
  protected readonly scopeOptions = computed(() => {
    // Depend on the current language signal so labels re-render on locale switch.
    this.language.currentLang();
    return [
      { label: this.translate.instant('stats.athletes.scope.all'), value: 'all' as ScopeValue },
      { label: this.translate.instant('stats.athletes.scope.kids'), value: 'kids' as ScopeValue },
      {
        label: this.translate.instant('stats.athletes.scope.adults'),
        value: 'adults' as ScopeValue,
      },
    ];
  });

  /** Bands filtered to the selected scope ('all' passes everything through). */
  protected readonly visibleBands = computed(() => {
    const s = this.scope();
    const bands = this.payload().bands;
    return s === 'all' ? bands : bands.filter((b) => b.category === s);
  });

  // "empty" means no athletes with a usable DOB — missing-dob athletes are
  // excluded from all bands and would render an all-zero chart.
  protected readonly isEmpty = computed(() => {
    const p = this.payload();
    return p.total - p.missing_dob === 0;
  });

  /**
   * Chart.js data derived from the visible bands.
   *
   * The label key is built dynamically from `b.code` — safe here because
   * `AgeBandCode` is a closed literal union (13 members) and the i18n parity
   * spec verifies all 13 `stats.athletes.bands.*` keys exist in both locales.
   */
  protected readonly chartData = computed(() => {
    const bands = this.visibleBands();
    return {
      labels: bands.map((b) => this.translate.instant(`stats.athletes.bands.${b.code}`)),
      datasets: [
        {
          data: bands.map((b) => b.count),
          // Primary indigo — uniform with the payments tab. Heatmap is
          // intentionally per-month rainbow because there color encodes
          // information; Athletes / Payments are monocolor by design.
          // Literal hex because Chart.js canvas can't resolve var(--*).
          backgroundColor: '#5b6cff',
        },
      ],
    };
  });

  protected readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  } as const;

  constructor() {
    this.stats
      .ageBands()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (data) => {
          this.payload.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
