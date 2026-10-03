import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { monthKey } from '../../../../shared/utils/months';
import { PayChip, yearMonthOf } from './pay-chip';

/**
 * The payment chip on a phone check-in row (#2036, PRD § 6.1).
 *
 * A month owed is a button: it opens the payment sheet. Once the athlete is
 * marked present «Da chiedere» goes above the month, because that is the
 * moment the fee is easy to ask for. Above it and not beside it: the chip
 * keeps its width, so the name beside it never reflows and no row moves
 * under the thumb. Every other state is a quiet label.
 */
@Component({
  selector: 'app-pay-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @switch (chip().kind) {
      @case ('due') {
        <button
          type="button"
          class="pay-chip pay-chip--due"
          [class.pay-chip--ask]="present()"
          [attr.aria-label]="
            (present() ? 'attendance.daily.pay.chip.askAria' : 'attendance.daily.pay.chip.dueAria')
              | translate: { name: name(), month: (monthName() | translate) }
          "
          (click)="ask.emit()"
          data-cy="pay-chip-due"
        >
          <!-- Polite: the ask is announced when it appears, after the row's own state. -->
          <span class="pay-chip__label" aria-live="polite">
            @if (present()) {
              <span class="pay-chip__ask">{{ 'attendance.daily.pay.chip.ask' | translate }}</span>
            }
            <span class="pay-chip__month">
              <i class="pi pi-wallet" aria-hidden="true"></i>
              {{ monthName() | translate }}
            </span>
          </span>
        </button>
      }
      @case ('free') {
        <span class="pay-chip pay-chip--quiet" data-cy="pay-chip-free">
          <span class="pay-chip__label">{{ 'attendance.daily.pay.chip.free' | translate }}</span>
        </span>
      }
      @case ('carnet') {
        <span class="pay-chip pay-chip--quiet" data-cy="pay-chip-carnet">
          <span class="pay-chip__label">{{
            'attendance.daily.pay.chip.carnet' | translate: { left: carnetLeft() }
          }}</span>
        </span>
      }
      @case ('covered') {
        <span class="pay-chip pay-chip--quiet" data-cy="pay-chip-covered">
          <span class="pay-chip__label">{{ 'attendance.daily.pay.chip.covered' | translate }}</span>
        </span>
      }
    }
  `,
  styleUrl: './pay-chip.component.scss',
})
export class PayChipComponent {
  readonly chip = input.required<PayChip>();
  /** Marked present: a month owed turns into «Da chiedere». */
  readonly present = input<boolean>(false);
  /** The athlete's name, for the button's accessible name. */
  readonly name = input<string>('');

  readonly ask = output<void>();

  protected readonly monthName = computed<string>(() => {
    const chip = this.chip();
    return chip.kind === 'due' ? monthKey(yearMonthOf(chip.month).month) : '';
  });

  protected readonly carnetLeft = computed<number>(() => {
    const chip = this.chip();
    return chip.kind === 'carnet' ? chip.left : 0;
  });
}
