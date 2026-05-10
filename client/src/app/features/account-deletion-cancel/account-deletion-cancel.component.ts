import { DOCUMENT } from '@angular/common';
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
  private readonly document = inject(DOCUMENT);

  protected readonly state = signal<ViewState>('loading');

  /**
   * Where the user goes when they tap the bottom CTA. A signed-in
   * user (rare here — they likely clicked from a logged-out tab) goes
   * straight to the dashboard; a stranger gets the sign-in page.
   *
   * Reads `authService.isLoggedIn` (a signal) so the computed actually
   * recomputes — earlier shape called `getToken()` which doesn't read
   * any signal, leaving the computed pinned to its first value.
   */
  protected readonly continueTarget = computed<'/dashboard' | '/auth/login'>(() =>
    this.authService.isLoggedIn() ? '/dashboard' : '/auth/login',
  );

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (token === null || token === '') {
      // No token in the URL — either the user landed on the token-less
      // variant of the route (`/account/deletion-cancel`, hit after a
      // successful consume strips the token via `history.replaceState`,
      // or after a manual refresh of the cleaned URL), or the route
      // binding somehow let an empty param through. Either way the
      // factually-correct render is "no longer pending": there's
      // nothing to cancel. Avoids the 404 trap that an earlier shape
      // had after the token strip.
      this.state.set('no-longer-pending');
      return;
    }

    this.accountDeletion.cancelByToken(token).subscribe({
      next: (cancelled) => {
        this.state.set(cancelled ? 'cancelled' : 'no-longer-pending');
        // Drop the token from the URL post-consume — it is one-shot
        // and consumed at this point (success OR no-longer-pending).
        // Keeping it in the address bar leaks via screenshots, browser
        // history, and `Referer` headers on subsequent navigations.
        // `replaceState` keeps the calm landing page visible without
        // adding a new history entry the user would have to back out
        // of.
        this.stripTokenFromUrl();
      },
      error: () => {
        this.state.set('error');
        // On error the row is unchanged — the token may still be
        // valid for a retry — so we LEAVE the URL intact. The user
        // can refresh to retry the same call.
      },
    });
  }

  private stripTokenFromUrl(): void {
    const win = this.document.defaultView;
    if (!win) return;

    // Replace the token segment with a generic landing path. Empty
    // history.state preserves the existing state object semantics
    // (Angular Router uses it for navigation context). Best-effort:
    // any error in the History API is swallowed since the in-app
    // state is already updated and the URL strip is a defense-in-
    // depth nicety.
    try {
      win.history.replaceState(win.history.state, '', '/account/deletion-cancel');
    } catch {
      // No-op — the panel content is the load-bearing UX.
    }
  }
}
