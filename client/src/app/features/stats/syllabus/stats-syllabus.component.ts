import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AcademyService } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { StatsService, SyllabusCoverage } from '../../../core/services/stats.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { localeFor } from '../../../shared/utils/locale';

type KindFilter = 'all' | 'gi' | 'nogi';

interface FilterOption {
  readonly label: string;
  readonly value: KindFilter;
}

/**
 * Syllabus coverage across the season (#1565).
 *
 * The screen the epic was asked for: what has been covered this season, what
 * has barely been touched, what has not been taught at all. A chart of raw
 * tag counts would be decoration; this one reads against the academy's own
 * programme, inside its own season, which makes it a teaching plan.
 *
 * **Covered takes two lessons.** One is `thin` — teaching a thing once in
 * September and calling it done is exactly the self-deception the screen
 * exists to prevent, and a single percentage would hide it.
 *
 * The three states are one hue at three strengths, not three hues (#1550):
 * they are a scale — done, partly, not at all — and a palette would claim
 * they are unrelated categories.
 */
@Component({
  selector: 'app-stats-syllabus',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    ChartModule,
    SelectButtonModule,
    SkeletonModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './stats-syllabus.component.html',
  styleUrl: './stats-syllabus.component.scss',
})
export class StatsSyllabusComponent {
  private readonly stats = inject(StatsService);
  private readonly academyService = inject(AcademyService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal<boolean>(true);
  protected readonly failed = signal<boolean>(false);
  protected readonly report = signal<SyllabusCoverage | null>(null);

  protected readonly kind = signal<KindFilter>('all');
  protected readonly seasonsBack = signal<number>(0);

  constructor() {
    this.load();
  }

  protected readonly kindOptions = computed<FilterOption[]>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return [
      { label: this.translate.instant('stats.syllabus.filter.all'), value: 'all' },
      { label: this.translate.instant('stats.syllabus.filter.gi'), value: 'gi' },
      { label: this.translate.instant('stats.syllabus.filter.nogi'), value: 'nogi' },
    ];
  });

  /**
   * Nothing in the programme for this filter. Distinct from "nothing taught":
   * an academy with no syllabus is told to go and write one, and an academy
   * with one and no lessons is told to go and teach.
   */
  protected readonly nothingInScope = computed<boolean>(
    () => (this.report()?.totals.in_scope ?? 0) === 0,
  );

  protected readonly nothingTaught = computed<boolean>(
    () => !this.nothingInScope() && (this.report()?.taught.length ?? 0) === 0,
  );

  /** The previous season is offered only once this one is not the first. */
  protected readonly canGoBack = computed<boolean>(() => this.seasonsBack() < 1);

  protected setKind(kind: KindFilter): void {
    if (kind === this.kind()) return;
    this.kind.set(kind);
    this.load();
  }

  protected shiftSeason(by: number): void {
    const next = Math.max(0, this.seasonsBack() + by);
    if (next === this.seasonsBack()) return;
    this.seasonsBack.set(next);
    this.load();
  }

  /** Segment widths as percentages of the position's own scope. */
  protected segment(value: number, total: number): string {
    return total === 0 ? '0%' : `${(value / total) * 100}%`;
  }

  /** "12 Oct" — the day a topic was last on the mat, in the reader's locale. */
  protected shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
  }

  /**
   * "3 weeks ago" — the answer to "didn't I just do armbars?", which is a
   * question about distance, not about a date. Whole weeks once past seven
   * days, because nobody plans in days at this range.
   */
  protected ago(iso: string): string {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const [y, m, d] = iso.split('-').map(Number);
    const then = new Date(y, m - 1, d).getTime();
    const now = new Date();
    const days = Math.max(
      0,
      Math.round(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - then) / 86_400_000,
      ),
    );

    if (days === 0) return this.translate.instant('stats.syllabus.ago.today');
    if (days === 1) return this.translate.instant('stats.syllabus.ago.yesterday');
    if (days < 7) return this.translate.instant('stats.syllabus.ago.days', { count: days });
    const weeks = Math.floor(days / 7);
    return weeks === 1
      ? this.translate.instant('stats.syllabus.ago.weekOne')
      : this.translate.instant('stats.syllabus.ago.weeks', { count: weeks });
  }

  /**
   * Cumulative covered topics across the season.
   *
   * Literal hex because Chart.js draws on a canvas and cannot resolve
   * `var(--*)` — the same reason the payments chart carries its own copy of
   * the primary indigo.
   */
  protected readonly timelineData = computed(() => {
    const points = this.report()?.timeline ?? [];
    return {
      labels: points.map((p) => this.shortDate(p.on)),
      datasets: [
        {
          data: points.map((p) => p.covered),
          borderColor: '#5b6cff',
          backgroundColor: '#5b6cff22',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  });

  protected readonly timelineOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        // The denominator, so the line is read against what there was to do
        // rather than against its own maximum.
        suggestedMax: this.report()?.totals.in_scope ?? undefined,
        ticks: { precision: 0 },
      },
      x: { ticks: { maxTicksLimit: 6 } },
    },
  }));

  protected readonly seasonLabel = computed<string>(
    () => this.report()?.season.label ?? this.academyService.academy()?.season_label ?? '',
  );

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);

    const kind = this.kind();

    this.stats.syllabusCoverage(this.seasonsBack(), kind === 'all' ? null : kind).subscribe({
      next: (report) => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => {
        this.report.set(null);
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected retry(): void {
    this.load();
  }
}
