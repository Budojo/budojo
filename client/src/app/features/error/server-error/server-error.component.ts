import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Generic server-error / unhandled-error landing page (#425).
 *
 * Reached via `errorInterceptor` whenever an outgoing API request comes back
 * with a 5xx response. Mirrors `NotFoundComponent` in shape: brand glyph +
 * sentence-case title + supporting copy + one primary CTA.
 *
 * Two CTAs:
 *   - **Try again** reloads the document so the user retries the same URL
 *     without losing context (Norman § forgiveness — easier than navigating
 *     manually from a half-broken state). The reload also re-runs the route
 *     guards, so an authenticated user lands back on the same page after
 *     the API recovers.
 *   - **Back to home** is a safety net for cases where the underlying
 *     route is the source of the error (e.g. a stats page repeatedly
 *     500ing). Routes to `/dashboard/athletes`; the dashboard guards then
 *     route anonymous visitors to `/auth/login` — same pattern as the
 *     wildcard 404.
 */
@Component({
  selector: 'app-server-error',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './server-error.component.html',
  styleUrl: './server-error.component.scss',
})
export class ServerErrorComponent {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  retry(): void {
    // Hard reload — re-runs the bootstrap, re-fires the failing call.
    // Keeps the URL the user originally tried (the redirect to /error
    // landed on /error, but the previous URL is what the user wants;
    // a `history.back()` is unsafe because the failing page may have
    // been the entry point). A reload of /error itself just lands here
    // again with no harm — the action self-cancels until the network
    // is back, which is the desired UX.
    this.document.location.reload();
  }

  goHome(): void {
    this.router.navigateByUrl('/dashboard/athletes');
  }
}
