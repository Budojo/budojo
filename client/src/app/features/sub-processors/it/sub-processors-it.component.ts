import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/sub-processors/it` page (#280) — Italian translation of the
 * canonical English `/sub-processors`.
 *
 * **Source-of-truth rule (different from `/privacy`).** Sub-processors
 * is multi-jurisdictional and has no legal-source-of-truth lingual
 * anchor — the English markdown at `docs/legal/sub-processors.md` is
 * the canonical list. This Italian page is a faithful translation
 * served at a parallel URL so Italian academy customers and the
 * Garante can read the same GDPR Art. 28 disclosure in their own
 * language; it is NOT the legally-citable artefact (that role belongs
 * to the EN markdown). Contrast with `/privacy/it`, where the Italian
 * version IS the legal source of truth because the underlying Art. 13
 * informativa is an Italian-law artefact and the EN page is the
 * translation.
 *
 * **Three artefacts, one content domain** — same lock-step discipline
 * as `/privacy` regardless of which language is canonical:
 *
 *   1. `docs/legal/sub-processors.md` — canonical, auditor-readable
 *      markdown source (English).
 *   2. `../sub-processors.component.html` — English rendering at
 *      `/sub-processors` (mirrors the markdown one-for-one).
 *   3. This component's HTML — Italian rendering at
 *      `/sub-processors/it` (faithful translation of the English
 *      page).
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
