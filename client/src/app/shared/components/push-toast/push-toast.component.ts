import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TranslatePipe } from '@ngx-translate/core';

interface PushToastMessage {
  readonly summary?: string;
  readonly detail?: string;
  readonly data?: { readonly link?: string; readonly kind?: string };
}

/**
 * On-brand foreground push toast (#1063).
 *
 * When a web push arrives with a Budojo tab focused, the OS suppresses
 * the system banner (browser convention) and WebPushHandlerService
 * surfaces an in-app toast instead — tagged with key="push" so it
 * renders HERE rather than in the generic app-wide <p-toast>.
 *
 * The default PrimeNG toast was the wrong shape for a notification: it
 * looked generic, wasn't clickable (so a delivered notification was a
 * dead end), and had no clear dismiss. This component fixes all three:
 *
 *   - minimal, on-brand surface (inherits the --p-toast-* tokens) with
 *     a leading bell glyph;
 *   - the whole card is clickable → deep-links to data.link (the same
 *     link the OS-notification click path uses), then dismisses;
 *   - an explicit close (x) dismisses without navigating.
 *
 * Mounted once at the app root (app.html) next to the generic toast.
 */
@Component({
  selector: 'app-push-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToastModule, TranslatePipe],
  template: `
    <p-toast [key]="key" position="top-right" styleClass="push-toast">
      <ng-template let-message #message>
        <!-- Clickable card. role/tabindex + keyboard handlers because a
             div-as-button needs explicit a11y; the close control is a
             real button nested inside, with stopPropagation. -->
        <div
          class="push-toast__card"
          [class.push-toast__card--clickable]="!!message.data?.link"
          role="button"
          tabindex="0"
          (click)="onClick(message)"
          (keydown.enter)="onClick(message)"
          (keydown.space)="onClick(message); $event.preventDefault()"
          data-cy="push-toast"
        >
          <i class="push-toast__icon pi pi-bell" aria-hidden="true"></i>
          <div class="push-toast__text">
            <span class="push-toast__title">{{ message.summary }}</span>
            @if (message.detail) {
              <span class="push-toast__detail">{{ message.detail }}</span>
            }
          </div>
          <!-- keydown.enter/space stopPropagation so a keyboard user
               dismissing the × doesn't ALSO trip the card's keydown →
               navigate (#1064 reviewer). The native button click,
               which Enter/Space still fire, drives dismiss(). -->
          <button
            type="button"
            class="push-toast__close"
            (click)="dismiss($event)"
            (keydown.enter)="$event.stopPropagation()"
            (keydown.space)="$event.stopPropagation()"
            [attr.aria-label]="'notifications.toast.dismiss' | translate"
            data-cy="push-toast-dismiss"
          >
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>
        </div>
      </ng-template>
    </p-toast>
  `,
  styles: [
    `
      .push-toast__card {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        width: 100%;
      }

      .push-toast__card--clickable {
        cursor: pointer;
      }

      .push-toast__icon {
        flex: 0 0 auto;
        font-size: 1.125rem;
        color: var(--p-primary-color);
        /* Nudge the glyph onto the title's cap-height; line-height
           alignment rather than an off-grid margin. */
        line-height: 1.4;
      }

      .push-toast__text {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1 1 auto;
        min-width: 0;
      }

      .push-toast__title {
        font-weight: 600;
        color: var(--p-text-color);
        font-size: 0.875rem;
      }

      .push-toast__detail {
        color: var(--p-text-muted-color);
        font-size: 0.75rem;
        line-height: 1.4;
      }

      /* Close affordance — small x glyph, but a full 48x48 tap target
         (Fitts / canon >= 48x48 for icon buttons). all:unset strips the
         native button box, so the size is set explicitly here. */
      .push-toast__close {
        all: unset;
        flex: 0 0 auto;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 3rem;
        height: 3rem;
        border-radius: var(--p-border-radius-sm);
        color: var(--p-text-muted-color);
        transition: background var(--budojo-motion-fast) var(--budojo-motion-decelerate);
      }

      .push-toast__close:hover {
        background: var(--p-content-hover-background);
        color: var(--p-text-color);
      }

      .push-toast__close:focus-visible {
        outline: var(--p-focus-ring-width) var(--p-focus-ring-style) var(--p-focus-ring-color);
        outline-offset: 2px;
      }
    `,
  ],
})
export class PushToastComponent {
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  /** Dedicated toast key — WebPushHandlerService tags push messages with it. */
  readonly key = 'push';

  /**
   * Tap on the card. Deep-link to where the push came from when a link
   * is present, then dismiss. With no link the tap still dismisses —
   * a notification card must respond to a tap (Norman § feedback).
   */
  onClick(message: PushToastMessage): void {
    const link = message.data?.link;
    if (typeof link === 'string' && link.length > 0) {
      void this.router.navigateByUrl(link);
    }
    this.messageService.clear(this.key);
  }

  /** Explicit close — dismiss without navigating; don't bubble to onClick. */
  dismiss(event: Event): void {
    event.stopPropagation();
    this.messageService.clear(this.key);
  }
}
