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
        <!-- Heading level is host-driven (#1043 reviewer) — default h2; consumers override via headingLevel. -->
        @switch (headingLevel()) {
          @case (1) {
            <h1 class="error-state__title">{{ title() }}</h1>
          }
          @case (3) {
            <h3 class="error-state__title">{{ title() }}</h3>
          }
          @case (4) {
            <h4 class="error-state__title">{{ title() }}</h4>
          }
          @default {
            <h2 class="error-state__title">{{ title() }}</h2>
          }
        }
        @if (hint(); as hintText) {
          <p class="error-state__hint">{{ hintText }}</p>
        }
      </div>
      @if (retryLabel(); as label) {
        <!--
          severity="secondary" + outlined was resolving to a FILLED
          secondary button (PrimeNG Material preset collapses the
          outlined variant on secondary). Use severity="warn" +
          outlined — the variants doc lists this combo as the
          canonical "retry / dismissable warning" treatment (#1043
          reviewer).
        -->
        <p-button
          type="button"
          severity="warn"
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
        /* 8dp grid + design canon: use --p-border-radius-md, not raw 12px (#1043 reviewer). */
        border-radius: var(--p-border-radius-md);
        color: var(--p-text-color);
      }

      .error-state__icon {
        font-size: 2rem;
        /* Use the Budojo semantic warn token (defined in
           budojo-theme.scss, dark-mode-safe). --p-yellow-500 from
           PrimeNG's Material preset doesn't ship in the resolved
           token set and was rendering blank (#1043 reviewer). */
        color: var(--budojo-warning);
      }

      .error-state__copy {
        display: flex;
        flex-direction: column;
        /* 0.25rem is off the 8dp grid — keep copy gap on the 0.5rem step (#1043 reviewer). */
        gap: 0.5rem;
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
  /** Heading element level for the title (1–4). Default h2 — host overrides for top-level pages (1) or deep widgets (3 / 4) so the document outline stays sane. */
  readonly headingLevel = input<1 | 2 | 3 | 4>(2);
  /** Optional sub-line. */
  readonly hint = input<string | null>(null);
  /** Optional retry CTA label. When omitted, no button renders. */
  readonly retryLabel = input<string | null>(null);
  /** Cypress hook. By convention `{feature}-error`. */
  readonly dataCy = input<string | null>(null);

  /** Fires when the user clicks the optional retry CTA. */
  readonly retry = output<void>();
}
