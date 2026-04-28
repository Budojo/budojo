import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { EmailVerificationStatusComponent } from '../../shared/components/email-verification-status/email-verification-status.component';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MenuModule,
    BrandGlyphComponent,
    EmailVerificationStatusComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly academyService = inject(AcademyService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

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
   * Open/closed state for the brand dropdown. Bound to `aria-expanded` on the
   * trigger button for screen-reader parity. Toggled by PrimeNG's `onShow` /
   * `onHide` — we don't read the internal menu state, we mirror it.
   */
  protected readonly menuVisible = signal(false);

  /**
   * Mobile sidebar drawer state. On viewports below the sidebar breakpoint
   * (see dashboard.component.scss @media) the sidebar is hidden off-canvas
   * by default; tapping the hamburger in the mobile topbar flips this to
   * `true` and CSS slides the sidebar in. Desktop viewports ignore this
   * signal — the sidebar is always visible there.
   */
  protected readonly sidebarOpen = signal(false);

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  /**
   * Menu items shown when the user activates the brand. Today there is only
   * one entry (Sign out), but the structure is deliberately a list so future
   * additions (Edit academy, Account settings, Theme toggle) slot in without
   * restructuring the shell.
   */
  protected readonly menuItems = computed<MenuItem[]>(() => [
    {
      label: 'Sign out',
      icon: 'pi pi-sign-out',
      command: () => this.logout(),
    },
  ]);

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
}
