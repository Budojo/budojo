import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChoiceGridComponent, ChoiceOption } from './choice-grid.component';

type Mode = 'kata' | 'kumite' | 'both';

@Component({
  imports: [ChoiceGridComponent],
  template: `
    <span id="mode-label">Type</span>
    <app-choice-grid
      [options]="options"
      [value]="value()"
      ariaLabelledBy="mode-label"
      describedBy="mode-hint"
      (valueChange)="picked.push($event)"
    />
  `,
})
class HostComponent {
  readonly options: ChoiceOption<Mode>[] = [
    { value: 'kata', label: 'Kata' },
    { value: 'kumite', label: 'Kumite' },
    { value: 'both', label: 'Kata and kumite' },
  ];
  readonly value = signal<Mode | null>('both');
  readonly picked: Mode[] = [];
}

describe('ChoiceGridComponent (#1803)', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('takes its name from a visible label and its description from a hint, by id', () => {
    const { el } = setup();
    const group = el.querySelector('[role="group"]');

    expect(group?.getAttribute('aria-labelledby')).toBe('mode-label');
    expect(group?.getAttribute('aria-describedby')).toBe('mode-hint');
    expect(group?.hasAttribute('aria-label')).toBe(false);
  });

  it('draws the options in order, the value pressed, and no data-cy unless asked', () => {
    const { el } = setup();
    const buttons = Array.from(el.querySelectorAll('button'));

    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      'Kata',
      'Kumite',
      'Kata and kumite',
    ]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(buttons.some((b) => b.hasAttribute('data-cy'))).toBe(false);
  });

  it('never clears a closed choice: a press on the chosen option re-emits it', () => {
    const { fixture, el } = setup();

    Array.from(el.querySelectorAll<HTMLButtonElement>('button'))[2].click();

    expect(fixture.componentInstance.picked).toEqual(['both']);
  });

  it('reports a press without taking the value for itself', () => {
    const { fixture, el } = setup();

    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.picked).toEqual(['kata']);
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });
});
