import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountDeletionService } from '../../core/services/account-deletion.service';
import { AuthService } from '../../core/services/auth.service';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

type ViewState = 'loading' | 'cancelled' | 'no-longer-pending' | 'error';

/**
 * Public landing page reached by the "Cancel deletion" CTA in the
 * deletion-confirmation email (#545). Lives outside the dashboard
 * shell — the user clicked the link from their inbox, possibly on a
 * device they're NOT signed in on (phone email app, family laptop),
 * and the dashboard guards would otherwise bounce them.
 *
 * On mount, the component reads the 64-char token from the URL, POSTs
 * it to `/api/v1/me/deletion-request/cancel/{token}`, and lands on
 * one of three outcomes:
 *
 * - `cancelled: true`  → success panel ("Your account is safe").
 * - `cancelled: false` → "Deletion is no longer pending" panel — same
 *   content for already-clicked / never-valid / already-purged tokens.
 *   We deliberately don't leak which case the user is in.
 * - HTTP error          → generic error panel with a CTA to sign in.
 *
 * No automatic redirect: the user just clicked an email link, they
 * deserve a calm landing page they can read without being whisked
 * away. The CTA is "Continue to sign in" — at-rest until they tap it.
 */
@Component({
  selector: 'app-account-deletion-cancel',
  standalone: true,
  imports: [ButtonModule, ProgressSpinnerModule, RouterLink, TranslatePipe, BrandGlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-deletion-cancel.component.html',
  styleUrl: './account-deletion-cancel.component.scss',
})
export class AccountDeletionCancelComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly accountDeletion = inject(AccountDeletionService);
  private readonly authService = inject(AuthService);

  protected readonly state = signal<ViewState>('loading');

  /**
   * Where the user goes when they tap the bottom CTA. A signed-in
   * user (rare here — they likely clicked from a logged-out tab) goes
   * straight to the dashboard; a stranger gets the sign-in page.
   * Computed from a signal so a token expiring mid-render doesn't
   * change the destination.
   */
  protected readonly continueTarget = computed<'/dashboard' | '/auth/login'>(() =>
    this.authService.getToken() ? '/dashboard' : '/auth/login',
  );

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (token === null || token === '') {
      // Defense-in-depth: the route binding constrains `:token` to the
      // 64-char alphanumeric shape so a missing param shouldn't reach
      // here, but bail to the error panel if it somehow does.
      this.state.set('error');
      return;
    }

    this.accountDeletion.cancelByToken(token).subscribe({
      next: (cancelled) => {
        this.state.set(cancelled ? 'cancelled' : 'no-longer-pending');
      },
      error: () => {
        this.state.set('error');
      },
    });
  }
}
