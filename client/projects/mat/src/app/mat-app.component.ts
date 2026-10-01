import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { AthleteIdentityComponent } from '../../../../src/app/shared/components/athlete-identity/athlete-identity.component';
import { AthleteIdentity } from '../../../../src/app/core/services/athlete.service';
import { LanguageService } from '../../../../src/app/core/services/language.service';
import { ThemeService } from '../../../../src/app/core/services/theme.service';
import { MAT_BUILD } from '../build-info';
import { KEY_VALUE_STORE } from './key-value-store';
import { BenchmarkResult, phpServerPlugin, PhpServerStart, runBenchmark } from './php-spike';
import { DriveHttpError, DriveProbe, driveAuthPlugin, runDriveProbe } from './drive-spike';

/** What the durability check keeps: how many taps, and when the last one was saved. */
interface SavedCount {
  count: number;
  savedAt: string;
}

const COUNT_KEY = 'spike-count';
/** Set once the phone has written its Drive file, so a file that later goes is noticed (#2028). */
const DRIVE_WRITTEN_KEY = 'spike-drive-written';

/**
 * The spike's one screen (#2027). It proves what the mat app will stand on,
 * with no feature yet:
 * - the desktop's theme, both languages and `<app-athlete-identity>` (the belt
 *   spine) render in the second application;
 * - a value saved on the phone survives a restart and an update installed over
 *   it. The owner taps +1, installs the next build and reads the number back.
 *
 * #2044 added Budojo's server, and #2028 Google Drive. #2034 replaces this
 * screen with the real application.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ButtonModule, AthleteIdentityComponent],
  templateUrl: './mat-app.component.html',
  styleUrl: './mat-app.component.scss',
})
export class MatAppComponent implements OnInit {
  private readonly store = inject(KEY_VALUE_STORE);
  private readonly language = inject(LanguageService);
  private readonly theme = inject(ThemeService);

  protected readonly build = MAT_BUILD;
  protected readonly count = signal(0);
  protected readonly savedAt = signal<string | null>(null);
  protected readonly loaded = signal(false);

  /** #2044: Budojo's server on the phone, started and measured from here. */
  protected readonly serverAvailable = phpServerPlugin() !== null;
  protected readonly serverState = signal<'idle' | 'running' | 'done' | 'error'>('idle');
  protected readonly serverStart = signal<PhpServerStart | null>(null);
  protected readonly benchmark = signal<BenchmarkResult | null>(null);
  protected readonly serverError = signal<string | null>(null);

  /**
   * #2028: Google Drive from the phone. The silent connection at launch is the
   * reboot test: after a restart it must succeed without showing anything.
   */
  protected readonly driveAvailable = driveAuthPlugin() !== null;
  protected readonly playServices = signal<string | null>(null);
  protected readonly driveLink = signal<'checking' | 'connected' | 'needs-consent' | 'error'>(
    'checking',
  );
  protected readonly driveLinkMs = signal<number | null>(null);
  protected readonly driveLinkConsented = signal(false);
  /** A call to Google is in flight: a second tap would only get `BUSY` back. */
  protected readonly driveLinking = signal(false);
  protected readonly driveState = signal<'idle' | 'running' | 'done' | 'error'>('idle');
  protected readonly driveProbe = signal<DriveProbe | null>(null);
  protected readonly driveError = signal<string | null>(null);
  private driveToken: string | null = null;

  /** A sample row, plainly marked as one on screen. No age chip: the snapshot will carry no date of birth. */
  protected readonly sample: AthleteIdentity = {
    id: 0,
    first_name: 'Luca',
    last_name: 'Bianchi',
    belt: 'blue',
    stripes: 2,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
  };

  protected readonly savedAtLabel = computed(() => {
    const savedAt = this.savedAt();
    return savedAt === null
      ? null
      : new Date(savedAt).toLocaleString(this.language.currentLang(), {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
  });

  protected readonly otherLanguage = computed(() =>
    this.language.currentLang() === 'it' ? 'English' : 'Italiano',
  );

  async ngOnInit(): Promise<void> {
    this.language.bootstrap();
    this.theme.bootstrap();
    const saved = await this.store.get<SavedCount>(COUNT_KEY);
    if (saved !== undefined) {
      this.count.set(saved.count);
      this.savedAt.set(saved.savedAt);
    }
    this.loaded.set(true);
    await this.linkDrive(false);
  }

  protected async increment(): Promise<void> {
    const next: SavedCount = { count: this.count() + 1, savedAt: new Date().toISOString() };
    await this.store.set(COUNT_KEY, next);
    this.count.set(next.count);
    this.savedAt.set(next.savedAt);
  }

  protected async runServerSpike(): Promise<void> {
    const plugin = phpServerPlugin();
    if (plugin === null || this.serverState() === 'running') {
      return;
    }
    this.serverState.set('running');
    this.serverError.set(null);
    this.benchmark.set(null);
    try {
      const start = await plugin.start();
      this.serverStart.set(start);
      this.benchmark.set(await runBenchmark(start));
      this.serverState.set('done');
    } catch (error) {
      this.serverError.set(error instanceof Error ? error.message : String(error));
      this.serverState.set('error');
    }
  }

  /** Asks Google for a token: silently at launch, with the consent screen when the owner taps. */
  protected async linkDrive(interactive: boolean): Promise<void> {
    const plugin = driveAuthPlugin();
    if (plugin === null || this.driveLinking()) {
      return;
    }
    this.driveLinking.set(true);
    this.driveError.set(null);
    try {
      if (this.playServices() === null) {
        this.playServices.set((await plugin.status()).playServices);
      }
      const granted = await plugin.authorize({ interactive });
      this.driveToken = granted.accessToken;
      this.driveLinkMs.set(granted.ms);
      this.driveLinkConsented.set(granted.consented);
      this.driveLink.set('connected');
    } catch (error) {
      if ((error as { code?: string }).code === 'NEEDS_CONSENT') {
        this.driveLink.set('needs-consent');
        return;
      }
      this.driveError.set(error instanceof Error ? error.message : String(error));
      this.driveLink.set('error');
    } finally {
      this.driveLinking.set(false);
    }
  }

  protected async runDriveSpike(): Promise<void> {
    const plugin = driveAuthPlugin();
    if (plugin === null || this.driveToken === null || this.driveState() === 'running') {
      return;
    }
    this.driveState.set('running');
    this.driveError.set(null);
    this.driveProbe.set(null);
    try {
      const previouslyWritten = (await this.store.get<boolean>(DRIVE_WRITTEN_KEY)) === true;
      let probe: DriveProbe;
      try {
        probe = await runDriveProbe(this.driveToken, { previouslyWritten });
      } catch (error) {
        // A token Google cached past its life: drop it and take a fresh one, once.
        if (!(error instanceof DriveHttpError) || error.status !== 401) {
          throw error;
        }
        await plugin.clearToken({ token: this.driveToken });
        this.driveToken = (await plugin.authorize({ interactive: false })).accessToken;
        probe = await runDriveProbe(this.driveToken, { previouslyWritten });
      }
      if (probe.phoneFile !== null) {
        await this.store.set(DRIVE_WRITTEN_KEY, true);
      }
      this.driveProbe.set(probe);
      this.driveState.set('done');
    } catch (error) {
      if ((error as { code?: string }).code === 'NEEDS_CONSENT') {
        // The grant itself has gone (Testing expires it after 7 days): back to the connect button.
        this.driveToken = null;
        this.driveLink.set('needs-consent');
      }
      this.driveError.set(error instanceof Error ? error.message : String(error));
      this.driveState.set('error');
    }
  }

  protected toggleLanguage(): void {
    this.language.setLanguage(this.language.currentLang() === 'it' ? 'en' : 'it');
  }
}
