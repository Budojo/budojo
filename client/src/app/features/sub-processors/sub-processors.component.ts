import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/sub-processors` page (#225). GDPR Art. 28 transparency: the
 * canonical list of every third party that processes Budojo customer
 * data lives here. The markdown source of truth is
 * `docs/legal/sub-processors.md`; this component is the SPA surface
 * that academy clients (and the Garante) can read.
 *
 * The HTML carries the same data points as the markdown but the
 * presentation is intentionally hand-tailored to the SPA layout —
 * column count and copy can drift slightly so the on-page chrome
 * stays readable on narrow viewports. When either side changes, the
 * other gets refreshed in the same PR per CLAUDE.md documentation
 * discipline.
 *
 * Public route (no auth) so prospects + the regulator can read it
 * without a login.
 */
@Component({
  selector: 'app-sub-processors',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
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
