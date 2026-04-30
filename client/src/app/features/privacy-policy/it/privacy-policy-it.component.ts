import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/privacy/it` page (#291) — Italian translation of the canonical
 * English `/privacy` notice.
 *
 * Italian remains the **legally-citable source of truth** for the
 * Garante and IT customers, even though the SPA's default URL serves
 * English (#271 EN-first roadmap). When facts change — sub-processors,
 * retention windows, contact email — this Italian text MUST be updated
 * in lock-step with `/privacy` (English) in the same PR.
 *
 * **Draft status.** Ships with a visible "Bozza tecnica — in
 * revisione legale" banner. Structure and technical facts (sub-
 * processors, retention, hosting region, base giuridica) are accurate
 * today; the formal lawyer-reviewed prose lands separately. Shipping
 * the scaffold + facts NOW is the good-faith Art. 13 disclosure
 * required before launch.
 *
 * Public route (no auth) so a prospect filling the registration form
 * can read the policy before checking the consent box.
 */
@Component({
  selector: 'app-privacy-policy-it',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy-policy-it.component.html',
  styleUrl: './privacy-policy-it.component.scss',
})
export class PrivacyPolicyItComponent {
  private readonly router = inject(Router);

  protected readonly version = '0.1 (bozza)';
  protected readonly lastUpdated = '2026-04-30';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
