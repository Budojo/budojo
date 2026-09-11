import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { beltSortTooltipKey, type SortState } from '../../utils/athlete-sort';
import type { AthleteSortField, AthleteSortOrder } from '../../../core/services/athlete.service';
import { SortToggleComponent } from '../sort-toggle/sort-toggle.component';

/**
 * Sort a roster by belt rank, from the toolbar (#1526).
 *
 * The surface is `<app-sort-toggle>`, shared with the monthly summary's day
 * count. What lives here is the belt POLICY — which state counts as active,
 * which word, which of the three tooltips — so the roster and the daily
 * check-in cannot drift on it. They both draw the same people out of the same
 * endpoint, and until #1526 only one of them could order them by rank.
 */
@Component({
  selector: 'app-belt-sort-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SortToggleComponent],
  template: `
    <app-sort-toggle
      [label]="label()"
      [tooltip]="tooltip()"
      [active]="isActive()"
      [order]="order()"
      [dataCy]="dataCy()"
      (cycle)="cycle.emit()"
    />
  `,
})
export class BeltSortButtonComponent {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  /** What the host list is sorted by right now. */
  readonly field = input.required<AthleteSortField | null>();
  readonly order = input.required<AthleteSortOrder>();
  readonly dataCy = input<string | null>(null);

  readonly cycle = output<void>();

  protected readonly isActive = computed(() => this.field() === 'belt');

  private readonly state = computed<SortState>(() => ({
    field: this.field(),
    order: this.order(),
  }));

  protected readonly label = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return this.translate.instant('shared.sort.beltLabel');
  });

  /** Plain-English tooltip — Norman § signifier. Says what the state is. */
  protected readonly tooltip = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return this.translate.instant(beltSortTooltipKey(this.state()));
  });
}
