import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService } from '../../../core/services/language.service';
import type { AthleteSortField, AthleteSortOrder } from '../../../core/services/athlete.service';
import { BeltSortButtonComponent } from './belt-sort-button.component';

/**
 * The surface — icon states, the press, the accessible name — belongs to
 * `<app-sort-toggle>` and is covered by its own spec. What is tested here is
 * the belt POLICY this component adds on top: which state counts as active,
 * and which of the three tooltips describes it.
 */
@Component({
  imports: [BeltSortButtonComponent],
  template: `
    <app-belt-sort-button
      [field]="field()"
      [order]="order()"
      dataCy="spec-belt-sort"
      (cycle)="presses.set(presses() + 1)"
    />
  `,
})
class HostComponent {
  readonly field = signal<AthleteSortField | null>(null);
  readonly order = signal<AthleteSortOrder>('desc');
  readonly presses = signal(0);
}

function setup() {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [...provideI18nTesting()],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

function button(fixture: ReturnType<typeof setup>['fixture']): HTMLButtonElement {
  const el = fixture.nativeElement.querySelector(
    '[data-cy="spec-belt-sort"]',
  ) as HTMLButtonElement | null;
  expect(el).not.toBeNull();
  return el!;
}

describe('BeltSortButtonComponent', () => {
  it('reads as on only while belt is what the list is sorted by', () => {
    const { fixture, host } = setup();

    host.field.set('belt');
    fixture.detectChanges();
    expect(button(fixture).classList.contains('sort-toggle--on')).toBe(true);

    // The sort moves away through another header — this control goes neutral
    // rather than staying lit on a stale internal state.
    host.field.set('first_name');
    fixture.detectChanges();
    expect(button(fixture).classList.contains('sort-toggle--on')).toBe(false);
  });

  it('says what the state is, in words, and re-says it in the other language', () => {
    const { fixture, host } = setup();

    expect(button(fixture).getAttribute('aria-label')).toBe(
      'Click to sort by belt rank (black → white)',
    );

    host.field.set('belt');
    host.order.set('asc');
    fixture.detectChanges();
    expect(button(fixture).getAttribute('aria-label')).toBe(
      'Sorted by belt (white → black). Click to flip.',
    );

    TestBed.inject(LanguageService).setLanguage('it');
    fixture.detectChanges();
    expect(button(fixture).getAttribute('aria-label')).toBe(
      'Ordinato per cintura (bianca → nera). Clicca per invertire.',
    );
    expect(button(fixture).textContent?.trim()).toBe('Cintura');
  });

  it('passes the press through to the host', () => {
    const { fixture, host } = setup();

    button(fixture).click();

    expect(host.presses()).toBe(1);
  });
});
