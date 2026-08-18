import { Injectable } from '@angular/core';

export type DriveArchiveView = DriveArchive;
export type DriveLinkStateView = DriveLinkState;

/**
 * Renderer side of the Google Drive backup bridge (#1301).
 *
 * Pure passthrough — the OAuth flow, the upload and the retention all live in
 * the main process, where they can be tested without a browser. What this class
 * owns is behaving sanely when the bridge is absent, which is two normal
 * states, not errors:
 *
 *   * on the web, where `window.__BUDOJO__` does not exist at all;
 *   * in a desktop build shipped without an OAuth client, where the bridge is
 *     there but answers `configured: false`.
 *
 * The Backup page distinguishes them to explain itself — "only in the desktop
 * app" versus "this build cannot connect to Google" are different sentences.
 * Nothing here throws: the page calls it while rendering.
 */
@Injectable({ providedIn: 'root' })
export class DriveSyncService {
  private get bridge(): NonNullable<Window['__BUDOJO__']>['drive'] | undefined {
    return typeof window !== 'undefined' ? window.__BUDOJO__?.drive : undefined;
  }

  /** True inside the desktop app, whether or not a Google client is configured. */
  get available(): boolean {
    return this.bridge !== undefined;
  }

  async state(): Promise<DriveLinkStateView> {
    return (await this.bridge?.state()) ?? { configured: false, linked: false };
  }

  /** Local and remote archives merged; empty rather than failing off-desktop. */
  async archives(): Promise<DriveArchiveView[]> {
    return (await this.bridge?.archives()) ?? [];
  }

  async link(): Promise<{ ok: boolean; account?: string | null; error?: string }> {
    return (await this.bridge?.link()) ?? { ok: false, error: 'not_available' };
  }

  async unlink(): Promise<void> {
    await this.bridge?.unlink();
  }

  /** Runs a sync now. The automatic one already follows every backup. */
  async syncNow(): Promise<{ ran: boolean; uploaded?: number; error?: string; reason?: string }> {
    return (await this.bridge?.sync()) ?? { ran: false, reason: 'not_available' };
  }
}
