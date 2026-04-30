import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/privacy` page — **English-default** (#291).
 *
 * The SPA serves English by default for any visitor without a saved
 * language preference (#271 EN-first roadmap). The faithful Italian
 * translation lives at `/privacy/it` and is still the legally-citable
 * source of truth for the Garante and IT customers — facts in this
 * English text and the Italian text MUST match. Editing one without
 * the other is a lock-step violation.
 *
 * Why a separate component per language (vs one component reading
 * `LanguageService.currentLang()`): the legal text is dense and
 * prose-heavy; reviewing it in two languages is much easier when each
 * language lives in its own template. Same shape, different content.
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

  protected readonly version = '0.1 (draft)';
  protected readonly lastUpdated = '2026-04-30';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
