import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyService } from '../../../../core/services/academy.service';
import { LanguageService } from '../../../../core/services/language.service';
import { PaymentsSummary, StatsService } from '../../../../core/services/stats.service';
import { academyChargesAFee } from '../../../../shared/utils/academy-fee';
import { localeFor } from '../../../../shared/utils/locale';
import { formatCents } from '../../../../shared/utils/money';

/** What the four tiles print, already written in the owner's language. */
interface SummaryView {
  readonly expected: string;
  readonly collected: string;
  readonly rate: string;
  readonly outstanding: string;
}

/**
 * This month's money in four figures, above the chart they summarise (#1759).
 *
 * **The current month only.** The payload's `estimated` flag exists for the
 * day a month stepper does; a stepper now would ship a control whose every
 * step back returns an approximation nobody has been warned about.
 *
 * **The rate is read, never computed.** An academy expecting nothing gets
 * `collection_rate: null` and an em-dash; dividing here would print `NaN%`
 * exactly there. `collected_cents` is the chart's own bucket for the month,
 * so the tile and the bar two centimetres below it cannot disagree.
 *
 * Nothing at all for an academy that charges no fee — the same gate the paid
 * badge and the unpaid widget use — and nothing asked of the server either.
 */
@Component({
  selector: 'app-payments-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, SkeletonModule],
  templateUrl: './payments-summary.component.html',
  styleUrl: './payments-summary.component.scss',
})
export class PaymentsSummaryComponent {
  private readonly stats = inject(StatsService);
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly show = computed(() => academyChargesAFee(this.academyService.academy()));

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  private readonly summary = signal<PaymentsSummary | null>(null);
  private requested = false;

  constructor() {
    // Asked once, and only once the academy is known to charge a fee.
    effect(() => {
      if (this.show() && !this.requested) {
        this.requested = true;
        this.load();
      }
    });
  }

  protected readonly view = computed<SummaryView | null>(() => {
    const s = this.summary();
    if (s === null) return null;
    const lang = this.languageService.currentLang(); // re-written on a language toggle
    const money = (cents: number): string => formatCents(cents, s.currency, lang);

    return {
      expected: money(s.expected_cents),
      collected: money(s.collected_cents),
      rate:
        s.collection_rate === null
          ? '—'
          : s.collection_rate.toLocaleString(localeFor(lang), {
              style: 'percent',
              maximumFractionDigits: 0,
            }),
      outstanding: this.translate.instant(
        s.outstanding_count === 1
          ? 'stats.payments.summary.outstandingOne'
          : 'stats.payments.summary.outstandingOther',
        { count: s.outstanding_count, amount: money(s.outstanding_cents) },
      ),
    };
  });

  private load(): void {
    const sub = this.stats.paymentsSummary().subscribe({
      next: (s) => {
        this.summary.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }
}
