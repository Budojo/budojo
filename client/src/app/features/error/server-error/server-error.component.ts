import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Generic server-error landing page (#425).
 *
 * Reachable by **direct navigation only** — typed URL, bookmark, future
 * deep-link from an empty state. The global `errorInterceptor` does NOT
 * auto-redirect here on 5xx; component-level handlers (toasts, empty
 * states) own the per-endpoint failure UX. This page is the fallback
 * destination when a feature explicitly chooses to escalate to a
 * full-page error rather than render in-place.
 *
 * Mirrors `NotFoundComponent` in shape: brand glyph + sentence-case
 * title + supporting copy + two CTAs.
 *
 * Two CTAs:
 *   - **Try again** reloads the document. Useful when the user reached
 *     `/error` by direct nav after a hard failure and just wants to re-
 *     fetch this page; without an "original URL to go back to" in scope
 *     here, reload is the safest retry the page can offer.
 *   - **Back to home** routes to `/dashboard/athletes`; the dashboard
 *     guards then route anonymous visitors to `/auth/login` — same
 *     pattern as the wildcard 404.
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
    // Hard reload of the current document. The page is direct-nav only
    // (the global interceptor does not redirect 5xx here), so the URL
    // is /error itself; reload re-renders this same page. The button
    // exists for parity with NotFoundComponent + as a manual escape
    // hatch when the user genuinely wants to re-bootstrap the SPA.
    this.document.location.reload();
  }

  goHome(): void {
    this.router.navigateByUrl('/dashboard/athletes');
  }
}
