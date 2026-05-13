import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService, SupportedLanguage } from '../../core/services/language.service';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { SearchPaletteComponent } from '../search/search-palette.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { VERSION } from '../../../environments/version';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BrandGlyphComponent,
    UserAvatarComponent,
    SearchPaletteComponent,
    NotificationBellComponent,
    TranslatePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly academyService = inject(AcademyService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);

  /** Bound by the sidebar language toggle (#273). Read of `currentLang`
   *  drives the active-state styling; `setLang()` writes through the
   *  service which persists to localStorage and flips ngx-translate. */
  protected readonly currentLang = this.languageService.currentLang;

  /**
   * The cached user — drives the verification pillola in the sidebar header.
   * Hydrated by `ngOnInit()` calling `loadCurrentUser()`. Re-hydration after
   * register/login is handled by `AuthService` directly (the response data
   * already populates `user`).
   */
  protected readonly user = this.authService.user;

  ngOnInit(): void {
    // Page-reload bootstrap: if a token is present (auth guard already ran)
    // but `user` is still null, fetch /auth/me so the pillola has data to
    // render. No-op if `user` is already populated by a fresh login.
    if (this.authService.getToken() && this.authService.user() === null) {
      this.authService.loadCurrentUser().subscribe({ error: () => undefined });
    }
  }

  /**
   * The sidebar brand label. The academy name is the operationally dominant
   * identity (Krug + Norman): what the user *actually* interacts with. The
   * string "Budojo" is a defensive fallback — in practice `hasAcademyGuard`
   * keeps the user off `/dashboard/*` until the academy resolves, so this
   * branch is only hit during the first render tick or on a malformed session.
   */
  protected readonly brandLabel = computed(() => this.academyService.academy()?.name ?? 'Budojo');

  /**
   * Academy logo URL when the academy has uploaded one, otherwise `null`.
   * A null result is the signal for the template to render the inline
   * Budojo glyph fallback. Why inline + null instead of falling back to a
   * static `/logo-glyph.svg`: an `<img>`-loaded SVG is sandboxed from host
   * CSS, so `stroke="currentColor"` resolves to the SVG's own root (black)
   * — invisible against the dark sidebar surface (#99).
   */
  protected readonly academyLogoUrl = computed(
    () => this.academyService.academy()?.logo_url ?? null,
  );

  /**
   * User avatar URL + name for the topbar chip (#411). Reading both off the
   * cached `user` signal so the chip re-renders the moment an avatar
   * upload / removal swaps the value in `AuthService`.
   */
  protected readonly userAvatarUrl = computed(() => this.authService.user()?.avatar_url ?? null);
  protected readonly userName = computed(() => this.authService.user()?.full_name ?? null);

  /**
   * Mobile sidebar drawer state. On viewports below the sidebar breakpoint
   * (see dashboard.component.scss @media) the sidebar is hidden off-canvas
   * by default; tapping the hamburger in the mobile topbar flips this to
   * `true` and CSS slides the sidebar in. Desktop viewports ignore this
   * signal — the sidebar is always visible there.
   */
  protected readonly sidebarOpen = signal(false);

  /**
   * App version surfaced quietly in the sidebar footer (#160). Resolved from
   * `git describe --tags --always` at build time by `scripts/write-version.cjs`
   * — see `client/src/environments/version.ts`. Renders "dev" on hot-reload
   * dev servers; the prod build replaces it with the tag the bundle was cut
   * from (e.g. `v1.1.0`, or `v1.1.0-3-gabc1234` between tags).
   */
  protected readonly versionTag = VERSION.tag;

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  // ── Swipe-to-close drawer ────────────────────────────────────────────────
  //
  // Standard Android nav-drawer dismissal gesture: drag the open drawer to
  // the left, snap to closed if dragged past ~40% of width OR released with
  // a leftward fling. Below the threshold the drawer animates back to fully
  // open. The design canon allows gesture interactions where the business
  // flow genuinely benefits (`client/CLAUDE.md` § Mobile-first → Gesture-
  // based interactions); a nav drawer dismiss is exactly that case — every
  // user who's used an Android app expects it.
  //
  // Implementation notes:
  // - Pointer events (no Hammer.js dependency); intent detection (X vs Y
  //   delta) so vertical scrolling inside the drawer isn't hijacked.
  // - During the drag, `[style.transform]` is bound inline so the drawer
  //   follows the finger 1:1. The `--dragging` class strips the CSS
  //   transition so there's no animation lag against the finger.
  // - On release the inline transform is cleared; the SCSS rule re-takes
  //   over and animates the snap-close / snap-open in 200ms decelerate.
  // - Desktop viewports early-return — the drawer is `position: static`
  //   there and we don't want inline transforms competing with the layout.
  private static readonly SIDEBAR_BREAKPOINT_PX = 768;
  private static readonly DRAG_INTENT_THRESHOLD_PX = 10;
  private static readonly DRAG_CLOSE_RATIO = 0.4;
  private static readonly FLING_VELOCITY_PX_PER_MS = 0.5;

  private dragStartX: number | null = null;
  private dragStartY: number | null = null;
  private dragStartTimeMs = 0;
  private isHorizontalDrag = false;
  private sidebarWidthPx = 0;
  private capturedPointerId: number | null = null;
  private capturedPointerElement: Element | null = null;

  protected readonly dragOffsetPx = signal(0);
  protected readonly isDragging = signal(false);

  protected onSidebarPointerDown(event: PointerEvent): void {
    if (!this.sidebarOpen()) return;
    if (!event.isPrimary) return;
    if (window.innerWidth >= DashboardComponent.SIDEBAR_BREAKPOINT_PX) return;

    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartTimeMs = event.timeStamp;
    this.isHorizontalDrag = false;
    this.sidebarWidthPx = (event.currentTarget as HTMLElement).offsetWidth;
    this.dragOffsetPx.set(0);

    // Capture the pointer immediately (Copilot review on PR #669). Without
    // capture, a user who started inside the drawer but releases on the
    // backdrop never delivers pointerup/cancel to the drawer element, and
    // the drag state stays stale (next pointerdown compounds the bug). With
    // `touch-action: pan-y` on the .sidebar, the browser still handles
    // native vertical scroll on its overflow-y, so capture doesn't disable
    // scrolling — it just guarantees we receive every pointerup/cancel.
    const target = event.currentTarget as Element;
    target.setPointerCapture(event.pointerId);
    this.capturedPointerId = event.pointerId;
    this.capturedPointerElement = target;
  }

  protected onSidebarPointerMove(event: PointerEvent): void {
    if (this.dragStartX === null || this.dragStartY === null) return;

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;
    const threshold = DashboardComponent.DRAG_INTENT_THRESHOLD_PX;

    if (!this.isHorizontalDrag && (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold)) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.isHorizontalDrag = true;
        this.isDragging.set(true);
      } else {
        // Vertical scroll wins — release the pointer so the drawer's
        // internal overflow-y handles the scroll natively, and abort the
        // gesture state.
        this.releaseCapturedPointer();
        this.dragStartX = null;
        this.dragStartY = null;
        return;
      }
    }

    if (this.isHorizontalDrag) {
      // Clamp to negative (left) only: the drawer can't move further than
      // fully open, so positive deltaX is pinned at 0.
      this.dragOffsetPx.set(Math.min(0, deltaX));
    }
  }

  protected onSidebarPointerUp(event: PointerEvent): void {
    if (this.dragStartX === null || !this.isHorizontalDrag) {
      this.resetDrag();
      return;
    }

    const deltaX = event.clientX - this.dragStartX;
    const elapsedMs = Math.max(1, event.timeStamp - this.dragStartTimeMs);
    const velocity = Math.abs(deltaX) / elapsedMs;

    const draggedFarEnough = -deltaX > this.sidebarWidthPx * DashboardComponent.DRAG_CLOSE_RATIO;
    const flungLeft = deltaX < 0 && velocity > DashboardComponent.FLING_VELOCITY_PX_PER_MS;

    if (draggedFarEnough || flungLeft) {
      this.closeSidebar();
    }
    this.resetDrag();
  }

  private releaseCapturedPointer(): void {
    if (this.capturedPointerElement !== null && this.capturedPointerId !== null) {
      try {
        this.capturedPointerElement.releasePointerCapture(this.capturedPointerId);
      } catch {
        // Pointer may already have been released by the browser on
        // pointerup — swallow the "Invalid pointer id" DOMException.
      }
    }
    this.capturedPointerId = null;
    this.capturedPointerElement = null;
  }

  private resetDrag(): void {
    this.dragStartX = null;
    this.dragStartY = null;
    this.isHorizontalDrag = false;
    this.isDragging.set(false);
    this.dragOffsetPx.set(0);
    this.releaseCapturedPointer();
  }

  private logout(): void {
    // `AuthService.logout()` already invalidates the academy cache
    // (see AcademyService.clear() — epoch-bumped invalidation from #41),
    // so the brand label's signal-backed computed resets in the same tick.
    this.authService.logout();
    void this.router.navigate(['/auth/login']);
  }

  /**
   * Template-facing wrapper around the private `logout()`. Declared
   * `protected` so the HTML binding can call it while the real auth
   * invalidation stays encapsulated on the class. Also closes the
   * mobile drawer first so the user doesn't land on `/auth/login`
   * with a drawer still slid in (Krug forgiveness — a click should
   * complete ONE interaction, not leave trailing UI state).
   */
  protected signOut(): void {
    this.closeSidebar();
    this.logout();
  }

  /** Sidebar language toggle (#273). Same call path the legal pages will
   *  use — `LanguageService` is the single source of truth for the active
   *  language across the SPA. */
  protected setLang(lang: SupportedLanguage): void {
    this.languageService.setLanguage(lang);
  }
}
