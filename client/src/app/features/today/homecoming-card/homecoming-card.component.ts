import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { LanguageService } from '../../../core/services/language.service';
import { deviceKind } from '../../../core/sync/conflicts';
import { Homecoming } from '../../../core/sync/homecoming';
import { SyncService } from '../../../core/sync/sync.service';
import { localeFor } from '../../../shared/utils/locale';
import { formatCents } from '../../../shared/utils/money';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The homecoming («il rientro», PRD § 6.2, #2039): on Oggi, after this device
 * pulled the other's work, one sentence of where it came from and when, and
 * what it brought. *"Dal telefono, martedì alle 21:47: 14 presenze in BJJ Gi,
 * 2 pagamenti (120,00 €), 1 nuovo atleta."*
 *
 * **It goes once opened:** shown, it is told to the server as seen, and stays
 * on screen until the owner closes it or leaves Oggi. Nothing shows where
 * there is no sync, or nothing arrived.
 */
@Component({
  selector: 'app-homecoming-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, TooltipModule, TranslatePipe],
  templateUrl: './homecoming-card.component.html',
  styleUrl: './homecoming-card.component.scss',
})
export class HomecomingCardComponent {
  private readonly sync = inject(SyncService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly shown = signal<Homecoming | null>(null);

  constructor() {
    effect(() => {
      const arrived = this.sync.homecoming();
      if (arrived !== null) {
        untracked(() => {
          this.shown.set(arrived);
          this.sync.seenHomecoming(arrived);
        });
      }
    });
  }

  protected readonly fromPhone = computed(() => {
    const arrived = this.shown();
    return arrived !== null && deviceKind(arrived.device) === 'phone';
  });

  /** «Dal telefono, martedì alle 21:47»: the card's heading. */
  protected readonly title = computed(() => {
    this.language.currentLang();
    const arrived = this.shown();
    if (arrived === null) {
      return '';
    }
    return this.translate.instant(
      this.fromPhone() ? 'today.homecoming.fromPhone' : 'today.homecoming.fromPc',
      { when: this.when(new Date(arrived.at)) },
    );
  });

  /** What it brought, one phrase each, the presences by lesson first. */
  protected readonly items = computed(() => {
    const lang = this.language.currentLang();
    const arrived = this.shown();
    if (arrived === null) {
      return [];
    }
    const items = arrived.attendance.map((group) =>
      group.lesson === null
        ? this.counted('today.homecoming.presences', group.count)
        : this.counted('today.homecoming.presencesIn', group.count, { lesson: group.lesson }),
    );
    if (arrived.payments.count > 0) {
      items.push(
        this.counted('today.homecoming.payments', arrived.payments.count, {
          amount: formatCents(arrived.payments.amount_cents, 'EUR', lang),
        }),
      );
    }
    if (arrived.athletes > 0) {
      items.push(this.counted('today.homecoming.athletes', arrived.athletes));
    }
    if (arrived.promotions > 0) {
      items.push(this.counted('today.homecoming.promotions', arrived.promotions));
    }
    if (arrived.other > 0) {
      items.push(this.counted('today.homecoming.other', arrived.other));
    }
    return items;
  });

  protected close(): void {
    this.shown.set(null);
  }

  private counted(key: string, count: number, params: Record<string, string> = {}): string {
    return this.translate.instant(`${key}${count === 1 ? 'One' : 'Other'}`, { count, ...params });
  }

  /** Today, yesterday, a weekday within the week, a date before. */
  private when(at: Date): string {
    const locale = localeFor(this.language.currentLang());
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(at);
    const midnight = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((midnight(new Date()) - midnight(at)) / DAY_MS);
    if (days <= 0) {
      return this.translate.instant('today.homecoming.whenToday', { time });
    }
    if (days === 1) {
      return this.translate.instant('today.homecoming.whenYesterday', { time });
    }
    const day =
      days < 7
        ? new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(at)
        : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
    return this.translate.instant('today.homecoming.whenDay', { day, time });
  }
}
