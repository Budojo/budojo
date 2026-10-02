/**
 * Google Drive from the phone (#2028): the page's side of `DriveAuthPlugin`,
 * which hands out access tokens for `drive.file` and stores nothing. Reached
 * through Capacitor's global, as `PhpServerPlugin` is, so the client keeps no
 * dependency only the phone needs.
 */

export interface DriveAuthorization {
  accessToken: string;
}

export interface DriveAuthPlugin {
  /**
   * A token. With `interactive: false` it never shows anything, and rejects
   * with `NEEDS_CONSENT` when Google wants the owner's consent first.
   */
  authorize(options: { interactive: boolean }): Promise<DriveAuthorization>;
  /** Drops a cached token Drive refused, so the next `authorize` gets a fresh one. */
  clearToken(options: { token: string }): Promise<void>;
}

/** The plugin when the page runs inside the Android app; null anywhere else. */
export function driveAuthPlugin(): DriveAuthPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (capacitor?.Plugins?.['DriveAuth'] as DriveAuthPlugin | undefined) ?? null;
}

/** Why Google gave no token: the owner closed the consent screen, or something else. */
export function isConsentCancelled(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'CANCELLED' || code === 'NO_RESULT';
}
