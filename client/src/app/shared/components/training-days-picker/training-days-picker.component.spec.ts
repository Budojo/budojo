import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TrainingDaysPickerComponent } from './training-days-picker.component';

describe('TrainingDaysPickerComponent', () => {
  function renderWith(value: number[] | null): {
    fixture: ReturnType<typeof TestBed.createComponent<TrainingDaysPickerComponent>>;
    componentRef: ComponentRef<TrainingDaysPickerComponent>;
    emissions: number[][];
  } {
    const fixture = TestBed.createComponent(TrainingDaysPickerComponent);
    const componentRef = fixture.componentRef;
    componentRef.setInput('value', value);
    const emissions: number[][] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emissions.push(v));
    fixture.detectChanges();
    return { fixture, componentRef, emissions };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TrainingDaysPickerComponent] });
  });

  it('renders 7 toggleable buttons in Mon-first order', () => {
    const { fixture } = renderWith([]);

    const buttons = fixture.nativeElement.querySelectorAll(
      '.training-days-picker__day',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(7);
    // Mon-first display order matches the Western academy week (Norman).
    expect(Array.from(buttons).map((b) => b.textContent?.trim())).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('marks the buttons whose value is in the input as selected', () => {
    const { fixture } = renderWith([2, 4, 6]); // Tue, Thu, Sat

    const tue = fixture.nativeElement.querySelector(
      '[data-cy="training-day-2"]',
    ) as HTMLButtonElement;
    const wed = fixture.nativeElement.querySelector(
      '[data-cy="training-day-3"]',
    ) as HTMLButtonElement;
    expect(tue.getAttribute('aria-pressed')).toBe('true');
    expect(wed.getAttribute('aria-pressed')).toBe('false');
  });

  it('emits a sorted list when a new day is toggled on', () => {
    const { fixture, emissions } = renderWith([4]);

    const tue = fixture.nativeElement.querySelector(
      '[data-cy="training-day-2"]',
    ) as HTMLButtonElement;
    tue.click();

    // Adding 2 to [4] should emit [2, 4] — sorted ascending so the wire
    // shape is canonical regardless of click order.
    expect(emissions).toEqual([[2, 4]]);
  });

  it('emits without the day when an already-selected one is toggled off', () => {
    const { fixture, emissions } = renderWith([2, 4, 6]);

    const thu = fixture.nativeElement.querySelector(
      '[data-cy="training-day-4"]',
    ) as HTMLButtonElement;
    thu.click();

    expect(emissions).toEqual([[2, 6]]);
  });

  it('treats null input as an empty selection', () => {
    const { fixture } = renderWith(null);

    const buttons = fixture.nativeElement.querySelectorAll(
      '[aria-pressed="true"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(0);
  });
});
