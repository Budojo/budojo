import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';

/**
 * Public `/account-deletion` page (#688) — **English default**.
 *
 * Exists primarily to satisfy Google Play's Data Safety form, which
 * requires apps that support account creation to expose a publicly
 * reachable URL describing the account-deletion process. The URL is
 * referenced on the Play Store listing and visited by the reviewer
 * during policy review.
 *
 * **Three artefacts, one content domain** — same lock-step rule as
 * `/privacy{,/it}` and `/sub-processors{,/it}`:
 *
 *   1. `docs/legal/account-deletion.md` — canonical, auditor-readable
 *      markdown source.
 *   2. This component's HTML — English rendering at /account-deletion.
 *   3. `it/account-deletion-it.component.html` — Italian rendering at
 *      /account-deletion/it (the legal source of truth for IT customers).
 *
 * Edits to ANY ONE of the three MUST land in lock-step in the same PR.
 *
 * Public route (no auth) — the Play Store reviewer, prospects, and
 * customers who no longer have dashboard access must all be able to
 * read it.
 */
@Component({
  selector: 'app-account-deletion',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, BrandGlyphComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-deletion.component.html',
  styleUrl: './account-deletion.component.scss',
})
export class AccountDeletionComponent {
  private readonly router = inject(Router);

  protected readonly version = '1.0';
  protected readonly lastUpdated = '2026-05-13';

  goHome(): void {
    this.router.navigateByUrl('/');
  }
}
