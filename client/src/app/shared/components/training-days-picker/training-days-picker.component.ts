import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

const WEEKDAYS = [
  { key: 'weekdays.mon', value: 1 },
  { key: 'weekdays.tue', value: 2 },
  { key: 'weekdays.wed', value: 3 },
  { key: 'weekdays.thu', value: 4 },
  { key: 'weekdays.fri', value: 5 },
  { key: 'weekdays.sat', value: 6 },
  { key: 'weekdays.sun', value: 0 },
] as const;

/**
 * Seven toggleable weekday buttons. Carbon `dayOfWeek` convention on the
 * value side (0=Sun..6=Sat); display order is Mon-first because the
 * Western academy week starts on Monday (Norman: match the user's mental
 * model, not the system's). The component emits an ordered ascending
 * `number[]` so the resource sees a canonical shape on the wire (#88a).
 *
 * `selectionMode="single"` (#1562) turns the row into a radio group — one
 * day, and picking another replaces it — for the timetable's "which day is
 * this class on". Same seven pills the owner already knows from the training
 * days, so the second place a weekday is chosen looks like the first (Jakob).
 * The value stays a list either way; in single mode it holds at most one.
 */
@Component({
  selector: 'app-training-days-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div
      class="training-days-picker"
      [attr.role]="single() ? 'radiogroup' : 'group'"
      [attr.aria-label]="ariaLabel() ?? ('weekdays.groupAria' | translate)"
    >
      @for (day of weekdays; track day.value) {
        <!--
          Toggle buttons in multiple mode, radios in single: aria-pressed on
          a radio would announce a pressed state that has no meaning, and
          aria-checked on a toggle button is not a thing.
        -->
        <button
          type="button"
          class="training-days-picker__day"
          [class.training-days-picker__day--selected]="isSelected(day.value)"
          [attr.role]="single() ? 'radio' : null"
          [attr.aria-checked]="single() ? isSelected(day.value) : null"
          [attr.aria-pressed]="single() ? null : isSelected(day.value)"
          (click)="toggle(day.value)"
          [attr.data-cy]="dataCyPrefix() + day.value"
        >
          {{ day.key | translate }}
        </button>
      }
    </div>
  `,
  styleUrl: './training-days-picker.component.scss',
})
export class TrainingDaysPickerComponent {
  readonly weekdays = WEEKDAYS;

  /** Current selection. `null` is normalised to an empty list internally. */
  readonly value = input<number[] | null>(null);

  /** `multiple` toggles days in and out; `single` picks exactly one. */
  readonly selectionMode = input<'multiple' | 'single'>('multiple');

  /** Group label for AT; defaults to the training-days wording. */
  readonly ariaLabel = input<string | null>(null);

  /** `data-cy` prefix per pill, so two pickers on one screen stay addressable. */
  readonly dataCyPrefix = input<string>('training-day-');

  /** Emits the new (ascending-sorted) selection on every toggle. */
  readonly valueChange = output<number[]>();

  protected readonly selected = computed(() => new Set(this.value() ?? []));

  protected readonly single = computed(() => this.selectionMode() === 'single');

  isSelected(day: number): boolean {
    return this.selected().has(day);
  }

  toggle(day: number): void {
    if (this.single()) {
      // A radio does not un-pick itself: pressing the selected day again
      // leaves it selected, and nothing needs to be emitted.
      if (!this.isSelected(day)) this.valueChange.emit([day]);
      return;
    }

    const current = this.value() ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    next.sort((a, b) => a - b);
    this.valueChange.emit(next);
  }
}
