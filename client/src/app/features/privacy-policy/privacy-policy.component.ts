import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/privacy` page (#219). GDPR Art. 13 informativa for users
 * registering with Budojo. Italian copy because the audience is the
 * Italian academy market; the markdown source of truth is
 * `docs/legal/privacy-policy.md`.
 *
 * The page ships with a visible "bozza in revisione legale" banner.
 * The structure and the technical facts (sub-processors, retention,
 * hosting region, base giuridica) are accurate today; the formal
 * legal copy lands separately when the lawyer-reviewed text is
 * delivered. Shipping the scaffold + accurate facts NOW is the
 * good-faith Art. 13 disclosure required before launch — better
 * than a 404 at `/privacy` while we wait for the final text.
 *
 * Public route (no auth) so a prospect filling the registration
 * form can read the policy before checking the consent box.
 */
@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy-policy.component.html',
  styleUrl: './privacy-policy.component.scss',
})
export class PrivacyPolicyComponent {
  private readonly router = inject(Router);

  protected readonly version = '0.1 (bozza)';
  protected readonly lastUpdated = '2026-04-30';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
