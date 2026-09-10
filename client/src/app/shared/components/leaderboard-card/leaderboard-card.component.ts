import {
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LanguageService } from '../../../core/services/language.service';
import { formatIsoMonth } from '../../utils/locale';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LeaderboardResult,
  LeaderboardRow,
  LeaderboardService,
} from '../../../core/services/leaderboard.service';

/**
 * Monthly mat-hours leaderboard card (#962). Mounts on both the
 * owner dashboard + the athlete /me/profile. Auto-loads on init
 * for the current month; renders the top-5 + a "you're #N" hint
 * for athletes whose own row is visible.
 *
 * Empty state: zero rows in the window → "No mat hours yet this
 * month" panel (Norman § feedback: clear, friendly default).
 */
@Component({
  selector: 'app-leaderboard-card',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leaderboard-card.component.html',
  styleUrl: './leaderboard-card.component.scss',
})
export class LeaderboardCardComponent {
  private readonly service = inject(LeaderboardService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly languageService = inject(LanguageService);

  protected readonly status = signal<'loading' | 'ok' | 'error' | 'empty'>('loading');
  protected readonly rows = signal<readonly LeaderboardRow[]>([]);
  /** The API's `meta.month`, an ISO `YYYY-MM`. */
  private readonly monthIso = signal<string>('');

  /**
   * The period this card covers, as a person reads it (#1498).
   *
   * The template rendered `meta.month` verbatim, so the label beside "Top of
   * the mat — this month" read `2026-04`.
   */
  protected readonly month = computed(() =>
    this.monthIso() ? formatIsoMonth(this.monthIso(), this.languageService.currentLang()) : '',
  );

  constructor() {
    this.service
      .getLeaderboard()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: LeaderboardResult) => {
          if (result.status === 'ok') {
            const data = result.page.data;
            this.monthIso.set(result.page.meta.month);
            if (data.length === 0) {
              this.status.set('empty');
            } else {
              this.rows.set(data);
              this.status.set('ok');
            }
          } else {
            // no-academy + bad-month both collapse to a silent error
            // panel — the card is informational, not load-bearing.
            this.status.set('error');
          }
        },
        error: () => this.status.set('error'),
      });
  }
}
