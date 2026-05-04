import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/sub-processors/it` page (#280) — Italian translation of the
 * canonical English `/sub-processors`.
 *
 * Italian remains the legally-citable artefact for Italian academy
 * customers and the Garante; English is the URL default per the #271
 * EN-first roadmap.
 *
 * Mirror of the same "three artefacts, one content domain" rule that
 * the privacy pages document:
 *
 *   1. `docs/legal/sub-processors.md` — canonical, auditor-readable
 *      markdown source.
 *   2. `../sub-processors.component.html` — English rendering at
 *      `/sub-processors`.
 *   3. This component's HTML — Italian rendering at
 *      `/sub-processors/it`.
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 *
 * Public route (no auth) so prospects + the regulator can read it
 * without a login.
 */
@Component({
  selector: 'app-sub-processors-it',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sub-processors-it.component.html',
  styleUrl: './sub-processors-it.component.scss',
})
export class SubProcessorsItComponent {
  private readonly router = inject(Router);

  protected readonly lastUpdated = '2026-04-29';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
