import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

/**
 * Standardised error state for any list / panel / dashboard widget
 * whose data load failed (#1037).
 *
 * Audit Sprint 3 (2026-05-25) catalogued 5 different shapes for
 * "load failed" across athletes-list (silent toast), my-feed
 * (inline text + flag), stats (inline text), monthly-summary
 * (anonymous div), academy-form (`p-message severity="error"`).
 * Toast-only shape is the worst — error "scrolls away" and the
 * user is left on an empty page wondering why nothing rendered.
 *
 * This component picks the inline-banner shape (banner stays on
 * screen until the user retries or navigates away — Norman §
 * feedback) and bakes in a `(retry)` event so the caller can wire
 * the GET back up without re-inventing the affordance every time.
 *
 * Conventions baked in:
 *
 *   - **Inline at the panel root**, not a toast — error persists
 *     until acted on.
 *   - **`pi pi-exclamation-triangle`** as the canonical severity
 *     glyph (PrimeNG Material's warning tone).
 *   - **`data-cy` defaults to `{root}-error`** for Cypress hooks.
 *   - **Retry CTA is optional**: omitting it produces a quiet
 *     banner (some surfaces — like a sub-widget that retries via
 *     pull-to-refresh — don't need a dedicated retry button).
 *
 * @example
 * ```html
 * <app-error-state
 *   [title]="'athletes.error.title' | translate"
 *   [hint]="'athletes.error.hint' | translate"
 *   [retryLabel]="'common.retry' | translate"
 *   (retry)="reload()"
 *   dataCy="athletes-error"
 * />
 * ```
 */
@Component({
  selector: 'app-error-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule],
  template: `
    <div class="error-state" role="alert" [attr.data-cy]="dataCy() ?? null">
      <i class="error-state__icon pi pi-exclamation-triangle" aria-hidden="true"></i>
      <div class="error-state__copy">
        <h3 class="error-state__title">{{ title() }}</h3>
        @if (hint(); as hintText) {
          <p class="error-state__hint">{{ hintText }}</p>
        }
      </div>
      @if (retryLabel(); as label) {
        <p-button
          type="button"
          severity="secondary"
          [outlined]="true"
          size="small"
          icon="pi pi-refresh"
          [label]="label"
          (onClick)="retry.emit()"
          [attr.data-cy]="dataCy() ? dataCy() + '-retry' : null"
        />
      }
    </div>
  `,
  styles: [
    `
      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1.5rem 1rem;
        text-align: center;
        background: var(--p-surface-100);
        border: 1px solid var(--p-content-border-color);
        border-radius: 12px;
        color: var(--p-text-color);
      }

      .error-state__icon {
        font-size: 2rem;
        color: var(--p-yellow-500, #f59f00);
      }

      .error-state__copy {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: center;
      }

      .error-state__title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
      }

      .error-state__hint {
        margin: 0;
        font-size: 0.875rem;
        color: var(--p-text-muted-color);
        max-width: 32rem;
      }

      p-button {
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class ErrorStateComponent {
  /** Required headline visible to the user — already translated. */
  readonly title = input.required<string>();
  /** Optional sub-line. */
  readonly hint = input<string | null>(null);
  /** Optional retry CTA label. When omitted, no button renders. */
  readonly retryLabel = input<string | null>(null);
  /** Cypress hook. By convention `{feature}-error`. */
  readonly dataCy = input<string | null>(null);

  /** Fires when the user clicks the optional retry CTA. */
  readonly retry = output<void>();
}
