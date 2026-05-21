import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService, SupportedLanguage } from '../../../core/services/language.service';
import { VERSION } from '../../../../environments/version';

/**
 * Shared sidebar "meta" footer (#902).
 *
 * Originally only mounted in the owner dashboard shell — the athlete
 * portal sidebar fell back to a bare Sign-out button, leaving users on
 * the athlete side without:
 *  - a way to confirm which version they're running (impossible to
 *    verify a fix landed);
 *  - the inline language toggle (stuck on whatever locale was set
 *    last);
 *  - Help / Privacy links inside the shell.
 *
 * Now mounted by both shells immediately after the per-shell Sign-out
 * button. The two-pill language toggle reads the active lang from
 * `LanguageService` (the single source of truth); the version line
 * carries Help · Privacy · vX.Y.Z, with the Privacy URL adapted to
 * the active language (#291).
 */
@Component({
  selector: 'app-sidebar-footer-meta',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar-footer-meta.component.html',
  styleUrl: './sidebar-footer-meta.component.scss',
})
export class SidebarFooterMetaComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly currentLang = this.languageService.currentLang;
  protected readonly versionTag = VERSION.tag;

  protected setLang(lang: SupportedLanguage): void {
    this.languageService.setLanguage(lang);
  }
}
