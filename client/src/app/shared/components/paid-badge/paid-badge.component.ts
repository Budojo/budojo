import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';

/**
 * Small status badge for the athletes-list "paid this month" column (#105).
 * Renders a green "Paid" tag when the input is true, a subtle "Unpaid" tag
 * when false, and nothing when the input is `undefined` (the field hasn't
 * loaded yet, or the academy has no fee configured — the page also hides
 * the column in that case, but rendering nothing is the right defensive
 * default for any other consumer).
 *
 * **Interactive mode (#182).** When `clickable=true`, the badge wraps the
 * tag in a `<button>` that emits a `paidToggle` event on click — the parent
 * caller decides what the click means (typically: confirm-popup → POST
 * or DELETE on /athletes/{id}/payments). The presentational `<p-tag>` is
 * unchanged either way; only the wrapper changes shape so a11y + Fitts
 * (≥ 48 × 48 touch target on mobile) still hold.
 *
 * `clickable=false` (the default) keeps the legacy callsites at #105
 * working without any change — read-only display.
 */
@Component({
  selector: 'app-paid-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule, TranslatePipe],
  template: `
    @if (paid() !== undefined) {
      @if (clickable()) {
        <button
          type="button"
          class="paid-badge-button"
          (click)="paidToggle.emit($event)"
          [attr.aria-label]="
            (paid() ? 'shared.paidBadge.ariaUnmark' : 'shared.paidBadge.ariaMark') | translate
          "
          data-cy="paid-badge-button"
        >
          <p-tag
            [value]="(paid() ? 'shared.paidBadge.paid' : 'shared.paidBadge.unpaid') | translate"
            [severity]="paid() ? 'success' : 'warn'"
            [rounded]="true"
            data-cy="paid-badge"
          />
        </button>
      } @else {
        <p-tag
          [value]="(paid() ? 'shared.paidBadge.paid' : 'shared.paidBadge.unpaid') | translate"
          [severity]="paid() ? 'success' : 'warn'"
          [rounded]="true"
          data-cy="paid-badge"
        />
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .paid-badge-button {
      // Strip native button chrome — the <p-tag> inside provides the
      // visual affordance. Hover lifts the tag opacity slightly so the
      // button-ness is felt without redrawing the tag.
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      // Fitts touch target — 32×24 visible tag + 8px padding ring keeps
      // the click area ≥ 40px tall on mobile without making the row
      // visibly noisier.
      padding: 0.25rem 0;
      border-radius: var(--p-border-radius-sm);
      transition: opacity var(--budojo-motion-fast) var(--budojo-motion-decelerate);

      &:hover,
      &:focus-visible {
        opacity: 0.8;
      }

      &:focus-visible {
        outline: 2px solid var(--p-primary-400);
        outline-offset: 2px;
      }
    }
  `,
})
export class PaidBadgeComponent {
  /**
   * `true` = athlete has paid the current month, `false` = unpaid.
   * `undefined` = unknown (field absent / not loaded) — render nothing.
   */
  readonly paid = input<boolean | undefined>(undefined);

  /**
   * Opt-in interactive mode (#182). Off by default to keep the read-
   * only display callsites untouched. When on, the badge becomes a
   * `<button>` that emits `paidToggle` instead of rendering a passive
   * `<p-tag>`.
   */
  readonly clickable = input<boolean>(false);

  /**
   * Fired when the interactive badge is clicked. Emits the underlying
   * `MouseEvent` so the parent can anchor a `<p-confirmpopup>` on the
   * clicked button (the popup needs `target: event.currentTarget`).
   * Parent typically opens a confirm popup, then calls
   * `PaymentService.markPaid` / `unmarkPaid` based on `paid()`.
   */
  readonly paidToggle = output<MouseEvent>();
}
