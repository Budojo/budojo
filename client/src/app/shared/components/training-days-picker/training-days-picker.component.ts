import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

const WEEKDAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
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
  template: `
    <div class="training-days-picker" role="group" aria-label="Training days of the week">
      @for (day of weekdays; track day.value) {
        <button
          type="button"
          class="training-days-picker__day"
          [class.training-days-picker__day--selected]="isSelected(day.value)"
          [attr.aria-pressed]="isSelected(day.value)"
          (click)="toggle(day.value)"
          [attr.data-cy]="'training-day-' + day.value"
        >
          {{ day.label }}
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
