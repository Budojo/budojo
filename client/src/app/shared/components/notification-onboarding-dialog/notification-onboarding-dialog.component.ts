import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationOnboardingService } from '../../../core/services/notification-onboarding.service';

/**
 * Soft-prompt dialog for browser push notifications (#745). Mounted
 * once at the root of the SPA (`app.ts`) so it can appear over the
 * dashboard the moment the user completes registration or accepts an
 * athlete invite — regardless of which dashboard shell (owner /
 * athlete) they land in.
 *
 * The state machine lives in `NotificationOnboardingService`; this
 * component is the dumb renderer. Two surfaces:
 *
 *   - **Pre-action body** when state is `visible` — explains what
 *     notifications cover and offers Enable / Not now.
 *   - **Result banner** when state is `succeeded` / `denied` /
 *     `failed` — single-button "Got it" close.
 *
 * The `subscribing` state pins the Enable button in loading mode so
 * the user can't double-tap; the dialog header / mask remain locked
 * (no escape, no mask-dismiss) so a stray tap doesn't drop the user
 * mid-OS-prompt with an inconsistent state.
 */
@Component({
  selector: 'app-notification-onboarding-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule, MessageModule, TranslatePipe],
  templateUrl: './notification-onboarding-dialog.component.html',
  styleUrl: './notification-onboarding-dialog.component.scss',
})
export class NotificationOnboardingDialogComponent {
  private readonly onboarding = inject(NotificationOnboardingService);

  protected readonly state = this.onboarding.state;

  /**
   * The dialog is visible whenever the state machine is in any non-
   * `idle` value. We map a single boolean to PrimeNG's `[(visible)]`
   * binding so the show / hide animation runs naturally on the
   * idle → visible / result → idle transitions.
   */
  protected readonly visible = computed(() => this.state() !== 'idle');

  protected readonly subscribing = computed(() => this.state() === 'subscribing');
  protected readonly isResult = computed(() =>
    ['succeeded', 'denied', 'failed', 'dismissed'].includes(this.state()),
  );
  protected readonly resultSeverity = computed<'success' | 'warn' | 'error'>(() => {
    switch (this.state()) {
      case 'succeeded':
        return 'success';
      case 'denied':
      case 'dismissed':
        return 'warn';
      default:
        return 'error';
    }
  });

  protected onVisibleChange(open: boolean): void {
    if (open) return;
    // Mask click / escape / X button — treat as a deferral the same
    // way "Not now" does, unless we are mid-OS-prompt or already
    // showing a result banner (those branches close via Got it).
    if (this.state() === 'visible') {
      this.onboarding.dismiss();
      return;
    }
    if (this.isResult()) {
      this.onboarding.close();
    }
  }

  protected async accept(): Promise<void> {
    await this.onboarding.accept();
  }

  protected dismiss(): void {
    this.onboarding.dismiss();
  }

  protected close(): void {
    this.onboarding.close();
  }
}
