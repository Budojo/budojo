import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DesktopBridgeService } from '../../../core/services/desktop-bridge.service';

/** How long "you're up to date" stays before the bar goes back to the version. */
const UP_TO_DATE_MS = 4000;

/**
 * The one thing in the desktop title bar (#1401): the running version, which
 * doubles as the update check.
 *
 * The check itself is not new — the packaged app already checks at launch,
 * downloads on its own and installs on quit. What was missing is that any of
 * that is **visible**: with no update to report the app said nothing, and
 * "nothing to get" is indistinguishable from "never looked" when both are
 * silent. That ambiguity is the whole reason a button was asked for, so the
 * state this component adds that matters most is the boring one — *you're up
 * to date*.
 *
 * One element rather than a label plus an icon. The bar is 40px of chrome that
 * should read as empty; a version that is also the button costs one affordance
 * instead of two, and Fitts is not a concern for something clicked twice a
 * month.
 *
 * Renders nothing outside Electron — on the web there is no strip to sit in,
 * no version to name and no updater to ask.
 */
@Component({
  selector: 'app-desktop-titlebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './desktop-titlebar.component.html',
  styleUrl: './desktop-titlebar.component.scss',
})
export class DesktopTitlebarComponent {
  private readonly bridge = inject(DesktopBridgeService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isDesktop = signal<boolean>(this.bridge.isDesktop);
  protected readonly version = signal<string | null>(null);
  protected readonly status = signal<UpdateStatus>({ phase: 'idle' });

  /**
   * True only between a press and its answer.
   *
   * The status stream cannot carry this: the six-hourly poll publishes exactly
   * the same phases, and a bar that announced "you're up to date" on its own
   * every few hours would be chatter. The confirmation belongs to the person
   * who asked for it.
   */
  private readonly asked = signal<boolean>(false);

  /**
   * No updater at all — a development run, an unpackaged build, or version
   * `0.0.0`. Permanent for the session, so the bar stops offering.
   */
  protected readonly unavailable = signal<boolean>(false);

  protected readonly label = computed<string>(() => {
    const status = this.status();

    switch (status.phase) {
      case 'ready':
        return this.translate.instant('desktopTitlebar.updateReady', {
          version: status.version,
        });
      case 'downloading':
        return this.translate.instant('desktopTitlebar.downloading');
      case 'checking':
        // Only when the owner asked. The six-hourly poll passes through the
        // same phase and has no business taking over the bar.
        return this.asked() ? this.translate.instant('desktopTitlebar.checking') : this.atRest();
      case 'up-to-date':
        return this.asked() ? this.translate.instant('desktopTitlebar.upToDate') : this.atRest();
      default:
        return this.atRest();
    }
  });

  /** The version, or nothing at all until it arrives from the main process. */
  private atRest(): string {
    const version = this.version();

    return version === null ? '' : `v${version}`;
  }

  /** `ready` is the only state with something to do beyond checking again. */
  protected readonly isReady = computed(() => this.status().phase === 'ready');

  protected readonly busy = computed(
    () => this.status().phase === 'checking' || this.status().phase === 'downloading',
  );

  constructor() {
    if (!this.isDesktop()) {
      return;
    }

    const bridge = window.__BUDOJO__;
    void bridge?.version().then((v) => this.version.set(v));
    void bridge?.update.status().then((s) => this.status.set(s));

    const unsubscribe = bridge?.update.onStatus((s) => this.status.set(s));
    if (unsubscribe !== undefined) {
      this.destroyRef.onDestroy(unsubscribe);
    }
  }

  protected press(): void {
    if (this.isReady()) {
      void window.__BUDOJO__?.update.installNow();

      return;
    }

    if (this.busy() || this.unavailable()) {
      return;
    }

    this.asked.set(true);
    void window.__BUDOJO__?.update.check().then((result) => {
      if (!result.ok && result.reason === 'unavailable') {
        this.unavailable.set(true);
        this.asked.set(false);
      }
    });

    // Stop announcing after a while, so the bar goes back to being the version
    // rather than keeping a stale verdict on screen. Cleared on either
    // outcome: a found update speaks for itself, and a failed check has
    // already returned the status to idle.
    const timer = setTimeout(() => this.asked.set(false), UP_TO_DATE_MS);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  protected tooltip(): string {
    if (this.unavailable()) {
      return this.translate.instant('desktopTitlebar.tooltipUnavailable');
    }
    if (this.isReady()) {
      return this.translate.instant('desktopTitlebar.tooltipInstall');
    }

    return this.translate.instant('desktopTitlebar.tooltipCheck');
  }
}
