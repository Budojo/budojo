import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';

import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';
import { ConsentService } from '../../../core/services/consent.service';

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
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cookie-policy-it.component.html',
  styleUrl: './cookie-policy-it.component.scss',
})
export class CookiePolicyItComponent {
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentService);

  protected readonly version = '1.0';
  protected readonly lastUpdated = '2026-05-05';

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  managePreferences(): void {
    this.consent.reopen();
  }
}
