import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The method behind a number, folded until the owner asks (#1853).
 *
 * Under a number goes one sentence that says what it counts. How it is
 * counted, and why it differs from the same-looking number on another screen,
 * is reference material: true, needed now and then, and a wall between the
 * owner and the number when it is all printed above the chart. So the page
 * keeps its one line and projects the rest in here.
 *
 * A native `<details>`: no state to keep, keyboard and screen reader support
 * for free, and it stays closed on every visit. Its `<summary>` is the
 * accessible name, so it is written as a question.
 *
 * ```html
 * <p>{{ 'x.fraction' | translate }}</p>
 * <app-how-counted dataCy="x-method">
 *   <p>{{ 'x.rule' | translate }}</p>
 * </app-how-counted>
 * ```
 */
@Component({
  selector: 'app-how-counted',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <details class="how-counted" [attr.data-cy]="dataCy()">
      <summary class="how-counted__summary">
        <i class="pi pi-chevron-right how-counted__chevron" aria-hidden="true"></i>
        <span>{{ 'common.howCounted' | translate }}</span>
      </summary>
      <div class="how-counted__body">
        <ng-content />
      </div>
    </details>
  `,
  styleUrl: './how-counted.component.scss',
})
export class HowCountedComponent {
  /** `data-cy` for the `<details>`, so a page's specs can reach its own fold. */
  readonly dataCy = input<string | null>(null);
}
