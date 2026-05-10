import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

type ViewState = 'success' | 'invalid';

const KNOWN_CATEGORIES: Record<string, string> = {
  medical_cert_expiry_reminders: 'unsubscribe.categories.medical_cert_expiry_reminders',
  unpaid_athletes_digest: 'unsubscribe.categories.unpaid_athletes_digest',
};

/**
 * Public landing page reached by the one-click unsubscribe flow
 * (#417). The signed-URL backend endpoint
 * (`/api/v1/unsubscribe/{userId}/{category}`) flips the user's
 * `notification_preferences.{category}` to false and 302-redirects
 * here. Two states:
 *
 * - `?category=<known-key>` → success ("you're unsubscribed from
 *   {label}").
 * - `?status=invalid` (or no params, or unknown category) →
 *   "this link is no longer valid" with a CTA to manage preferences
 *   from the profile page (auth-gated).
 *
 * Lives outside the dashboard shell — the user clicked the link
 * from their inbox, possibly from a device they aren't signed in
 * on; no auth required.
 */
@Component({
  selector: 'app-unsubscribe',
  standalone: true,
  imports: [ButtonModule, RouterLink, TranslatePipe, BrandGlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unsubscribe.component.html',
  styleUrl: './unsubscribe.component.scss',
})
export class UnsubscribeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  protected readonly state = signal<ViewState>('invalid');
  protected readonly categoryLabelKey = signal<string | null>(null);

  /** Signed-in users go to the preferences panel; strangers to login. */
  protected readonly continueTarget = computed<'/dashboard/profile' | '/auth/login'>(() =>
    this.authService.isLoggedIn() ? '/dashboard/profile' : '/auth/login',
  );

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    const category = params.get('category');

    if (status === 'invalid') {
      this.state.set('invalid');
      return;
    }

    if (category !== null && Object.prototype.hasOwnProperty.call(KNOWN_CATEGORIES, category)) {
      this.state.set('success');
      this.categoryLabelKey.set(KNOWN_CATEGORIES[category]);
      return;
    }

    // No category and no status → treat as invalid. Mirrors the
    // server fallback for tampered / unknown-key hits.
    this.state.set('invalid');
  }
}
