import { Injectable } from '@angular/core';

/**
 * Renderer side of the recovery-key bridge (#1254).
 *
 * Present only inside Budojo Desktop, where `window.__BUDOJO__.keys` is exposed
 * by the preload; `available` is false on the web and the whole surface is
 * hidden there. Pure passthrough — the keychain decrypt/encrypt and the
 * relaunch-under-new-keys all live in the main process.
 */
@Injectable({ providedIn: 'root' })
export class DesktopKeysService {
  private get bridge(): NonNullable<Window['__BUDOJO__']>['keys'] | undefined {
    return typeof window !== 'undefined' ? window.__BUDOJO__?.keys : undefined;
  }

  get available(): boolean {
    return this.bridge !== undefined;
  }

  /** Reveals the recovery code (both encryption keys), or a reason on failure. */
  async reveal(): Promise<{ ok: boolean; code?: string; reason?: string }> {
    return (
      (await this.bridge?.export()) ?? {
        ok: false,
        reason: 'Recovery keys are only available in the desktop app.',
      }
    );
  }

  /** Imports a recovery code; on success the desktop app relaunches under the new keys. */
  async importCode(code: string): Promise<{ ok: boolean; reason?: string }> {
    return (
      (await this.bridge?.import(code)) ?? {
        ok: false,
        reason: 'Recovery keys are only available in the desktop app.',
      }
    );
  }
}
