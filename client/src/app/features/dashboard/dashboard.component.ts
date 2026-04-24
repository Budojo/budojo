import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { AcademyService } from '../../core/services/academy.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MenuModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly academyService = inject(AcademyService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * The sidebar brand label. The academy name is the operationally dominant
   * identity (Krug + Norman): what the user *actually* interacts with. The
   * string "Budojo" is a defensive fallback — in practice `hasAcademyGuard`
   * keeps the user off `/dashboard/*` until the academy resolves, so this
   * branch is only hit during the first render tick or on a malformed session.
   */
  protected readonly brandLabel = computed(() => this.academyService.academy()?.name ?? 'Budojo');

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
}
