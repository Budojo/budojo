import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { APP_LOCK } from './shell-plugins';

/** How long the app may sit in the background before it asks again (PRD § 6.1). */
export const AWAY_LIMIT_MS = 5 * 60_000;

/**
 * BiometricPrompt's codes for a prompt closed by the owner, or by the app
 * going away: ERROR_CANCELED, ERROR_USER_CANCELED, ERROR_NEGATIVE_BUTTON.
 * Nothing to explain after those.
 */
const CLOSED = new Set([5, 10, 13]);

/**
 * When the phone asks for the fingerprint (#2159, PRD § 6.1): on opening, and
 * on coming back after five minutes in the background. Outside the Android
 * app there is no plugin, and nothing is ever locked.
 *
 * It guards the screen, not the files: the keys at rest are #2134's.
 */
@Injectable({ providedIn: 'root' })
export class AppLockService {
  private readonly plugin = inject(APP_LOCK);
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** Locked from the first frame inside the app, so the gym never shows before the prompt. */
  readonly locked = signal(this.plugin !== null);
  readonly asking = signal(false);
  /** Why the phone did not unlock, in Android's words; null after the prompt was just closed. */
  readonly problem = signal<string | null>(null);

  private hiddenAt: number | null = null;
  private started = false;

  /**
   * Watches the app go and come back, and asks for the first time. Called
   * once the app has rendered, so the prompt's title is in the owner's language.
   */
  start(): void {
    if (this.plugin === null || this.started) {
      return;
    }
    this.started = true;
    const onVisibility = (): void => this.onVisibility();
    this.document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisibility),
    );
    void this.unlock();
  }

  /** Puts Android's prompt up, unless one is up already. */
  async unlock(): Promise<void> {
    if (this.plugin === null || this.asking()) {
      return;
    }
    this.asking.set(true);
    this.problem.set(null);
    try {
      const answer = await this.plugin.unlock({ title: this.translate.instant('lock.prompt') });
      if (answer.unlocked) {
        this.locked.set(false);
      } else if (answer.code === undefined || !CLOSED.has(answer.code)) {
        this.problem.set(answer.message ?? null);
      }
    } catch (error) {
      this.problem.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.asking.set(false);
    }
  }

  private onVisibility(): void {
    if (this.document.visibilityState === 'hidden') {
      // Time away counts from an open app. A prompt that is up takes the page
      // away by itself (before Android 11 the PIN is its own screen), and may
      // bring it back only after it answered: that is not the owner leaving.
      if (!this.locked()) {
        this.hiddenAt = Date.now();
      }
      return;
    }
    const away = this.hiddenAt === null ? 0 : Date.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (away >= AWAY_LIMIT_MS) {
      this.locked.set(true);
    }
    // Locked and back: a prompt the app took away with it, or the five minutes.
    if (this.locked()) {
      void this.unlock();
    }
  }
}
