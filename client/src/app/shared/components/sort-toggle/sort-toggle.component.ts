import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';
import type { AthleteSortOrder } from '../../../core/services/athlete.service';

/**
 * A sort control that lives in the toolbar rather than in a column header
 * (#1443, #1526).
 *
 * Every list in the app hides its table below 768px and renders cards instead,
 * so a sort that lives in a `<th>` does not exist on a phone. Belt sorting was
 * desktop-only for as long as it was a column, and the monthly summary's day
 * count was the same the day it became sortable. This is where the one sort a
 * list is usually read by belongs.
 *
 * Presentational: it renders a state and emits a press. The icon carries the
 * state on its own — neutral / up / down — so the word is free to disappear
 * below 768px without the button becoming a riddle.
 */
@Component({
  selector: 'app-sort-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tooltip],
  template: `
    <button
      type="button"
      class="sort-toggle"
      [class.sort-toggle--on]="active()"
      [pTooltip]="tooltip()"
      tooltipPosition="top"
      [attr.aria-label]="tooltip()"
      [attr.data-cy]="dataCy()"
      (click)="cycle.emit()"
    >
      <i
        class="pi"
        [class.pi-sort-alt]="!active()"
        [class.pi-sort-amount-up-alt]="active() && order() === 'asc'"
        [class.pi-sort-amount-down]="active() && order() === 'desc'"
        aria-hidden="true"
      ></i>
      <span class="sort-toggle__label">{{ label() }}</span>
    </button>
  `,
  styleUrl: './sort-toggle.component.scss',
})
export class SortToggleComponent {
  /** Already-translated field name — the word beside the icon above 768px. */
  readonly label = input.required<string>();

  /** Already-translated tooltip. Doubles as the button's accessible name. */
  readonly tooltip = input.required<string>();

  /** True while this field is what the list is sorted by. */
  readonly active = input.required<boolean>();

  readonly order = input.required<AthleteSortOrder>();

  readonly dataCy = input<string | null>(null);

  readonly cycle = output<void>();
}
