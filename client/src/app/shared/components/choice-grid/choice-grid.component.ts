import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ChoiceOption<T> {
  readonly value: T;
  readonly label: string;
}

/**
 * One choice among a few, as large buttons two to a row (#1802, #1803) — the
 * martial art at setup, the training mode of a class or a topic.
 *
 * Not a `p-selectbutton`: a segmented control is one joined row, and "Brazilian
 * jiu-jitsu" or "Tachi-waza and ne-waza" beside three other labels does not
 * fit a phone — it breaks words at their hyphens, then clips the last option.
 * A grid of 48px buttons does fit (Fitts), and it is the same visual language
 * as the training-days picker these forms already carry.
 *
 * Controlled: `value` in, `valueChange` out, and nothing looks selected until
 * the owner says so. Buttons with `aria-pressed`, not radios: a radiogroup
 * promises arrow-key navigation, and roles without the roving tabindex behind
 * them are worse than honest buttons (#1795). Every button is `type="button"`,
 * so a press never submits the form around it.
 */
@Component({
  selector: 'app-choice-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="choice-grid"
      role="group"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-labelledby]="ariaLabelledBy()"
      [attr.aria-describedby]="describedBy()"
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          class="choice-grid__option"
          [class.choice-grid__option--selected]="value() === option.value"
          [attr.aria-pressed]="value() === option.value"
          (click)="valueChange.emit(option.value)"
          [attr.data-cy]="optionCy() ? optionCy() + option.value : null"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './choice-grid.component.scss',
})
export class ChoiceGridComponent<T extends string> {
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  readonly value = input<T | null>(null);
  /** Name the group with a string… */
  readonly ariaLabel = input<string | null>(null);
  /** …or with the id of a visible label, when the form already has one. */
  readonly ariaLabelledBy = input<string | null>(null);
  /**
   * The id of the hint or error the group should announce, as
   * `BudojoFormField` renders them (`{controlId}-hint` / `-error`). A group
   * has no `<label for>` to borrow them from.
   */
  readonly describedBy = input<string | null>(null);
  /** Prefix for each button's `data-cy`, followed by its value. */
  readonly optionCy = input<string | null>(null);
  readonly valueChange = output<T>();
}
