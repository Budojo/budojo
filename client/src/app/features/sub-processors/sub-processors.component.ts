import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/sub-processors` page (#225). GDPR Art. 28 transparency: the
 * canonical list of every third party that processes Budojo customer
 * data lives here. The markdown source of truth is
 * `docs/legal/sub-processors.md`; this component is the rendered SPA
 * surface that academy clients (and the Garante) can read.
 *
 * Static HTML translation of the markdown — no markdown loader so the
 * page is dependency-free and reads identically on the prerendered
 * SPA shell. The markdown file remains the canonical source — when it
 * changes, this component is updated in the same PR per CLAUDE.md
 * documentation discipline.
 *
 * Public route (no auth) so prospects + the regulator can read it
 * without a login.
 */
@Component({
  selector: 'app-sub-processors',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sub-processors.component.html',
  styleUrl: './sub-processors.component.scss',
})
export class SubProcessorsComponent {
  private readonly router = inject(Router);

  protected readonly lastUpdated = '2026-04-29';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
