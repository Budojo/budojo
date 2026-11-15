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
 * English (#271 EN-first roadmap).
 *
 * **Three artefacts, one content domain.** Mirror of the rule
 * documented on the English component:
 *
 *   1. `docs/legal/privacy-policy.md` — the canonical, auditor-readable
 *      markdown source.
 *   2. `../privacy-policy.component.html` — English rendering at /privacy.
 *   3. This component's HTML — Italian rendering at /privacy/it.
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 *
 * **Draft status.** Ships with a visible "Bozza tecnica — non rivista
 * da un legale" banner: no legal review is decided (decisioni-aperte
 * D3). The technical facts (who controls the data, where it lives,
 * what leaves the device) are accurate today (#1255).
 *
 * Public route (no auth), linked from the sign-up and sign-in screens.
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

  protected readonly version = '0.2 (bozza)';
  protected readonly lastUpdated = '2026-11-09';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
