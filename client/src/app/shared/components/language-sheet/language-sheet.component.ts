import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService, SupportedLanguage } from '../../../core/services/language.service';

interface LanguageOption {
  readonly code: SupportedLanguage;
  readonly labelKey: string;
}

/**
 * Language picker (#1109) — a slide-up bottom sheet listing the supported
 * locales, the active one checked. Opened from a dedicated "Language" entry
 * in the settings / More hub (the top-player standard — Settings → Language
 * → picker), replacing the old inline segmented toggle. A
 * `<p-dialog styleClass="bottom-sheet">`, so the mobile sheet chrome comes
 * from the global rule; p-dialog gives the mask, Esc, focus-trap + a11y.
 */
@Component({
  selector: 'app-language-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule, TranslatePipe],
  templateUrl: './language-sheet.component.html',
  styleUrl: './language-sheet.component.scss',
})
export class LanguageSheetComponent {
  private readonly languageService = inject(LanguageService);

  protected readonly currentLang = this.languageService.currentLang;
  protected readonly isOpen = signal<boolean>(false);

  protected readonly options: readonly LanguageOption[] = [
    { code: 'en', labelKey: 'language.english' },
    { code: 'it', labelKey: 'language.italian' },
  ];

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  protected select(code: SupportedLanguage): void {
    this.languageService.setLanguage(code);
    this.close();
  }
}
