import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MartialArt } from '../../../core/services/academy.service';
import { MARTIAL_ART_KEYS, MARTIAL_ARTS } from '../../utils/i18n-enum-keys';

/**
 * Which martial art the academy teaches (#1802) — four large choices, one of
 * them pressed.
 *
 * Not a `p-selectbutton`: four options, one of them "Brazilian jiu-jitsu", do
 * not fit a segmented row on a phone, and a segmented control that wraps
 * reads as broken. A 2×2 grid of 48px buttons does (Fitts), and it is the
 * same visual language as the training-days picker on the same screen.
 *
 * Buttons with `aria-pressed`, not radios: a radiogroup promises arrow-key
 * navigation, and roles without the roving tabindex behind them are worse
 * than honest buttons (#1795).
 */
@Component({
  selector: 'app-martial-art-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="martial-art-picker" role="group" [attr.aria-label]="ariaLabel()">
      @for (art of arts; track art) {
        <button
          type="button"
          class="martial-art-picker__option"
          [class.martial-art-picker__option--selected]="value() === art"
          [attr.aria-pressed]="value() === art"
          (click)="valueChange.emit(art)"
          [attr.data-cy]="'martial-art-' + art"
        >
          {{ keys[art] | translate }}
        </button>
      }
    </div>
  `,
  styleUrl: './martial-art-picker.component.scss',
})
export class MartialArtPickerComponent {
  /** The chosen art, or null before the owner has chosen — there is no default. */
  readonly value = input<MartialArt | null>(null);

  /** The group's accessible name — the same words as the visible label beside it. */
  readonly ariaLabel = input<string | null>(null);

  readonly valueChange = output<MartialArt>();

  protected readonly arts = MARTIAL_ARTS;
  protected readonly keys = MARTIAL_ART_KEYS;
}
