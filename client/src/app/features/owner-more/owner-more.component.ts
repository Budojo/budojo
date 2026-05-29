import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { LanguageSheetComponent } from '../../shared/components/language-sheet/language-sheet.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { VERSION } from '../../../environments/version';

/**
 * Owner "More" hub (#1111). Homes the destinations demoted off the owner
 * bottom tab bar — attendance, stats, activity log, settings, public
 * profile, support, what's-new — plus a dedicated "Language" entry (→ the
 * `app-language-sheet` picker, the top-player standard) and sign-out, with
 * a light Help · Privacy · version footer. Reached from the bottom-nav
 * "More" tab. The athlete-side counterpart is `MeMoreComponent`; the two
 * share the visual pattern but carry role-specific rows, so they stay
 * separate components (they evolve independently).
 */
@Component({
  selector: 'app-owner-more',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, RouterLink, TranslatePipe, LanguageSheetComponent],
  templateUrl: './owner-more.component.html',
  styleUrl: './owner-more.component.scss',
})
export class OwnerMoreComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  protected readonly user = this.authService.user;
  protected readonly currentLang = this.languageService.currentLang;
  protected readonly versionTag = VERSION.tag;
  protected readonly languageSheet = viewChild.required(LanguageSheetComponent);

  protected openLanguage(): void {
    this.languageSheet().open();
  }

  protected signOut(): void {
    this.authService.logout();
    void this.router.navigate(['/auth/login']);
  }
}
