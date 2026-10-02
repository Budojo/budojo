import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
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
  'start' | 'connecting' | 'looking' | 'choose' | 'update' | 'restoring' | 'not-found' | 'failed';
type DoorFailure = 'offline' | 'newer' | 'unauthorized' | 'unreadable' | 'other';

/** How many of the newest backups the door tries before it says none opens. */
const TRIES = 3;

/**
 * The backup this phone was last brought back from: its file name, which
 * carries when the PC took it. Kept on the phone, so that signing in again
 * after a sign-out goes straight in (PRD § 5.4) instead of offering to
 * replace what the phone recorded since.
 */
const RESTORED_KEY = 'budojoRestoredBackup';

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

  private readonly injector = inject(Injector);
  private readonly stepRegion = viewChild<ElementRef<HTMLElement>>('stepRegion');

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
  private archiveName: string | null = null;
  /** The token Drive was last asked with, dropped when Drive refuses it. */
  private lastToken: string | null = null;

  constructor() {
    // The button that had focus is gone once the step changes: focus moves to
    // the step, which a screen reader then reads (WCAG 2.4.3).
    effect(() => {
      if (this.step() === 'start') {
        return;
      }
      afterNextRender(() => this.stepRegion()?.nativeElement.focus(), { injector: this.injector });
    });
  }

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

    const backups = this.backupsWith(async () => {
      this.lastToken = (await drive.authorize({ interactive: false })).accessToken;
      return this.lastToken;
    });
    this.step.set('looking');
    try {
      this.account.set(await backups.account());
      const newest = (await backups.newestFirst()).slice(0, TRIES);
      if (
        newest.length > 0 &&
        newest[0].name === restoredFrom() &&
        (await this.enteredAsTheOwner())
      ) {
        return;
      }
      const found = await this.firstThatOpens(backups, newest);
      if (found === null || found.inspection.backup.academy === null) {
        this.step.set('not-found');
        return;
      }
      this.archive = found.archive;
      this.archiveName = found.name;
      this.found.set(found.inspection);
      if (found.inspection.here === null) {
        await this.useDrive();
      } else {
        // Brought back from Drive before: the PC has a newer backup. Else, a
        // gym of the phone's own beside the one on Drive.
        this.step.set(restoredFrom() === null ? 'choose' : 'update');
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
      rememberRestored(this.archiveName);
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

  /** The phone's own owner, when it has one; false on a phone nobody has set up. */
  private async enteredAsTheOwner(): Promise<boolean> {
    try {
      await this.enter();
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        return false;
      }
      throw error;
    }
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
  ): Promise<{ archive: File; name: string; inspection: BackupInspection } | null> {
    for (const candidate of candidates) {
      const bytes = await backups.download(candidate);
      const archive = new File([buffer(bytes)], candidate.name, { type: 'application/zip' });
      try {
        const answer = await firstValueFrom(this.device.inspect(archive));
        return { archive, name: candidate.name, inspection: answer.data };
      } catch (error) {
        if (!(error instanceof HttpErrorResponse) || refusal(error) !== 'unreadable') {
          throw error;
        }
      }
    }
    return null;
  }

  private fail(error: unknown): void {
    if (
      error instanceof RemoteError &&
      error.reason === 'unauthorized' &&
      this.lastToken !== null
    ) {
      // Google cached a token Drive refused: «Riprova» must ask for a new one.
      void this.drive?.clearToken({ token: this.lastToken }).catch(() => undefined);
      this.lastToken = null;
    }
    this.failure.set(failureOf(error));
    this.failureDetail.set(error instanceof Error ? error.message : String(error));
    this.step.set('failed');
  }
}

function restoredFrom(): string | null {
  try {
    return localStorage.getItem(RESTORED_KEY);
  } catch {
    return null;
  }
}

function rememberRestored(name: string | null): void {
  try {
    if (name !== null) {
      localStorage.setItem(RESTORED_KEY, name);
    }
  } catch {
    // A phone that cannot keep it asks again at the next sign-in: never worse.
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
