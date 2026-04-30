import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/privacy` page (#219). GDPR Art. 13 informativa for users
 * registering with Budojo. Italian copy because the audience is the
 * Italian academy market.
 *
 * **Two artefacts, one content domain.** The canonical legal text
 * lives in `docs/legal/privacy-policy.md`; this component renders a
 * hand-tailored HTML translation of the same content for the SPA
 * layout. The two are NOT auto-generated from one another — they
 * are kept in lock-step by hand under the documentation discipline
 * in CLAUDE.md (a PR that changes one must change the other in the
 * same commit history). Same pattern the sub-processors page uses.
 *
 * Why two artefacts: the markdown is the legally-citable source
 * (auditors, the Garante, future lawyer revisions read it raw); the
 * HTML lets us tune typography, table breakpoints, and the version-
 * stamp banner for the SPA without HTML-escaping markdown noise.
 *
 * **Draft status.** The page ships with a visible "Bozza tecnica —
 * in revisione legale" banner. The structure and the technical facts
 * (sub-processors, retention, hosting region, base giuridica) are
 * accurate today; the formal legal prose lands separately when the
 * lawyer-reviewed text is delivered. Shipping the scaffold + the
 * accurate facts NOW is the good-faith Art. 13 disclosure required
 * before launch — better than a 404 at `/privacy` while we wait.
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
