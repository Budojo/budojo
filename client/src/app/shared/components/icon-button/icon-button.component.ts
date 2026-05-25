import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

/**
 * Icon-only button wrapper that enforces a11y by construction (#1039).
 *
 * The frontend has 70+ `<p-button icon="pi pi-..." />` usages across
 * the SPA — about half of them lack `pTooltip` or `[ariaLabel]`.
 * That's a Norman § signifier violation: an icon-only button without
 * an affordance label leaves the user to guess what it does, and a
 * screen-reader user with nothing.
 *
 * This component wraps `p-button [iconOnly]` and forces:
 *
 *   - **`ariaLabel`** is `input.required` — the compiler refuses
 *     to instantiate the component without it.
 *   - **`tooltip`** is `input.required` — same. Hover-discovery is
 *     non-negotiable on icon-only affordances.
 *   - **Defaults** that match Budojo's iconography canon — severity
 *     `secondary`, `text=true`, no outline. Toolbars are quieter
 *     when the icon-button is unobtrusive by default.
 *
 * @example
 * ```html
 * <app-icon-button
 *   icon="pi pi-pencil"
 *   ariaLabel="Edit athlete"
 *   tooltip="Edit"
 *   (clicked)="editAthlete()"
 *   dataCy="athletes-edit-btn"
 * />
 * ```
 */
@Component({
  selector: 'app-icon-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, TooltipModule],
  template: `
    <p-button
      type="button"
      [icon]="icon()"
      [ariaLabel]="ariaLabel()"
      [pTooltip]="tooltip()"
      [tooltipPosition]="tooltipPosition()"
      [severity]="severity()"
      [text]="text()"
      [outlined]="outlined()"
      [size]="size()"
      [disabled]="disabled()"
      [loading]="loading()"
      (onClick)="onClick()"
      [attr.data-cy]="dataCy() ?? null"
    />
  `,
})
export class IconButtonComponent {
  /** Required pi icon class. */
  readonly icon = input.required<string>();
  /** Required ariaLabel — screen-reader text. */
  readonly ariaLabel = input.required<string>();
  /** Required tooltip — hover-discovery affordance. */
  readonly tooltip = input.required<string>();
  readonly tooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');
  readonly severity = input<'primary' | 'secondary' | 'danger' | 'warn' | 'success'>('secondary');
  readonly text = input<boolean>(true);
  readonly outlined = input<boolean>(false);
  readonly size = input<'small' | 'large' | undefined>('small');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly dataCy = input<string | null>(null);

  readonly clicked = output<void>();

  /** Public so the spec can assert disabled/loading short-circuit logic without a real DOM click. */
  onClick(): void {
    if (this.disabled() || this.loading()) return;
    this.clicked.emit();
  }
}
