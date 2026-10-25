import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { APP_LOCK } from './shell-plugins';

/** How long the app may sit in the background before it asks again (PRD § 6.1). */
export const AWAY_LIMIT_MS = 5 * 60_000;

/** BiometricPrompt's codes for a prompt the owner closed: ERROR_USER_CANCELED, ERROR_NEGATIVE_BUTTON. */
const CLOSED_BY_OWNER = new Set([10, 13]);

/** ERROR_CANCELED: the prompt went away with the app, or was asked in the background. */
const NOT_IN_FRONT = 5;

/**
 * When the phone asks for the fingerprint (#2159, PRD § 6.1): on opening, and
 * on coming back after five minutes in the background. Outside the Android
 * app there is no plugin, and nothing is ever locked.
 *
 * The shell keeps the facts (`AppLockState`); this is the rule. It guards the
 * screen, not the files: the keys at rest are #2134's.
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

  /**
   * The owner closed the last prompt: the cover stays, with its button, and
   * nothing asks again by itself until they leave the app and come back.
   */
  private closedByOwner = false;
  private started = false;

  /**
   * Watches the app go and come back, and checks for the first time. Called
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
    void this.check();
  }

  /** Puts Android's prompt up, unless one is up already. Its button's way, too. */
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
      } else if (answer.code !== undefined && CLOSED_BY_OWNER.has(answer.code)) {
        this.closedByOwner = true;
      } else if (answer.code !== NOT_IN_FRONT) {
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
      // Leaving is what makes coming back an opening again.
      this.closedByOwner = false;
      return;
    }
    void this.check();
  }

  /**
   * Asks the shell whether the app may stay open: unlocked since its screen
   * opened, and never five minutes away since. Never in the background, where
   * no prompt can show.
   */
  private async check(): Promise<void> {
    if (this.plugin === null || this.document.visibilityState === 'hidden') {
      return;
    }
    const { unlocked, away } = await this.plugin.state();
    if (unlocked && away < AWAY_LIMIT_MS) {
      this.locked.set(false);
      return;
    }
    this.locked.set(true);
    if (!this.closedByOwner) {
      void this.unlock();
    }
  }
}
