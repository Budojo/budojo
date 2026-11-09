import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';
import { ConsentService } from '../../../core/services/consent.service';
import { RuntimeService } from '../../../core/services/runtime.service';

/**
 * Public `/cookie-policy/it` page (#421) — Italian translation of the
 * canonical English `/cookie-policy`.
 *
 * Italian remains the legally-citable source of truth for IT
 * customers and the Garante. Lock-step rule mirrors the privacy
 * policy: edits to `docs/legal/cookie-audit.md`, the EN page, and
 * this IT page must land in the same PR.
 */
@Component({
  selector: 'app-cookie-policy-it',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cookie-policy-it.component.html',
  styleUrl: './cookie-policy-it.component.scss',
})
export class CookiePolicyItComponent {
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentService);
  /** The consent section shows only where the banner is mounted: the web profile (#1508). */
  protected readonly runtime = inject(RuntimeService);

  protected readonly version = '2.0';
  protected readonly lastUpdated = '2026-11-09';

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  managePreferences(): void {
    this.consent.reopen();
  }
}
