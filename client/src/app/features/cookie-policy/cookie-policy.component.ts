import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';

import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { ConsentService } from '../../core/services/consent.service';

/**
 * Public `/cookie-policy` page (#421) — English-default to match
 * `/privacy` (#291). The faithful Italian translation lives at
 * `/cookie-policy/it`.
 *
 * **Source of truth.** The technical inventory of cookies / storage
 * keys / sub-processor cookies lives in `docs/legal/cookie-audit.md`.
 * This page, the IT translation, and the audit must stay in lock-step
 * — touching one means touching all three in the same PR. The audit
 * is the auditor-readable artefact; the two HTML components are the
 * SPA surface tuned for narrow viewports and the in-app "Manage
 * preferences" link.
 *
 * Public route (no auth) so prospects, the regulator, and the user
 * who accidentally clicked Reject can read the full breakdown
 * before re-deciding.
 */
@Component({
  selector: 'app-cookie-policy',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cookie-policy.component.html',
  styleUrl: './cookie-policy.component.scss',
})
export class CookiePolicyComponent {
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentService);

  protected readonly version = '1.0';
  protected readonly lastUpdated = '2026-05-05';

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  /**
   * Re-open the consent banner so the user can revise their decision
   * without clearing localStorage by hand. Wired from the "Manage your
   * preferences" link on the page body.
   */
  managePreferences(): void {
    this.consent.reopen();
  }
}
