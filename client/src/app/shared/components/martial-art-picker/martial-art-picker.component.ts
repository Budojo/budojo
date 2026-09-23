import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MartialArt } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { MARTIAL_ART_KEYS, MARTIAL_ARTS } from '../../utils/i18n-enum-keys';
import { ChoiceGridComponent, ChoiceOption } from '../choice-grid/choice-grid.component';

/**
 * Which martial art the academy teaches (#1802) — four large choices, one of
 * them pressed. The layout and the accessibility are `ChoiceGridComponent`'s;
 * this knows only the four arts and what they are called.
 */
@Component({
  selector: 'app-martial-art-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChoiceGridComponent],
  template: `
    <app-choice-grid
      [options]="options()"
      [value]="value()"
      [ariaLabel]="ariaLabel()"
      [describedBy]="describedBy()"
      optionCy="martial-art-"
      (valueChange)="valueChange.emit($event)"
    />
  `,
})
export class MartialArtPickerComponent {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  /** The chosen art, or null before the owner has chosen — there is no default. */
  readonly value = input<MartialArt | null>(null);

  /** The group's accessible name — the same words as the visible label beside it. */
  readonly ariaLabel = input<string | null>(null);
  /** The id of the field's hint or error, for the group to announce. */
  readonly describedBy = input<string | null>(null);

  readonly valueChange = output<MartialArt>();

  protected readonly options = computed<ChoiceOption<MartialArt>[]>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return MARTIAL_ARTS.map((art) => ({
      value: art,
      label: this.translate.instant(MARTIAL_ART_KEYS[art]),
    }));
  });
}
