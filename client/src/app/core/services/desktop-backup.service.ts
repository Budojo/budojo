import { Injectable } from '@angular/core';

/** What a restore answered: ok, or the code and reason it was refused (#1909). */
export type RestoreResult = BackupRestoreResult;

export interface BackupArchiveView {
  name: string;
  createdAt: string;
  sizeBytes: number;
}

/**
 * Renderer side of the desktop backup bridge (#1228).
 *
 * Present only inside Budojo Desktop, where `window.__BUDOJO__.backup` is
 * exposed by the preload; `available` is false on the web and the whole
 * surface is hidden there. Pure passthrough — the archive format, the VACUUM
 * INTO, the schema-safety check all live in the main process.
 */
@Injectable({ providedIn: 'root' })
export class DesktopBackupService {
  private get bridge(): NonNullable<Window['__BUDOJO__']>['backup'] | undefined {
    return typeof window !== 'undefined' ? window.__BUDOJO__?.backup : undefined;
  }

  get available(): boolean {
    return this.bridge !== undefined;
  }

  async list(): Promise<BackupArchiveView[]> {
    return (await this.bridge?.list()) ?? [];
  }

  /** Creates a backup now; resolves to the archive path or null on failure. */
  async backupNow(): Promise<boolean> {
    const result = await this.bridge?.run();

    return result?.ok ?? false;
  }

  /** Restores an archive by name; resolves ok, or a code and reason when refused. */
  async restore(name: string): Promise<RestoreResult> {
    return (
      (await this.bridge?.restore(name)) ?? {
        ok: false,
        reason: 'Backups are only available in the desktop app.',
      }
    );
  }

  /**
   * Restores a backup from anywhere on disk (#1909). The desktop opens the
   * file dialog itself; `canceled` means the owner closed it.
   */
  async restoreFromFile(): Promise<RestoreResult & { canceled?: boolean }> {
    return (
      (await this.bridge?.restoreFromFile()) ?? {
        ok: false,
        reason: 'Backups are only available in the desktop app.',
      }
    );
  }
}
