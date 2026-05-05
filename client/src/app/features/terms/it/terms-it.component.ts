import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/terms/it` page (#420) — Italian translation of the
 * canonical English `/terms` Terms of Service.
 *
 * **Three artefacts, one content domain.** Mirror of the rule
 * documented on the English component:
 *
 *   1. `docs/legal/terms-of-service.md` — the canonical, auditor-readable
 *      markdown source.
 *   2. `../terms.component.html` — English rendering at /terms.
 *   3. This component's HTML — Italian rendering at /terms/it.
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 *
 * **Placeholder copy.** The current text is a structural scaffold —
 * REQUIRES legal review before this page can be relied on as a binding
 * contract. Same disclaimer banner as the English version.
 */
@Component({
  selector: 'app-terms-it',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './terms-it.component.html',
  styleUrl: './terms-it.component.scss',
})
export class TermsItComponent {
  private readonly router = inject(Router);

  protected readonly version = '0.1 (placeholder)';
  protected readonly lastUpdated = '2026-05-05';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
