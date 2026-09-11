import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { AthleteSortOrder } from '../../../core/services/athlete.service';
import { SortToggleComponent } from './sort-toggle.component';

@Component({
  imports: [SortToggleComponent],
  template: `
    <app-sort-toggle
      label="Belt"
      tooltip="Sorted by belt (black → white). Click to flip."
      [active]="active()"
      [order]="order()"
      dataCy="spec-toggle"
      (cycle)="presses.set(presses() + 1)"
    />
  `,
})
class HostComponent {
  readonly active = signal(false);
  readonly order = signal<AthleteSortOrder>('desc');
  readonly presses = signal(0);
}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

function button(fixture: ReturnType<typeof setup>['fixture']): HTMLButtonElement {
  const el = fixture.nativeElement.querySelector(
    '[data-cy="spec-toggle"]',
  ) as HTMLButtonElement | null;
  expect(el).not.toBeNull();
  return el!;
}

describe('SortToggleComponent', () => {
  it('puts the whole state in the icon, so the word can disappear on a phone', () => {
    const { fixture, host } = setup();
    const icon = (): HTMLElement => button(fixture).querySelector('i') as HTMLElement;

    expect(icon().classList.contains('pi-sort-alt')).toBe(true);

    host.active.set(true);
    fixture.detectChanges();
    expect(icon().classList.contains('pi-sort-amount-down')).toBe(true);

    host.order.set('asc');
    fixture.detectChanges();
    expect(icon().classList.contains('pi-sort-amount-up-alt')).toBe(true);
  });

  it('ignores the direction while it is not the field driving the sort', () => {
    const { fixture, host } = setup();

    // Another column took the sort. The direction signal still says `asc`,
    // but this control has nothing to point at — a lit arrow here would
    // claim it was ordering the list.
    host.order.set('asc');
    fixture.detectChanges();

    expect(button(fixture).querySelector('i')?.classList.contains('pi-sort-alt')).toBe(true);
    expect(button(fixture).classList.contains('sort-toggle--on')).toBe(false);
  });

  it('carries the tooltip as its accessible name — the icon alone is a riddle', () => {
    const { fixture } = setup();

    expect(button(fixture).tagName).toBe('BUTTON');
    expect(button(fixture).getAttribute('aria-label')).toBe(
      'Sorted by belt (black → white). Click to flip.',
    );
    expect(button(fixture).textContent?.trim()).toBe('Belt');
  });

  it('emits one cycle per press', () => {
    const { fixture, host } = setup();

    button(fixture).click();
    button(fixture).click();

    expect(host.presses()).toBe(2);
  });
});
