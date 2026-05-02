import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/privacy` page — **English-default** (#291).
 *
 * The SPA serves English by default for any visitor without a saved
 * language preference (#271 EN-first roadmap). The faithful Italian
 * translation lives at `/privacy/it` and is still the legally-citable
 * source of truth for the Garante and IT customers.
 *
 * **Three artefacts, one content domain.** Same lock-step rule the
 * SubProcessors page documents:
 *
 *   1. `docs/legal/privacy-policy.md` — the canonical, auditor-readable
 *      markdown source. Auditors, the Garante, and the lawyer review
 *      this raw.
 *   2. This component's HTML — English rendering, what an arbitrary
 *      visitor sees at /privacy.
 *   3. `it/privacy-policy-it.component.html` — Italian rendering at
 *      /privacy/it.
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 * The markdown is the citable source; the two HTML components are
 * tuned for SPA layout (typography, table breakpoints, banner) without
 * the markdown-escaping noise.
 *
 * Why a separate component per language (vs one component reading
 * `LanguageService.currentLang()`): the legal text is dense and
 * prose-heavy; reviewing it in two languages is much easier when each
 * language lives in its own template.
 */
@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy-policy.component.html',
  styleUrl: './privacy-policy.component.scss',
})
export class PrivacyPolicyComponent {
  private readonly router = inject(Router);

  protected readonly version = '0.1 (draft)';
  protected readonly lastUpdated = '2026-04-30';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
