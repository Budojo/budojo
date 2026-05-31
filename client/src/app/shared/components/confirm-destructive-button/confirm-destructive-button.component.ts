import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { Tooltip } from 'primeng/tooltip';

/**
 * Wrap a destructive `p-button` with a one-step confirm popup.
 *
 * Why this exists (audit 2026-05-25, #1034): the pattern of "click
 * danger button → ConfirmationService.confirm() → execute on accept"
 * was open-coded across 6+ feature components with subtly different
 * shapes (label copy, severity prop, icon, tooltip / ariaLabel
 * presence). One shared component:
 *
 *   - removes the per-call boilerplate (no need to repeat the
 *     `target`, `acceptButtonProps`, `accept: ...` triplet every time);
 *   - enforces accessibility — `ariaLabel` is required, `pTooltip`
 *     defaults to the same string;
 *   - closes the safety-net gap on routes that previously fired the
 *     destructive action with no confirm (browser-notifications
 *     revoke, audit #1033).
 *
 * **Host contract (both pieces required, #1040 reviewer):**
 *   1. Provide `ConfirmationService` via `providers: [ConfirmationService]`
 *      on the standalone host component (PrimeNG's pattern).
 *   2. Render a single `<p-confirmpopup />` element somewhere in the
 *      host template — the service has no UI of its own; the popup
 *      surface lives on the host. Forgetting this is the common
 *      "confirm dialog opens nothing" miswire.
 *
 * The component **injects** the service — never owns the lifecycle —
 * so the same popup instance is shared with any other affordance on
 * the page that opens its own confirm.
 *
 * @example
 * ```html
 * <!-- Mandatory popup surface on the host -->
 * <p-confirmpopup />
 *
 * <app-confirm-destructive-button
 *   icon="pi pi-trash"
 *   [ariaLabel]="'athletes.delete' | translate"
 *   [confirmMessage]="'athletes.confirm.delete' | translate"
 *   [acceptLabel]="'common.delete' | translate"
 *   [rejectLabel]="'common.cancel' | translate"
 *   (confirmed)="onDelete(athlete)"
 * />
 * ```
 */
@Component({
  selector: 'app-confirm-destructive-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, Tooltip],
  template: `
    <p-button
      type="button"
      severity="danger"
      [text]="text()"
      [outlined]="outlined()"
      [size]="size()"
      [icon]="icon()"
      [label]="label() ?? undefined"
      [loading]="loading()"
      [disabled]="disabled() || loading()"
      [ariaLabel]="ariaLabel()"
      [pTooltip]="resolvedTooltip()"
      [tooltipPosition]="tooltipPosition()"
      (onClick)="open($event)"
      [attr.data-cy]="dataCy()"
    />
  `,
  styles: [
    `
      /* Mirror app-icon-button (#1045): the host carries the 48×48 minimum
         touch target (Fitts / MD3), so an icon-only destructive button is a
         compliant tap target even though the inner p-button renders 'small'.
         Keeps the icon-button + confirm-button family visually + a11y
         consistent on a list row, so an adoption pass delivers the Fitts
         upgrade end-to-end (#1033 reviewer). */
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 48px;
        min-height: 48px;
      }
    `,
  ],
})
export class ConfirmDestructiveButtonComponent {
  private readonly confirmationService = inject(ConfirmationService);

  /** The `pi pi-*` glyph. Defaults to the trash icon — the canonical "destroy" signifier. */
  readonly icon = input<string>('pi pi-trash');
  /** Optional visible label. Omit for icon-only buttons. */
  readonly label = input<string | null>(null);
  /** Required for accessibility. Falls back into `pTooltip` when no explicit tooltip is set. */
  readonly ariaLabel = input.required<string>();
  /** Explicit tooltip override. When omitted, `ariaLabel` is reused for icon-only buttons; a labelled button gets no tooltip (see `resolvedTooltip`). */
  readonly tooltip = input<string | null>(null);
  readonly tooltipPosition = input<'top' | 'right' | 'bottom' | 'left'>('left');

  /** Confirm popup message. Already-translated string. */
  readonly confirmMessage = input.required<string>();
  /** Accept-button copy on the popup. Already-translated. */
  readonly acceptLabel = input.required<string>();
  /** Reject-button copy on the popup. Already-translated. */
  readonly rejectLabel = input.required<string>();

  /**
   * Optional warning glyph for the confirm popup (e.g.
   * `pi pi-exclamation-triangle`). Null → no icon (PrimeNG default).
   * Opt-in so existing adopters render unchanged; preserves the
   * affordance that open-coded confirms carried when they migrate (#1103).
   */
  readonly confirmIcon = input<string | null>(null);

  /**
   * The tooltip actually rendered. Explicit `tooltip` wins; a labelled
   * button needs none — its visible label is the affordance, and a
   * tooltip duplicating the label is signal-vs-noise (Norman / Krug,
   * #1104 reviewer); an icon-only button falls back to `ariaLabel` so
   * the affordance is never lost.
   */
  protected readonly resolvedTooltip = computed(
    () => this.tooltip() ?? (this.label() !== null ? undefined : this.ariaLabel()),
  );

  /** Visual variant — text and outlined map to PrimeNG button modifiers. Defaults match the canonical low-stakes destructive style on list rows. */
  readonly text = input<boolean>(true);
  readonly outlined = input<boolean>(false);
  readonly size = input<'small' | 'large' | undefined>('small');

  readonly loading = input<boolean>(false);
  readonly disabled = input<boolean>(false);

  /** Cypress hook. */
  readonly dataCy = input<string | null>(null);

  /** Fires once the user clicks the accept button on the popup. */
  readonly confirmed = output<void>();

  protected open(event: Event): void {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: this.confirmMessage(),
      icon: this.confirmIcon() ?? undefined,
      acceptLabel: this.acceptLabel(),
      rejectLabel: this.rejectLabel(),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.confirmed.emit(),
    });
  }
}
