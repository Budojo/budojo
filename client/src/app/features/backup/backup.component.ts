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
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly archives = signal<BackupArchiveView[]>([]);
  protected readonly loading = signal(true);
  protected readonly backingUp = signal(false);
  protected readonly restoringName = signal<string | null>(null);

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

  protected sizeMb(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
  }
}
