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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
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
import { AcademyKeys } from '../../core/sync/keys';
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
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

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
  /** The academy's keys the PC put with the Google account (#2033); null until it connects the phone. */
  private keys: AcademyKeys | null = null;

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
      // Best effort: without them the gym still comes back, and only its
      // medical certificates wait for the PC's «Collega il telefono».
      this.keys = await backups.academyKeys().catch(() => null);
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
      const restored = restoredFrom();
      if (found.inspection.here === null) {
        await this.useDrive();
      } else if (restored === null) {
        // A gym of the phone's own beside the one on Drive.
        this.step.set('choose');
      } else if (found.name > restored) {
        // Brought back from Drive before, and the PC has taken a newer backup
        // since: the archive's name carries when, and sorts by it.
        this.step.set('update');
      } else if (!(await this.enteredAsTheOwner())) {
        // Nothing newer opens on Drive (the newest may not): the phone's own
        // copy is the latest there is, and is never offered an older one.
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
      // One restart swaps the backup in and starts under the PC's keys.
      await this.takeTheKeys();
      await restartPhoneServer(server);
      rememberRestored(this.archiveName);
      await this.enter();
      this.sayWhenCertificatesWait();
    } catch (error) {
      this.fail(error);
    }
  }

  async keepHere(): Promise<void> {
    try {
      // The phone's copy of the gym on Drive takes its keys; a gym of the
      // phone's own never does: they would not open what it encrypted.
      if (this.step() === 'update') {
        await this.restartIfKeysChanged();
      }
      await this.enter();
      if (this.step() === 'update') {
        this.sayWhenCertificatesWait();
      }
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

  /**
   * The phone's own owner, when it has one; false on a phone nobody has set
   * up. Called only for the phone's copy of the gym on Drive, which takes the
   * academy's keys first.
   */
  private async enteredAsTheOwner(): Promise<boolean> {
    try {
      await this.restartIfKeysChanged();
      await this.enter();
      this.sayWhenCertificatesWait();
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /** Whether the phone took keys it did not have. */
  private async takeTheKeys(): Promise<boolean> {
    const keys = this.keys;
    if (keys === null || this.server === null) {
      return false;
    }
    const { changed } = await this.server.adoptKeys({
      APP_KEY: keys.APP_KEY,
      DOCUMENT_ENCRYPTION_KEY: keys.DOCUMENT_ENCRYPTION_KEY,
    });
    return changed;
  }

  private async restartIfKeysChanged(): Promise<void> {
    if ((await this.takeTheKeys()) && this.server !== null) {
      await restartPhoneServer(this.server);
    }
  }

  /** Until the PC connects the phone, the certificates do not open here: said once, with where to do it. */
  private sayWhenCertificatesWait(): void {
    if (this.keys !== null) {
      return;
    }
    this.messages.add({
      severity: 'info',
      summary: this.translate.instant('door.keysWait.title'),
      detail: this.translate.instant('door.keysWait.detail'),
      life: 12000,
    });
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
    this.failureDetail.set(detailOf(error));
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

/**
 * What went wrong, as the server or the network put it. On a phone the screen
 * is the only log anyone can send: «newer» names the migration the backup has
 * and this Budojo lacks (#2079, the owner's first try).
 */
function detailOf(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    // A refusal's own words; anything else keeps the address and the status,
    // since the phone's server hides its errors' text (`APP_DEBUG=false`).
    const message = (error.error as { message?: unknown } | null)?.message;
    return error.status === 422 && typeof message === 'string' ? message : error.message;
  }
  return error instanceof Error ? error.message : String(error);
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
