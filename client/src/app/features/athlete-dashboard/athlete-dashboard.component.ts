import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';

/**
 * Athlete-side dashboard shell (#610, M7 PR-D slice 1). Separate from
 * the owner-side `DashboardComponent` because the two persona surfaces
 * diverge in non-trivial ways: athletes don't manage an academy, don't
 * see the global search palette, and (eventually, M9 PR-F) get a
 * differently-scoped notification feed.
 *
 * V1 sidebar carries one entry — Profile — plus a sign-out CTA. The
 * remaining 4 sub-pages (academy, attendance, payments, documents)
 * land in the follow-up M7 slices.
 */
@Component({
  selector: 'app-athlete-dashboard',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BrandGlyphComponent,
    UserAvatarComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './athlete-dashboard.component.html',
  styleUrl: './athlete-dashboard.component.scss',
})
export class AthleteDashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.authService.user;
  protected readonly sidebarOpen = signal(false);

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  ngOnInit(): void {
    // Hydrate the cached user envelope on first paint so the sidebar
    // avatar / handle / belt render with real data, not a placeholder.
    // The owner-side dashboard does the same via its `loadCurrentUser()`
    // call — same justification: a hard refresh loses the in-memory
    // signal but keeps the auth_token, so /auth/me round-trips it back.
    if (this.user() === null) {
      this.authService.loadCurrentUser().subscribe({ error: () => undefined });
    }
  }

  signOut(): void {
    this.authService.logout();
    void this.router.navigate(['/auth/login']);
  }
}
