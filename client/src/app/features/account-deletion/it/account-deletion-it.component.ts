import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/account-deletion/it` page (#688) — Italian translation of
 * the canonical English `/account-deletion`.
 *
 * Italian remains the **legally-citable source of truth** for the
 * Garante and IT customers, even though the SPA's default URL serves
 * English (#271 EN-first roadmap). Mirror of the three-artefact
 * lock-step rule documented on the English component:
 *
 *   1. `docs/legal/account-deletion.md` — canonical, auditor-readable
 *      markdown source.
 *   2. `../account-deletion.component.html` — English rendering at
 *      /account-deletion.
 *   3. This component's HTML — Italian rendering at /account-deletion/it.
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 *
 * Public route (no auth) — the page is referenced from the Play Store
 * listing and from the email-based deletion confirmation flow.
 */
@Component({
  selector: 'app-account-deletion-it',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-deletion-it.component.html',
  styleUrl: './account-deletion-it.component.scss',
})
export class AccountDeletionItComponent {
  private readonly router = inject(Router);

  protected readonly version = '1.0';
  protected readonly lastUpdated = '2026-05-13';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
