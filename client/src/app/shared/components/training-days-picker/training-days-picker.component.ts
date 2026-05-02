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
 */
@Component({
  selector: 'app-training-days-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div
      class="training-days-picker"
      role="group"
      [attr.aria-label]="'weekdays.groupAria' | translate"
    >
      @for (day of weekdays; track day.value) {
        <button
          type="button"
          class="training-days-picker__day"
          [class.training-days-picker__day--selected]="isSelected(day.value)"
          [attr.aria-pressed]="isSelected(day.value)"
          (click)="toggle(day.value)"
          [attr.data-cy]="'training-day-' + day.value"
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

  /** Emits the new (ascending-sorted) selection on every toggle. */
  readonly valueChange = output<number[]>();

  protected readonly selected = computed(() => new Set(this.value() ?? []));

  isSelected(day: number): boolean {
    return this.selected().has(day);
  }

  toggle(day: number): void {
    const current = this.value() ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    next.sort((a, b) => a - b);
    this.valueChange.emit(next);
  }
}
