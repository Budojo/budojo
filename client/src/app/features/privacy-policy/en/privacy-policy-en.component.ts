import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/privacy/en` page (#273). English translation of the canonical
 * Italian `/privacy` notice. Italian remains the legal source of truth
 * for IT customers and the Garante; this English version is a faithful
 * translation, kept in lock-step with the Italian source as part of
 * the same PR whenever a fact changes.
 *
 * Why a separate component (vs an `@if` branch in the Italian one):
 * the legal text is dense and prose-heavy; reviewing it in two
 * languages is much easier when each language lives in its own
 * template. Same shape, different content.
 */
@Component({
  selector: 'app-privacy-policy-en',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy-policy-en.component.html',
  styleUrl: './privacy-policy-en.component.scss',
})
export class PrivacyPolicyEnComponent {
  private readonly router = inject(Router);

  protected readonly version = '0.1 (draft)';
  protected readonly lastUpdated = '2026-04-30';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
