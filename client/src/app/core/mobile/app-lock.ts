/**
 * The fingerprint lock (#2159, PRD § 6.1): the page's side of `AppLockPlugin`
 * (mobile/android), which shows Android's own biometric prompt, with the
 * phone's PIN, pattern or password as the fallback inside it. Reached through
 * Capacitor's global, as the other shell plugins are, so the client keeps no
 * dependency only the phone needs. When to ask is `AppLockService`'s rule.
 */

export interface AppLockAnswer {
  unlocked: boolean;
  /** False on a phone with no screen lock: there is nothing to check against, so it opens. */
  secure: boolean;
  /** BiometricPrompt's error code, when it did not unlock. */
  code?: number;
  /** Android's own words for it, in the phone's language. */
  message?: string;
}

/**
 * The facts the rule needs, kept by the shell where the page cannot lose or
 * bend them: they outlive a reload (a sync pull reloads the page), and the
 * time is Android's `elapsedRealtime`, which setting the clock back does not move.
 */
export interface AppLockState {
  /** Unlocked since this screen of the app opened. */
  unlocked: boolean;
  /** The longest time in the background since then, in milliseconds. */
  away: number;
  /**
   * The owner closed the last prompt, with the app on the screen, and has not
   * left it since: nothing asks again by itself until they press «Sblocca».
   */
  closed: boolean;
}

export interface AppLockPlugin {
  /**
   * Shows the prompt; answers once it is closed, whichever way. Never rejects
   * on a refusal. Asked in the background, it refuses with ERROR_CANCELED (5).
   */
  unlock(options: { title: string }): Promise<AppLockAnswer>;
  state(): Promise<AppLockState>;
}

/** The plugin when the page runs inside the Android app; null anywhere else. */
export function appLockPlugin(): AppLockPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (capacitor?.Plugins?.['AppLock'] as AppLockPlugin | undefined) ?? null;
}
