import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Athlete-side landing page (#445, M7 PR-D minimal).
 *
 * Right now this is a friendly placeholder: the athlete has accepted
 * their invite, they're authenticated as `role=athlete`, but the real
 * athlete dashboard pages (own attendance / payments / documents) ship
 * in PR-E next milestone. Without this page, an athlete who logs in
 * would bounce around guard rails — `hasAcademyGuard` sends them to
 * `/setup` (owner-only), `setup` would land them in `/dashboard`, and
 * so on.
 *
 * The page lives outside the dashboard shell because the dashboard
 * sidebar is owner-shaped (Athletes / Attendance / Stats). Building
 * a parallel shell is PR-D-full's job; this minimal version stays in
 * its own layer so it's easy to delete the day PR-E lands the real
 * one.
 */
@Component({
  selector: 'app-athlete-portal-welcome',
  standalone: true,
  imports: [ButtonModule, TranslatePipe],
  templateUrl: './athlete-portal-welcome.component.html',
  styleUrl: './athlete-portal-welcome.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletePortalWelcomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly userName = computed(() => this.auth.user()?.name ?? '');

  signOut(): void {
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
