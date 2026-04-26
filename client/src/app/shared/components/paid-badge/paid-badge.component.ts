import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TagModule } from 'primeng/tag';

/**
 * Small status badge for the athletes-list "paid this month" column (#105).
 * Renders a green "Paid" tag when the input is true, a subtle "Unpaid" tag
 * when false, and nothing when the input is `undefined` (the field hasn't
 * loaded yet, or the academy has no fee configured — the page also hides
 * the column in that case, but rendering nothing is the right defensive
 * default for any other consumer).
 */
@Component({
  selector: 'app-paid-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule],
  template: `
    @if (paid() !== undefined) {
      <p-tag
        [value]="paid() ? 'Paid' : 'Unpaid'"
        [severity]="paid() ? 'success' : 'warn'"
        [rounded]="true"
        data-cy="paid-badge"
      />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class PaidBadgeComponent {
  /**
   * `true` = athlete has paid the current month, `false` = unpaid.
   * `undefined` = unknown (field absent / not loaded) — render nothing.
   */
  readonly paid = input<boolean | undefined>(undefined);
}
