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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyService } from '../../../core/services/academy.service';
import { AthleteService, Athlete } from '../../../core/services/athlete.service';

const MONTH_KEYS = [
  'month.january',
  'month.february',
  'month.march',
  'month.april',
  'month.may',
  'month.june',
  'month.july',
  'month.august',
  'month.september',
  'month.october',
  'month.november',
  'month.december',
] as const;

/**
 * Date provider abstraction so vitest can freeze "today" without
 * patching the global Date constructor — the date-gate (visible only
 * on or after the 16th of the month) is half the contract here, and
 * relying on real-time `new Date()` would make the gate test
 * non-deterministic. Default implementation returns local time.
 */
export type NowProvider = () => Date;

/**
 * Dashboard widget: athletes with no payment recorded for the current
 * calendar month. Activates only after the 16th of the month — before
 * that, it's still early in the cycle and chasing reads as
 * premature-noise. Hidden entirely when:
 *
 * - The academy has no `monthly_fee_cents` configured (mirrors the
 *   gate the inline mark-paid toggle and the per-athlete Payments
 *   tab use); or
 * - Today is before the 16th of the month (issue #283 § visibility
 *   threshold).
 *
 * Data comes from `GET /api/v1/athletes?paid=no` — the existing
 * server filter (#105). Page 1 is enough for the widget headline:
 * `meta.total` carries the cross-page count, and we render the top
 * names from `data` as a quick-scan list.
 *
 * Same shape as `MonthlySummaryWidgetComponent` (eyebrow + headline
 * + name list + view-all CTA), so the dashboard reads as a coherent
 * stack of "things that need chasing this week" widgets — Hick's: two
 * comparable cards with comparable signals.
 *
 * Closes #283.
 */
@Component({
  selector: 'app-unpaid-this-month-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SkeletonModule, TranslatePipe],
  templateUrl: './unpaid-this-month-widget.component.html',
  styleUrl: './unpaid-this-month-widget.component.scss',
})
export class UnpaidThisMonthWidgetComponent implements OnInit {
  private readonly academyService = inject(AcademyService);
  private readonly athleteService = inject(AthleteService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Day of the month at or after which the widget surfaces. 16 by
   * design (issue #283) — first half of the month is "still early";
   * second half is "actually chase". Exposed so the spec can read
   * the threshold rather than hardcoding the magic number twice.
   */
  protected readonly CHASING_THRESHOLD_DAY = 16;

  /**
   * Override-able clock — defaults to `new Date()`. Tests override
   * this signal so the date-gate becomes deterministic without
   * patching the global Date.
   */
  protected readonly now = signal<NowProvider>(() => new Date());

  protected readonly count = signal<number>(0);
  protected readonly topNames = signal<readonly Athlete[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);

  protected readonly hasMonthlyFee = computed<boolean>(
    () => (this.academyService.academy()?.monthly_fee_cents ?? null) !== null,
  );

  /**
   * True on or after the 16th of the current month. **UTC-based** to
   * match the server's clock — the Laravel app timezone is UTC and
   * the `paid=no` filter uses `now()->month` / `now()->year` server-
   * side, so the "current month" the API returns is the UTC current
   * month. Using local time here would mean that around the UTC
   * day/month boundaries the widget could surface "May" while the
   * API was still returning April's unpaid set (or vice versa).
   * Copilot caught this on #283.
   */
  protected readonly pastChasingThreshold = computed<boolean>(
    () => this.now()().getUTCDate() >= this.CHASING_THRESHOLD_DAY,
  );

  /**
   * The widget renders nothing when either gate fails. The host page
   * embeds the component unconditionally; visibility lives here so a
   * future caller doesn't have to duplicate the gates.
   */
  protected readonly visible = computed<boolean>(
    () => this.hasMonthlyFee() && this.pastChasingThreshold(),
  );

  /**
   * Current month label, e.g. "May 2026" / "maggio 2026". Resolved
   * via the i18n month key + the UTC-based year so it cannot drift
   * from the UTC threshold gate (or the UTC-based server filter) at
   * day/month boundaries, and gets the user's locale automatically.
   */
  protected readonly monthLabel = computed<string>(() => {
    const today = this.now()();
    const month = this.translate.instant(MONTH_KEYS[today.getUTCMonth()]);
    const year = today.getUTCFullYear();
    return `${month} ${year}`;
  });

  ngOnInit(): void {
    if (!this.visible()) {
      // Both gates failed (or one of them) — skip the network round
      // trip entirely. The template's @if guard does the rest.
      this.loading.set(false);
      return;
    }

    this.athleteService
      .list({ paid: 'no' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.count.set(res.meta.total);
          // Top 5 names by listing order (the server sort is by
          // last_name asc by default; we don't re-order client-side).
          this.topNames.set(res.data.slice(0, 5));
          this.loading.set(false);
        },
        error: () => {
          // Non-blocking: a failed health check shouldn't wreck the page.
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
