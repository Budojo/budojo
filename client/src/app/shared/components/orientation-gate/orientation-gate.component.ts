import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Portrait gate for phones (#1171 follow-up).
 *
 * Budojo is portrait-first and its screens aren't designed for a phone in
 * landscape. The PWA manifest `orientation` field is **not** a reliable lock:
 * iOS ignores it entirely, a desktop/Android **browser tab** ignores it (it
 * only applies to an installed standalone PWA), and the Play Store **TWA**
 * sets orientation in its own native Android config — the web manifest can't
 * reach it. So we gate in CSS instead, which works across every surface.
 *
 * Mounted once at the app root. It's `display:none` by default (zero cost in
 * portrait) and only covers the screen in **landscape** with a **short**
 * viewport (`max-height: 480px`) — i.e. a phone. Tablets and foldables have a
 * taller landscape viewport, so they keep landscape for large-screen support;
 * a desktop is virtually never a sub-480px-tall window.
 *
 * The message carries `role="alert"` so a screen reader announces it the
 * moment the overlay appears. Known gap (acceptable for a phone-landscape
 * gate, not an oversight): being CSS-only, the app behind the overlay isn't
 * `inert`, so a paired Bluetooth keyboard could still tab hidden controls.
 */
@Component({
  selector: 'app-orientation-gate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="orientation-gate__inner" role="alert">
      <i class="pi pi-mobile" aria-hidden="true"></i>
      <p class="orientation-gate__message">{{ 'shared.orientationGate.message' | translate }}</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: none;
      }

      @media (orientation: landscape) and (max-height: 480px) {
        :host {
          display: flex;
          position: fixed;
          inset: 0;
          z-index: 10000;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          text-align: center;
          background: var(--p-surface-0);
        }
      }

      .orientation-gate__inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }

      .orientation-gate__inner i {
        font-size: 2rem;
        color: var(--p-primary-color);
      }

      .orientation-gate__message {
        margin: 0;
        max-width: 22rem;
        font-size: 1rem;
        line-height: 1.4;
        color: var(--p-text-color);
      }
    `,
  ],
})
export class OrientationGateComponent {}
