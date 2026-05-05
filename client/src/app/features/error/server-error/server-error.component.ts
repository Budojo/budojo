import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Generic server-error / unhandled-error landing page (#425).
 *
 * Reached via `errorInterceptor` whenever an outgoing API request comes back
 * with a 5xx response. The interceptor uses `skipLocationChange: true`, so
 * the browser URL bar stays on the originally failing route while Angular
 * renders this component — which is what makes the retry button below
 * actually work. Mirrors `NotFoundComponent` in shape: brand glyph +
 * sentence-case title + supporting copy + one primary CTA.
 *
 * Two CTAs:
 *   - **Try again** reloads the document. Because the URL bar still points at
 *     the originally requested route (see `skipLocationChange` above), the
 *     reload re-fires that route — not `/error` — so the user lands back on
 *     the page they were trying to reach as soon as the API recovers (Norman
 *     § forgiveness — easier than navigating manually from a half-broken
 *     state).
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
    // The interceptor used `skipLocationChange: true` when it routed
    // here, so `document.location.href` is still the originally failing
    // URL; reloading it is exactly the retry the user expects. If the
    // backend is still down, the interceptor catches the next 5xx and
    // we end up here again — self-cancelling until the API recovers,
    // which is the intended UX.
    this.document.location.reload();
  }

  goHome(): void {
    this.router.navigateByUrl('/dashboard/athletes');
  }
}
