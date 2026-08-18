import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * A slim bar at the top of the app while an update is downloading, and until it
 * is installed (#1339).
 *
 * The updater downloads 113 MB in the background with `autoDownload = true`,
 * and until now the only signal was a native OS notification **after** it
 * finished — transient, outside the app, and shown exactly once. Anyone whose
 * window was not focused at that moment never learned an update was waiting.
 *
 * Three properties shape this component:
 *
 *   1. **It is absent, not empty, when there is nothing to say.** The bar costs
 *      no vertical space in the normal case, which is what makes it acceptable
 *      to put at the top of every screen at all.
 *   2. **It is never a call to action.** Nothing here asks the owner to stop
 *      what they are doing; the update installs on quit whether they read this
 *      or not. It is a status line, so it is styled like one — no button, no
 *      dismiss, no colour that reads as an error.
 *   3. **It tolerates not being in Electron.** `window.__BUDOJO__` is undefined
 *      in a browser and in every spec that does not stub it, and the bar simply
 *      never appears.
 *
 * `role="status"` rather than `alert`: a screen reader should mention it at the
 * next pause, not interrupt.
 */
@Component({
  selector: 'app-update-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    @if (status(); as current) {
      @switch (current.phase) {
        @case ('downloading') {
          <div class="update-banner" role="status" data-cy="update-banner">
            <i class="pi pi-download update-banner__icon" aria-hidden="true"></i>
            <span class="update-banner__text" data-cy="update-banner-downloading">
              {{ 'update.downloading' | translate: { version: current.version } }}
            </span>
            <span class="update-banner__percent" data-cy="update-banner-percent">
              {{ 'update.percent' | translate: { percent: current.percent } }}
            </span>
            <span
              class="update-banner__track"
              role="progressbar"
              [attr.aria-valuenow]="current.percent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span class="update-banner__fill" [style.width.%]="current.percent"></span>
            </span>
          </div>
        }
        @case ('ready') {
          <div class="update-banner update-banner--ready" role="status" data-cy="update-banner">
            <i class="pi pi-check-circle update-banner__icon" aria-hidden="true"></i>
            <span class="update-banner__text" data-cy="update-banner-ready">
              {{ 'update.ready' | translate: { version: current.version } }}
            </span>
            <button
              type="button"
              class="update-banner__action"
              [disabled]="installing()"
              (click)="installNow()"
              data-cy="update-banner-install"
            >
              {{ 'update.installNow' | translate }}
            </button>
          </div>
        }
      }
    }
  `,
  styleUrl: './update-banner.component.scss',
})
export class UpdateBannerComponent {
  private readonly destroyRef = inject(DestroyRef);

  /** Null until the bridge answers, and whenever there is nothing to show. */
  protected readonly status = signal<UpdateStatus | null>(null);

  /**
   * Latched from the click, not from a response.
   *
   * A successful `installNow` never resolves in a way this component will see
   * — the app is quitting. So the button disables on the way in, and only a
   * refusal turns it back on.
   */
  protected readonly installing = signal(false);

  constructor() {
    const bridge = window.__BUDOJO__;

    if (bridge === undefined) {
      return;
    }

    // Pull once for the first paint: a window opened after a download finished
    // would otherwise show nothing until the next six-hourly check.
    void bridge.update
      .status()
      .then((current) => this.apply(current))
      .catch(() => undefined);

    // Then push, so a download starting while the window is open is visible
    // without polling for it.
    const unsubscribe = bridge.update.onStatus((current) => this.apply(current));
    this.destroyRef.onDestroy(unsubscribe);
  }

  /**
   * Runs the installer now, visibly, instead of waiting for the next quit.
   *
   * The silent-install-on-quit path is untouched; this is the second one, for
   * someone who would rather watch it happen than close the app and wonder.
   */
  protected installNow(): void {
    const bridge = window.__BUDOJO__;

    if (bridge === undefined || this.installing()) {
      return;
    }

    this.installing.set(true);
    void bridge.update
      .installNow()
      .then((result) => {
        // Only a refusal comes back — on success the process is already going
        // away. Re-enabling here is what stops a stale bar leaving a dead
        // button behind.
        if (!result.ok) {
          this.installing.set(false);
        }
      })
      .catch(() => this.installing.set(false));
  }

  /** `idle` is stored as null so the template's `@if` removes the bar entirely. */
  private apply(current: UpdateStatus): void {
    this.status.set(current.phase === 'idle' ? null : current);
  }
}
