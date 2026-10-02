import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { DeviceService, AcademySummary, BackupInspection } from '../../core/mobile/device.service';
import { isConsentCancelled } from '../../core/mobile/drive-auth';
import { PcBackup, PcBackups } from '../../core/mobile/pc-backups';
import { restartPhoneServer } from '../../core/mobile/phone-server';
import { DRIVE_AUTH, PC_BACKUPS, PHP_SERVER } from '../../core/mobile/shell-plugins';
import { AuthService } from '../../core/services/auth.service';
import { Belt } from '../../core/services/athlete.service';
import { LanguageService } from '../../core/services/language.service';
import { buffer } from '../../core/sync/bytes';
import { RemoteError } from '../../core/sync/remote';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { beltColourVar, beltPaint } from '../../shared/utils/belt-palette';
import { localeFor } from '../../shared/utils/locale';

type DoorStep =
  'start' | 'connecting' | 'looking' | 'choose' | 'restoring' | 'not-found' | 'failed';
type DoorFailure = 'offline' | 'newer' | 'unauthorized' | 'unreadable' | 'other';

/** How many of the newest backups the door tries before it says none opens. */
const TRIES = 3;

/**
 * The phone's door (#2079, PRD § 5.4): **Accedi con Google**, and the gym
 * comes back by itself. It finds the newest backup the PC put on Drive,
 * names the academy it holds, and brings it in:
 * - by itself when the phone holds no academy, since there is nothing to lose;
 * - only on the owner's word when it holds one: both are named, and the
 *   owner chooses. Never merged, never replaced silently.
 *
 * Then the owner's session, with no password: the Google account is the key.
 * **Continua senza Google** goes straight in when the phone has an academy,
 * and to the setup when it has none.
 */
@Component({
  selector: 'app-door',
  imports: [BrandGlyphComponent, ButtonModule, MessageModule, TranslatePipe],
  templateUrl: './door.component.html',
  styleUrl: './door.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoorComponent {
  private readonly server = inject(PHP_SERVER);
  private readonly drive = inject(DRIVE_AUTH);
  private readonly backupsWith = inject(PC_BACKUPS);
  private readonly device = inject(DeviceService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly step = signal<DoorStep>('start');
  protected readonly account = signal<string | null>(null);
  protected readonly found = signal<BackupInspection | null>(null);
  protected readonly failure = signal<DoorFailure | null>(null);
  protected readonly failureDetail = signal('');
  /** While a session is being opened, so a second tap does not open two. */
  protected readonly entering = signal(false);

  protected readonly takenAt = computed(() => {
    const found = this.found();
    if (found === null) {
      return '';
    }
    return new Intl.DateTimeFormat(localeFor(this.language.currentLang()), {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(found.backup.taken_at));
  });

  /** The archive the door found, kept between "found" and the owner's choice. */
  private archive: File | null = null;

  async signInWithGoogle(): Promise<void> {
    const drive = this.drive;
    if (drive === null) {
      return;
    }
    this.failure.set(null);
    this.found.set(null);
    this.step.set('connecting');
    try {
      await drive.authorize({ interactive: true });
    } catch (error) {
      if (isConsentCancelled(error)) {
        this.step.set('start');
        return;
      }
      this.fail(error);
      return;
    }

    const backups = this.backupsWith(
      async () => (await drive.authorize({ interactive: false })).accessToken,
    );
    this.step.set('looking');
    try {
      this.account.set(await backups.account());
      const found = await this.firstThatOpens(
        backups,
        (await backups.newestFirst()).slice(0, TRIES),
      );
      if (found === null || found.inspection.backup.academy === null) {
        this.step.set('not-found');
        return;
      }
      this.archive = found.archive;
      this.found.set(found.inspection);
      if (found.inspection.here === null) {
        await this.useDrive();
      } else {
        this.step.set('choose');
      }
    } catch (error) {
      this.fail(error);
    }
  }

  /** Brings the backup in: staged, swapped in by a restart, then the owner's session. */
  async useDrive(): Promise<void> {
    const archive = this.archive;
    const server = this.server;
    if (archive === null || server === null) {
      return;
    }
    this.step.set('restoring');
    try {
      await firstValueFrom(this.device.restore(archive));
      await restartPhoneServer(server);
      await this.enter();
    } catch (error) {
      this.fail(error);
    }
  }

  async keepHere(): Promise<void> {
    try {
      await this.enter();
    } catch (error) {
      this.fail(error);
    }
  }

  async continueWithoutGoogle(): Promise<void> {
    try {
      await this.enter();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        await this.router.navigateByUrl('/auth/register');
        return;
      }
      this.fail(error);
    }
  }

  protected athletesKey(count: number): string {
    return count === 1 ? 'door.athletesOne' : 'door.athletesOther';
  }

  protected beltsOf(summary: AcademySummary): { colour: string; count: number }[] {
    return Object.entries(summary.belts).map(([belt, count]) => ({
      colour: beltColourVar(beltPaint(belt as Belt).main),
      count,
    }));
  }

  private async enter(): Promise<void> {
    if (this.entering()) {
      return;
    }
    this.entering.set(true);
    try {
      this.auth.adoptSession(await firstValueFrom(this.device.session()));
      await this.router.navigateByUrl('/dashboard');
    } finally {
      this.entering.set(false);
    }
  }

  /**
   * The newest backup the server will take. One it refuses as unreadable
   * (the PC's own probe file, an archive cut short) gives way to the next.
   */
  private async firstThatOpens(
    backups: PcBackups,
    candidates: PcBackup[],
  ): Promise<{ archive: File; inspection: BackupInspection } | null> {
    for (const candidate of candidates) {
      const bytes = await backups.download(candidate);
      const archive = new File([buffer(bytes)], candidate.name, { type: 'application/zip' });
      try {
        const answer = await firstValueFrom(this.device.inspect(archive));
        return { archive, inspection: answer.data };
      } catch (error) {
        if (!(error instanceof HttpErrorResponse) || refusal(error) !== 'unreadable') {
          throw error;
        }
      }
    }
    return null;
  }

  private fail(error: unknown): void {
    this.failure.set(failureOf(error));
    this.failureDetail.set(error instanceof Error ? error.message : String(error));
    this.step.set('failed');
  }
}

function refusal(error: HttpErrorResponse): string | null {
  const code = (error.error as { code?: unknown } | null)?.code;
  return error.status === 422 && typeof code === 'string' ? code : null;
}

function failureOf(error: unknown): DoorFailure {
  if (error instanceof RemoteError) {
    return error.reason === 'offline'
      ? 'offline'
      : error.reason === 'unauthorized'
        ? 'unauthorized'
        : 'other';
  }
  if (error instanceof HttpErrorResponse) {
    const code = refusal(error);
    return code === 'newer' ? 'newer' : code === 'unreadable' ? 'unreadable' : 'other';
  }
  return 'other';
}
