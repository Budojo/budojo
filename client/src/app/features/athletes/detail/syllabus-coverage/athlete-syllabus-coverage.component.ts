import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { AthleteSyllabusCoverage, StatsService } from '../../../../core/services/stats.service';
import { LanguageService } from '../../../../core/services/language.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/components/error-state/error-state.component';
import { relativeDay } from '../../../../shared/utils/relative-day';
import { localeFor } from '../../../../shared/utils/locale';

/**
 * What this athlete has seen of the programme, and what they missed (#1567).
 *
 * Somebody away for six weeks did not miss "six lessons" — they missed
 * specific topics, and "you have not seen guard retention since March" is a
 * sentence worth being able to say.
 *
 * **This screen is about a person, so it reads as "here is what to catch up
 * on" and never as a ranking.** Three decisions carry that, and none of them
 * is decoration:
 *
 * - The denominator is what the academy actually **taught**, not the whole
 *   syllabus. A topic nobody has covered is the programme's gap, not theirs,
 *   and it is reported beside the number rather than inside it.
 * - Nothing before `joined_at` counts. A white belt who walked in last month
 *   did not miss October.
 * - Presences that name no lesson are stated, not counted as absence. A gap
 *   that is really a missing record would be a lie about a person.
 */
@Component({
  selector: 'app-athlete-syllabus-coverage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, SkeletonModule, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './athlete-syllabus-coverage.component.html',
  styleUrl: './athlete-syllabus-coverage.component.scss',
})
export class AthleteSyllabusCoverageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly stats = inject(StatsService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly loading = signal<boolean>(true);
  protected readonly failed = signal<boolean>(false);
  protected readonly report = signal<AthleteSyllabusCoverage | null>(null);

  /** Bumped by retry; the effect below watches it. */
  private readonly reloadTick = signal<number>(0);

  /**
   * The athlete comes from the parent route, the same way every sibling tab
   * reads it. `parent` is optional rather than asserted, and the id goes
   * through `Number.isFinite` rather than a truthiness check: `Number('x')` is
   * NaN and `0 || null` is null, and neither of those should be told apart
   * from "no athlete" by accident.
   */
  private readonly athleteId = toSignal(
    (this.route.parent?.paramMap ?? of(convertToParamMap({}))).pipe(
      map((p) => {
        const id = Number(p.get('id'));

        return Number.isFinite(id) && p.get('id') !== null ? id : null;
      }),
    ),
    { initialValue: null },
  );

  constructor() {
    effect((onCleanup) => {
      const id = this.athleteId();
      this.reloadTick();

      if (id === null) return;

      this.loading.set(true);
      this.failed.set(false);

      const sub = this.stats.athleteSyllabusCoverage(id).subscribe({
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

      onCleanup(() => sub.unsubscribe());
    });
  }

  /**
   * The academy has taught nothing this athlete could have been at. Distinct
   * from "they missed everything", and the difference matters: one is a
   * sentence about the programme, the other about a person.
   */
  protected readonly nothingTaught = computed<boolean>(
    () => (this.report()?.totals.taught_by_academy ?? 0) === 0,
  );

  protected readonly hasProgramme = computed<boolean>(() => {
    const t = this.report()?.totals;
    return t !== undefined && t.taught_by_academy + t.not_taught_yet > 0;
  });

  /** The empty state's way out: write a programme before measuring against it. */
  protected goToProgramme(): void {
    void this.router.navigate(['/dashboard/academy/syllabus']);
  }

  /** Segment widths as a share of what the academy taught. */
  protected segment(value: number): string {
    const total = this.report()?.totals.taught_by_academy ?? 0;
    return total === 0 ? '0%' : `${(value / total) * 100}%`;
  }

  /** "12 Mar" — a day, in the reader's locale. */
  protected shortDate(iso: string): string {
    if (iso === '') return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
  }

  /**
   * "3 weeks ago" — the shared helper (#1602), so the wording and its
   * pluralisation live in one place rather than drifting between the two
   * coverage screens.
   */
  protected ago(iso: string): string {
    this.languageService.currentLang(); // signal dep — recompute on toggle

    return relativeDay(iso, this.translate);
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }
}
