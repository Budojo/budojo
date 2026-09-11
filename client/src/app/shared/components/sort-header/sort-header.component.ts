import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';

/**
 * The click target inside a sortable table header, shared by every list that
 * has one (#1526).
 *
 * The roster grew this in #196 and the check-in never got it: the same roster
 * sorted through PrimeNG's stock `<p-sortIcon>` on one screen and through a
 * click-cycle with an `F↑ / L↓ / ↕` signifier on the other. Nothing was shared,
 * so the better one could not reach the second screen.
 *
 * PrimeNG's own sort plumbing is not an option for any of them: it hard-codes a
 * 2-state cycle, and the name column needs four (which name leads, and the
 * direction). So the cell is wired by hand, and a real `<button>` carries the
 * press — `aria-sort` on the `<th>`, the state in plain English on the button's
 * aria-label, Enter and Space for free.
 *
 * The component is presentational: it renders a state and emits a press. The
 * cycle lives in `shared/utils/athlete-sort.ts` (name and belt) or in the host,
 * for a column only that host has.
 *
 * The `<th>` wants `class="sort-th"` alongside it — that rule (in
 * `budojo-theme.scss`) hands the cell's padding to this button, so the click
 * and focus target is the whole cell rather than just the words in it (Fitts).
 *
 * @example
 * ```html
 * <th class="sort-th" [attr.aria-sort]="nameAriaSort()">
 *   <app-sort-header
 *     [label]="'athletes.list.table.fullName' | translate"
 *     [signifier]="nameSortSignifier()"
 *     [tooltip]="nameSortTooltip()"
 *     dataCy="athletes-th-name"
 *     (cycle)="cycleNameSort()"
 *   />
 * </th>
 * ```
 */
@Component({
  selector: 'app-sort-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tooltip],
  template: `
    <button
      type="button"
      class="sort-header__btn"
      [class.sort-header__btn--end]="align() === 'end'"
      [pTooltip]="tooltip()"
      tooltipPosition="top"
      [attr.aria-label]="tooltip()"
      [attr.data-cy]="dataCy()"
      (click)="cycle.emit()"
    >
      {{ label() }}
      <span
        class="sort-header__signifier"
        [class.sort-header__signifier--active]="signifier() !== null"
        aria-hidden="true"
        >{{ signifier() ?? '↕' }}</span
      >
    </button>
  `,
  styleUrl: './sort-header.component.scss',
})
export class SortHeaderComponent {
  /** Already-translated column name. */
  readonly label = input.required<string>();

  /**
   * The compact state glyph — `F↑`, `L↓`, `M↓`. Null means this column is not
   * what the list is sorted by, and the neutral `↕` renders instead.
   */
  readonly signifier = input<string | null>(null);

  /** Already-translated tooltip. Doubles as the button's aria-label. */
  readonly tooltip = input.required<string>();

  /** Right-aligned for a column of numbers, which is read down its last digit. */
  readonly align = input<'start' | 'end'>('start');

  readonly dataCy = input<string | null>(null);

  readonly cycle = output<void>();
}
