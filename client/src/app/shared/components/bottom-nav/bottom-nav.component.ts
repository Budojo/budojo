import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** A primary-navigation destination rendered as a bottom-nav tab. */
export interface BottomNavTab {
  /** `pi pi-*` glyph. */
  readonly icon: string;
  /** Visible (translated) label. */
  readonly label: string;
  /** Router destination, e.g. `'/dashboard/feed'` or `['/dashboard/u', handle]`. */
  readonly routerLink: string | readonly unknown[];
  /** Cypress hook. */
  readonly dataCy?: string;
  /** Optional unread count (e.g. the Notifications tab). Falsy → no badge. */
  readonly badge?: number | null;
}

/** The center create (➕) action — a button, not a route. */
export interface BottomNavCenterAction {
  readonly icon: string;
  readonly ariaLabel: string;
  readonly dataCy?: string;
}

/**
 * Social-native bottom tab bar (#1107 / #1108). Shared shell consumed by
 * both the owner (`dashboard`) and athlete (`athlete-dashboard`) shells with
 * role-aware tab sets. Presentational: the host supplies `tabs` + the optional
 * center ➕ and reacts to `centerActivated`.
 *
 * a11y: a `<nav [aria-label]>` landmark with `<a>` links carrying
 * `aria-current="page"` on the active route — NOT `role="tablist"` (that
 * pattern is for in-page tab panels; these navigate routes). The ➕ is a
 * `<button>`. Every target is ≥ 48 × 48 px (Fitts / MD3); the bar is
 * fixed to the bottom with `env(safe-area-inset-bottom)` for the iOS home
 * indicator. The host shows it only `< 768px` — the desktop rail replaces it.
 *
 * The ➕ splits the tabs into a left + right group (the extra tab goes left
 * on an odd count), so e.g. 4 tabs render as `2 · ➕ · 2`.
 */
@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="bottom-nav" [attr.aria-label]="ariaLabel()">
      @for (tab of leftTabs(); track tab.routerLink) {
        <ng-container [ngTemplateOutlet]="tabTpl" [ngTemplateOutletContext]="{ $implicit: tab }" />
      }
      @if (centerAction(); as c) {
        <button
          type="button"
          class="bottom-nav__create"
          [attr.aria-label]="c.ariaLabel"
          [attr.data-cy]="c.dataCy ?? null"
          (click)="centerActivated.emit()"
        >
          <i [class]="c.icon" aria-hidden="true"></i>
        </button>
      }
      @for (tab of rightTabs(); track tab.routerLink) {
        <ng-container [ngTemplateOutlet]="tabTpl" [ngTemplateOutletContext]="{ $implicit: tab }" />
      }
    </nav>

    <ng-template #tabTpl let-tab>
      <a
        class="bottom-nav__tab"
        [routerLink]="tab.routerLink"
        routerLinkActive="bottom-nav__tab--active"
        #rla="routerLinkActive"
        [attr.aria-current]="rla.isActive ? 'page' : null"
        [attr.data-cy]="tab.dataCy ?? null"
      >
        <i [class]="tab.icon" aria-hidden="true"></i>
        <span class="bottom-nav__label">{{ tab.label }}</span>
        @if (tab.badge) {
          <span class="bottom-nav__badge" aria-hidden="true">{{ tab.badge }}</span>
        }
      </a>
    </ng-template>
  `,
  styles: [
    `
      /* Fixed bottom chrome on mobile; the host hides it >= 768px in favour
         of the desktop rail. padding-bottom absorbs the iOS home indicator. */
      :host {
        position: fixed;
        inset: auto 0 0 0;
        z-index: 50;
        display: block;
        background: var(--p-content-background);
        border-top: 1px solid var(--p-content-border-color);
        padding-bottom: env(safe-area-inset-bottom, 0);
      }

      .bottom-nav {
        display: flex;
        align-items: stretch;
        justify-content: space-around;
        height: 3.5rem;
      }

      .bottom-nav__tab {
        position: relative;
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        /* 4px icon→label micro-gap — the Material bottom-nav spec for a
           stacked tab; intentionally tighter than the 8dp layout grid. */
        gap: 0.25rem;
        min-width: 48px;
        min-height: 48px;
        text-decoration: none;
        color: var(--p-text-color-secondary);
        font-size: 0.6875rem;
        transition: color var(--budojo-motion-fast) var(--budojo-motion-decelerate);
      }

      .bottom-nav__tab i {
        font-size: 1.25rem;
      }

      .bottom-nav__tab--active {
        color: var(--p-primary-color);
      }

      .bottom-nav__label {
        line-height: 1;
      }

      .bottom-nav__badge {
        position: absolute;
        top: 0.25rem;
        left: calc(50% + 0.5rem);
        min-width: 1rem;
        height: 1rem;
        padding: 0 0.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.5rem;
        background: var(--p-primary-color);
        color: var(--p-primary-contrast-color);
        font-size: 0.625rem;
        font-weight: 600;
      }

      .bottom-nav__create {
        flex: 0 0 auto;
        align-self: center;
        width: 3rem;
        height: 3rem;
        margin: 0 0.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: var(--p-primary-color);
        color: var(--p-primary-contrast-color);
        cursor: pointer;
        transition: filter var(--budojo-motion-fast) var(--budojo-motion-decelerate);
      }

      .bottom-nav__create i {
        font-size: 1.25rem;
      }

      .bottom-nav__create:hover {
        filter: brightness(1.05);
      }

      /* Branded keyboard focus ring (WCAG 2.4.7 / MD3). The active-state
         colour signals the selected route, not focus — keyboard users need a
         distinct ring on the most thumb-trafficked chrome (#1114 reviewer). */
      .bottom-nav__tab:focus-visible,
      .bottom-nav__create:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 2px;
        border-radius: 0.25rem;
      }
    `,
  ],
})
export class BottomNavComponent {
  /** Ordered primary destinations. The ➕ is injected at the middle. */
  readonly tabs = input.required<BottomNavTab[]>();
  /** The center create action; `null` → no ➕ button. */
  readonly centerAction = input<BottomNavCenterAction | null>(null);
  /** `<nav>` landmark label — the host passes a translated string. */
  readonly ariaLabel = input<string>('Primary');

  /** Fires when the center ➕ is tapped. */
  readonly centerActivated = output<void>();

  /** Tabs left of the ➕ — the extra goes left on an odd count. */
  protected readonly leftTabs = computed(() => {
    const t = this.tabs();
    return t.slice(0, Math.ceil(t.length / 2));
  });
  /** Tabs right of the ➕. */
  protected readonly rightTabs = computed(() => {
    const t = this.tabs();
    return t.slice(Math.ceil(t.length / 2));
  });
}
