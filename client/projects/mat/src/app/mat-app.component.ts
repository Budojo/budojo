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

/** What the durability check keeps: how many taps, and when the last one was saved. */
interface SavedCount {
  count: number;
  savedAt: string;
}

const COUNT_KEY = 'spike-count';

/**
 * The spike's one screen (#2027). It proves what the mat app will stand on,
 * with no feature yet:
 * - the desktop's theme, both languages and `<app-athlete-identity>` (the belt
 *   spine) render in the second application;
 * - a value saved on the phone survives a restart and an update installed over
 *   it. The owner taps +1, installs the next build and reads the number back.
 *
 * #2034 replaces this screen with pairing and the first sync.
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

  protected toggleLanguage(): void {
    this.language.setLanguage(this.language.currentLang() === 'it' ? 'en' : 'it');
  }
}
