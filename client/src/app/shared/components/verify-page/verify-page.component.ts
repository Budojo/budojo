import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TranslatePipe } from '@ngx-translate/core';

export type VerifyPageState = 'loading' | 'success' | 'error' | 'warning' | 'neutral';

/**
 * Shared chrome for the three token-verification landing pages (#580):
 * `verify-success`, `verify-error`, `verify-email-change`. Centralises the
 * outer flex layout, the state-coloured icon (or progress spinner for the
 * loading branch), the translated title + optional message + optional
 * hint. The CTA(s) are projected via `<ng-content>` so each consumer keeps
 * its own state machine and routing logic.
 *
 * Four of the five states map to a coloured pi-icon:
 *
 * - `success` → `--success` modifier (green)  — positive terminal state
 * - `warning` → `--warning` modifier (amber)  — recoverable failure (resend / retry)
 * - `error`   → `--error` modifier (red)      — terminal failure (dead token)
 * - `neutral` → no modifier (uses the inherited text colour)
 *
 * Why warning AND error: `verify-error` (the primary email-verify link
 * failure) is recoverable — the user can request a fresh link. The
 * `error` branch of `verify-email-change` is terminal at this exact link
 * (token dead, must restart the flow). Different visual weight on
 * purpose: amber vs red. (Pre-#580 the colours were per-component;
 * #580 preserves them via this state distinction.)
 *
 * `loading` renders a `<p-progress-spinner>` instead of a pi icon and
 * ignores `iconClass`. `neutral` + `iconClass: null` omits the icon block
 * entirely (escape hatch — no current consumer uses this).
 */
@Component({
  selector: 'app-verify-page',
  standalone: true,
  imports: [ProgressSpinnerModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-page.component.html',
  styleUrl: './verify-page.component.scss',
})
export class VerifyPageComponent {
  readonly state = input.required<VerifyPageState>();
  readonly iconClass = input<string | null>(null);
  readonly titleKey = input.required<string>();
  readonly titleDataCy = input<string | null>(null);
  readonly messageKey = input<string | null>(null);
  readonly hintKey = input<string | null>(null);
  readonly hintDataCy = input<string | null>(null);

  protected readonly isLoading = computed(() => this.state() === 'loading');
}
