import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/terms` page — **English-default** (#420). Mirrors the
 * structure of `/privacy` (#291): canonical English at /terms, the
 * faithful Italian translation at /terms/it.
 *
 * **Three artefacts, one content domain.** Same lock-step rule the
 * privacy + sub-processors pages document:
 *
 *   1. `docs/legal/terms-of-service.md` — the canonical, auditor-readable
 *      markdown source. (Currently a placeholder; lawyer review queued.)
 *   2. This component's HTML — English rendering at /terms.
 *   3. `it/terms-it.component.html` — Italian rendering at /terms/it.
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 *
 * **Placeholder copy.** The current text is a structural scaffold —
 * it identifies the service, lists the obligations we already enforce
 * in code (acceptable use, account responsibility, our right to
 * suspend abusive accounts), and points at the privacy policy for
 * data handling. The exact wording REQUIRES legal review before this
 * page is treated as a binding contract; the registration flow's
 * "I accept" checkbox will continue to record the timestamp under
 * whatever text counsel approves.
 */
@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss',
})
export class TermsComponent {
  private readonly router = inject(Router);

  protected readonly version = '0.1 (placeholder)';
  protected readonly lastUpdated = '2026-05-05';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
