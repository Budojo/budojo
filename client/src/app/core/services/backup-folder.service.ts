import { Injectable } from '@angular/core';

export type BackupFolderStateView = BackupFolderState;

/**
 * Renderer side of the backup-folder bridge (#1320).
 *
 * Pure passthrough — picking the folder, copying and retention all live in the
 * main process. What this owns is behaving sanely on the web, where the bridge
 * does not exist at all: nothing throws, because the Backup page calls it while
 * rendering.
 */
@Injectable({ providedIn: 'root' })
export class BackupFolderService {
  private get bridge(): NonNullable<Window['__BUDOJO__']>['folder'] | undefined {
    return typeof window !== 'undefined' ? window.__BUDOJO__?.folder : undefined;
  }

  get available(): boolean {
    return this.bridge !== undefined;
  }

  async state(): Promise<BackupFolderStateView> {
    return (
      (await this.bridge?.state()) ?? {
        folder: null,
        lastCopyAt: null,
        lastError: null,
        lastErrorAt: null,
      }
    );
  }

  /** Opens the native picker. Resolves ok:false when the owner cancels. */
  async choose(): Promise<{ ok: boolean; state?: BackupFolderStateView }> {
    return (await this.bridge?.choose()) ?? { ok: false };
  }

  async clear(): Promise<void> {
    await this.bridge?.clear();
  }

  /** Copies now. The automatic copy already follows every backup. */
  async copyNow(): Promise<{ ran: boolean; copied?: number; error?: string; reason?: string }> {
    return (await this.bridge?.copy()) ?? { ran: false, reason: 'not_available' };
  }

  async openFolder(): Promise<void> {
    await this.bridge?.open();
  }
}
