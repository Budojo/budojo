import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Wildcard 404 page (#226). Hit by any URL that no other route matches.
 *
 * The CTA navigates to `/dashboard/athletes` — the dashboard guards
 * (auth + has-academy) then take care of bouncing unauthenticated or
 * setup-pending users back where they belong, so this single CTA works
 * for every visitor state without coupling this page to AuthService.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {
  private readonly router = inject(Router);

  goHome(): void {
    this.router.navigateByUrl('/dashboard/athletes');
  }
}
