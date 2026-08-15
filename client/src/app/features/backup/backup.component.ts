import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDestructiveButtonComponent } from '../../shared/components/confirm-destructive-button/confirm-destructive-button.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  DesktopBackupService,
  type BackupArchiveView,
} from '../../core/services/desktop-backup.service';
import { DesktopKeysService } from '../../core/services/desktop-keys.service';

/**
 * Data & backup page (#1228). Desktop-only — the route guard redirects on the
 * web, where there is no local database to back up. Shows the last backup, a
 * "Back up now" action, and the archive list with a confirm-gated restore.
 *
 * A backup system nobody can see is a backup system nobody trusts, so the last
 * successful backup is the first thing on the page.
 */
@Component({
  selector: 'app-backup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TranslatePipe,
    ButtonModule,
    ToastModule,
    ConfirmDestructiveButtonComponent,
    PageHeaderComponent,
  ],
  templateUrl: './backup.component.html',
  styleUrl: './backup.component.scss',
})
export class BackupComponent {
  private readonly backup = inject(DesktopBackupService);
  private readonly keys = inject(DesktopKeysService);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly archives = signal<BackupArchiveView[]>([]);
  protected readonly loading = signal(true);
  protected readonly backingUp = signal(false);
  protected readonly restoringName = signal<string | null>(null);

  /** Recovery keys (#1254): reveal the code, and paste one to import. */
  protected readonly keysAvailable = this.keys.available;
  protected readonly recoveryCode = signal<string | null>(null);
  protected readonly revealing = signal(false);
  protected readonly importValue = signal('');
  protected readonly importing = signal(false);

  protected readonly lastBackupAt = computed<string | null>(
    () => this.archives()[0]?.createdAt ?? null,
  );

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.archives.set(await this.backup.list());
    this.loading.set(false);
  }

  protected async backupNow(): Promise<void> {
    this.backingUp.set(true);
    const ok = await this.backup.backupNow();
    this.backingUp.set(false);

    this.messages.add({
      severity: ok ? 'success' : 'error',
      summary: this.translate.instant(ok ? 'backup.toast.created' : 'backup.toast.failed'),
    });

    if (ok) {
      await this.refresh();
    }
  }

  protected async restore(archive: BackupArchiveView): Promise<void> {
    this.restoringName.set(archive.name);
    const result = await this.backup.restore(archive.name);
    this.restoringName.set(null);

    if (result.ok) {
      // The main process reloads the window onto the restored data; this toast
      // may not survive that, which is fine — the reload is the confirmation.
      this.messages.add({
        severity: 'success',
        summary: this.translate.instant('backup.toast.restored'),
      });
    } else {
      this.messages.add({
        severity: 'error',
        summary: this.translate.instant('backup.toast.restoreRefused'),
        detail: result.reason,
        life: 8000,
      });
    }
  }

  protected async reveal(): Promise<void> {
    this.revealing.set(true);
    const result = await this.keys.reveal();
    this.revealing.set(false);

    if (result.ok && result.code) {
      this.recoveryCode.set(result.code);
    } else {
      this.messages.add({
        severity: 'error',
        summary: this.translate.instant('backup.keys.revealFailed'),
        detail: result.reason,
        life: 8000,
      });
    }
  }

  protected hideCode(): void {
    this.recoveryCode.set(null);
  }

  protected async copyCode(): Promise<void> {
    const code = this.recoveryCode();
    if (code === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      this.messages.add({
        severity: 'success',
        summary: this.translate.instant('backup.keys.copied'),
      });
    } catch {
      // Clipboard can be blocked; the code is on screen to copy by hand.
      this.messages.add({
        severity: 'info',
        summary: this.translate.instant('backup.keys.copyManual'),
      });
    }
  }

  protected setImportValue(value: string): void {
    this.importValue.set(value);
  }

  protected async importKeys(): Promise<void> {
    const code = this.importValue().trim();
    if (code.length === 0) {
      return;
    }

    this.importing.set(true);
    const result = await this.keys.importCode(code);

    if (result.ok) {
      // On success the main process relaunches the app under the new keys, so
      // keep the control disabled — the restart is the confirmation.
      this.messages.add({
        severity: 'success',
        summary: this.translate.instant('backup.keys.importOk'),
        detail: this.translate.instant('backup.keys.importRelaunch'),
      });
    } else {
      this.importing.set(false);
      this.messages.add({
        severity: 'error',
        summary: this.translate.instant('backup.keys.importFailed'),
        detail: result.reason,
        life: 8000,
      });
    }
  }

  protected sizeMb(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
  }
}
