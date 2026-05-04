import { ChangeDetectionStrategy, Component, DOCUMENT, effect, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';
import { OnlineStatusService } from '../../../core/services/online-status.service';

/**
 * Offline landing page (#425).
 *
 * Reached via `errorInterceptor` when an outgoing API request fails with
 * `HttpErrorResponse.status === 0` — i.e. the request never reached the
 * server (network drop, DNS failure, browser refused). Mirrors
 * `NotFoundComponent` in shape: brand glyph + title + supporting copy +
 * one primary CTA.
 *
 * Two recovery paths:
 *   - **Manual** — the "Try again" button reloads the document. The user
 *     keeps control if they know connectivity is back before the
 *     `online` event fires (mobile networks can take a few seconds to
 *     surface the event after a real reconnect).
 *   - **Automatic** — an `effect` watching `OnlineStatusService.isOnline`
 *     reloads the page the moment the browser reports the network is up.
 *     This matches the issue's "auto-dismiss when connectivity returns"
 *     requirement without needing a separate banner: arriving here
 *     already means the user wanted /something/, and giving them back
 *     that /something/ on reconnect is the right default.
 *
 * The `effect` skips the initial run if the user landed here while
 * `isOnline` is already true (a stale redirect, e.g. after a one-shot 5xx
 * we mistakenly bounced to /offline) — without that gate the page would
 * immediately reload, looping the user.
 */
@Component({
  selector: 'app-offline',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offline.component.html',
  styleUrl: './offline.component.scss',
})
export class OfflineComponent {
  private readonly document = inject(DOCUMENT);
  private readonly onlineStatus = inject(OnlineStatusService);
  private wasOffline = this.onlineStatus.isOffline();

  constructor() {
    effect(() => {
      const online = this.onlineStatus.isOnline();
      // Auto-recover only on a real offline → online transition. If the
      // user lands here optimistically (status === 0 emitted while the
      // browser still thinks it's online — which happens occasionally
      // on flaky mobile data), we leave the page in place so the user
      // can hit "Try again" themselves.
      if (online && this.wasOffline) {
        this.document.location.reload();
      }
      this.wasOffline = !online;
    });
  }

  retry(): void {
    this.document.location.reload();
  }
}
