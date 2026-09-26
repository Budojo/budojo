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
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import {
  AthleteService,
  type NextStep,
  type PromotionCandidate,
} from '../../../core/services/athlete.service';
import { BeltLadderService } from '../../../core/services/belt-ladder.service';
import { LanguageService } from '../../../core/services/language.service';
import { AthleteIdentityComponent } from '../../../shared/components/athlete-identity/athlete-identity.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LocaleDatePipe } from '../../../shared/pipes/locale-date.pipe';

/** Which date the row's "since" line reads from. */
type SinceLine =
  | { kind: 'stripe'; date: string; grade: string | null }
  | { kind: 'belt'; date: string }
  | { kind: 'none' };

/**
 * Who to promote? (#1841) — every active athlete with the facts a coach reads
 * before a promotion, side by side: time on the belt, the last promotion,
 * the training days since, and the next step as the academy's ladder counts
 * it.
 *
 * **No score, no threshold, no highlight.** The order is the server's (longest
 * since the last promotion first), and every row is drawn the same way: a row
 * singled out in colour would be a verdict the owner did not reach. The
 * decision is theirs; this page only saves them the counting.
 *
 * Read-only. The name opens the athlete's promotion timeline, where a
 * promotion is recorded.
 */
@Component({
  selector: 'app-promotion-candidates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    ButtonModule,
    SkeletonModule,
    AthleteIdentityComponent,
    EmptyStateComponent,
    PageHeaderComponent,
    LocaleDatePipe,
  ],
  templateUrl: './promotion-candidates.component.html',
  styleUrl: './promotion-candidates.component.scss',
})
export class PromotionCandidatesComponent implements OnInit {
  private readonly athletes = inject(AthleteService);
  private readonly beltLadder = inject(BeltLadderService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<PromotionCandidate[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly countLabel = computed(() => {
    this.languageService.currentLang();
    if (this.loading() || this.failed()) return '';
    const count = this.rows().length;
    return this.translate.instant(
      count === 1 ? 'athletes.ready.countOne' : 'athletes.ready.countOther',
      { count },
    );
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.athletes
      .promotionCandidates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }

  protected goToRoster(): void {
    void this.router.navigate(['/dashboard/athletes']);
  }

  /** Time on the belt, in whole months — or null with no belt row. */
  protected monthsLabel(row: PromotionCandidate): string | null {
    this.languageService.currentLang();
    const months = row.months_at_belt;
    if (months === null) return null;
    if (months === 0) return this.translate.instant('athletes.ready.underAMonthOnBelt');
    return this.translate.instant(
      months === 1 ? 'athletes.ready.monthsOnBeltOne' : 'athletes.ready.monthsOnBeltOther',
      { count: months },
    );
  }

  /**
   * What "since" counts from: the last stripe given on this belt (a dan or a
   * poom named as such), otherwise the belt itself.
   */
  protected sinceLine(row: PromotionCandidate): SinceLine {
    if (row.stripe_since !== null) {
      const belt = row.athlete.belt;
      const grade = this.beltLadder.countsStripes(belt)
        ? null
        : this.beltLadder.stripesLabel(belt, row.athlete.stripes);
      return { kind: 'stripe', date: row.stripe_since, grade };
    }
    if (row.belt_since !== null) return { kind: 'belt', date: row.belt_since };
    return { kind: 'none' };
  }

  protected sessionsLabel(row: PromotionCandidate): string {
    this.languageService.currentLang();
    const count = row.sessions_since_last_promotion ?? 0;
    return this.translate.instant(
      count === 1 ? 'athletes.ready.sessionsSinceOne' : 'athletes.ready.sessionsSinceOther',
      { count },
    );
  }

  /**
   * The next step in the ladder's own words: "stripe 3", "4° dan", or the
   * next belt's name.
   */
  protected nextLabel(next: NextStep | null): string {
    this.languageService.currentLang();
    if (next === null) return this.translate.instant('athletes.ready.topOfLadder');
    if (next.kind === 'belt') return this.beltLadder.label(next.belt);
    return this.beltLadder.countsStripes(next.belt)
      ? this.translate.instant('athletes.ready.nextStripe', { n: next.stripes })
      : this.beltLadder.stripesLabel(next.belt, next.stripes);
  }
}
