import { Injectable, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, of } from 'rxjs';
import { WebPushError, WebPushService } from './web-push.service';

/**
 * Orchestrates the post-registration soft-prompt for browser push
 * notifications (#745). The flow is **two-stage on purpose**: Budojo
 * shows its own modal first ("Stay in the loop"), and only escalates
 * to the OS-level permission prompt when the user clicks Enable. The
 * second stage is irreversible — once the browser records a `denied`
 * for the origin, no programmatic call can re-open the prompt; the
 * user has to flip the site permission in their browser settings by
 * hand. Adding a Budojo-owned soft prompt in front absorbs the "no
 * thanks" cases without burning the channel.
 *
 * The service is the single source of truth for both ends of the
 * flow: the trigger (called by `RegisterComponent` /
 * `AthleteInviteComponent` on success) and the resolution (called by
 * the dialog component when the user clicks Enable / Not now).
 *
 * Skip conditions (the soft prompt does not appear at all):
 *
 *  - User has already decided (`budojo_notif_prompt_decided_v1` in
 *    localStorage) — either via this prompt OR via the manual toggle
 *    in `/dashboard/profile`.
 *  - `Notification.permission !== 'default'` — browser already has a
 *    granted / denied state, so the prompt is a no-op or a confusing
 *    re-ask.
 *  - `WebPushService.isSupported()` returns false — browser lacks the
 *    required APIs (Safari < 16.4 outside the home-screen PWA, etc.).
 */
export type NotificationOnboardingState =
  | 'idle'
  | 'visible'
  | 'subscribing'
  | 'succeeded'
  | 'dismissed'
  | 'denied'
  | 'failed';

@Injectable({ providedIn: 'root' })
export class NotificationOnboardingService {
  private static readonly DECIDED_KEY = 'budojo_notif_prompt_decided_v1';

  private readonly webPush = inject(WebPushService);

  /**
   * State machine for the dialog. The dialog component reads this
   * signal and renders accordingly (open / loading spinner on the CTA /
   * closed). External flow points (RegisterComponent, AthleteInviteComponent)
   * only flip `idle → visible` via `requestPromptAfterAuth`; the
   * dialog's button handlers drive the rest.
   */
  readonly state = signal<NotificationOnboardingState>('idle');

  /**
   * Trigger entry point called by the auth flow on success. Returns
   * `true` if the prompt was shown, `false` if any skip condition
   * fired (caller can ignore the return — useful for tests only).
   */
  requestPromptAfterAuth(): boolean {
    if (this.hasDecided()) return false;
    if (!this.webPush.isSupported()) return false;
    if (this.webPush.currentPermission() !== 'default') return false;

    this.state.set('visible');
    return true;
  }

  /**
   * User clicked "Enable notifications". Fires the OS-level permission
   * prompt via `WebPushService.subscribe`, persists the "decided" flag
   * regardless of outcome (we never re-ask), and resolves the state to
   * succeeded / denied / failed for the dialog's banner.
   */
  async accept(): Promise<void> {
    if (this.state() !== 'visible') return;
    this.state.set('subscribing');

    try {
      const pushState = await firstValueFrom(
        this.webPush.fetchState().pipe(catchError(() => of(null))),
      );
      const vapid = pushState?.meta.vapid_public_key ?? null;
      if (vapid === null) {
        // Server-side VAPID not configured — no point asking the OS,
        // we couldn't subscribe anyway. Mark decided so we don't loop
        // back on the next session.
        this.markDecided();
        this.state.set('failed');
        return;
      }

      await this.webPush.subscribe(vapid);
      this.markDecided();
      this.state.set('succeeded');
    } catch (err) {
      this.markDecided();
      if (err instanceof WebPushError && err.reason === 'permission_denied') {
        this.state.set('denied');
        return;
      }
      this.state.set('failed');
    }
  }

  /**
   * User clicked "Not now". No OS-level prompt fires, decided flag is
   * set so the next session doesn't loop back. The user can still
   * enable manually from `/dashboard/profile → Browser notifications`.
   */
  dismiss(): void {
    if (this.state() === 'idle') return;
    this.markDecided();
    this.state.set('dismissed');
  }

  /**
   * Resets the dialog back to `idle` so it disappears from the DOM.
   * Called after the user reads the success / failure banner and
   * dismisses the dialog. Kept separate from `dismiss()` so a UI that
   * shows a result banner before closing has the right transitions.
   */
  close(): void {
    this.state.set('idle');
  }

  private hasDecided(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(NotificationOnboardingService.DECIDED_KEY) === '1';
  }

  private markDecided(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(NotificationOnboardingService.DECIDED_KEY, '1');
  }
}
