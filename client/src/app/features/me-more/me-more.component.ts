import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { LanguageSheetComponent } from '../../shared/components/language-sheet/language-sheet.component';
import { VERSION } from '../../../environments/version';

/**
 * Athlete "More" hub (#1109). Homes the destinations demoted off the
 * bottom tab bar — public profile, payments, documents, settings — plus
 * a dedicated "Language" entry (→ the `app-language-sheet` picker, the
 * top-player standard for locale selection), sign-out, and a light
 * Help · Privacy · version footer. Reached from the bottom-nav "More" tab.
 */
@Component({
  selector: 'app-me-more',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, LanguageSheetComponent],
  templateUrl: './me-more.component.html',
  styleUrl: './me-more.component.scss',
})
export class MeMoreComponent {
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
