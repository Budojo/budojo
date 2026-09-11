import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SortHeaderComponent } from './sort-header.component';

@Component({
  imports: [SortHeaderComponent],
  template: `
    <table>
      <thead>
        <tr>
          <th class="sort-th">
            <app-sort-header
              label="Full name"
              [signifier]="signifier()"
              tooltip="Sorted by first name (A → Z). Click to cycle."
              [align]="align()"
              dataCy="spec-th"
              (cycle)="presses.set(presses() + 1)"
            />
          </th>
        </tr>
      </thead>
    </table>
  `,
})
class HostComponent {
  readonly signifier = signal<string | null>(null);
  readonly align = signal<'start' | 'end'>('start');
  readonly presses = signal(0);
}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

function button(fixture: ReturnType<typeof setup>['fixture']): HTMLButtonElement {
  const el = fixture.nativeElement.querySelector('[data-cy="spec-th"]') as HTMLButtonElement | null;
  expect(el).not.toBeNull();
  return el!;
}

describe('SortHeaderComponent', () => {
  it('renders the neutral ↕ until a signifier arrives', () => {
    const { fixture, host } = setup();

    const glyph = (): Element | null =>
      fixture.nativeElement.querySelector('.sort-header__signifier');
    expect(glyph()?.textContent?.trim()).toBe('↕');
    expect(glyph()?.classList.contains('sort-header__signifier--active')).toBe(false);

    host.signifier.set('F↑');
    fixture.detectChanges();

    expect(glyph()?.textContent?.trim()).toBe('F↑');
    // Norman § signifier — active has to look different from neutral.
    expect(glyph()?.classList.contains('sort-header__signifier--active')).toBe(true);
  });

  it('is a real button carrying the tooltip text as its accessible name', () => {
    const { fixture } = setup();

    // Enter and Space come free from the element; a <span> with a click
    // handler would have needed keydown bindings and an explicit role.
    expect(button(fixture).tagName).toBe('BUTTON');
    expect(button(fixture).getAttribute('aria-label')).toBe(
      'Sorted by first name (A → Z). Click to cycle.',
    );
  });

  it('emits one cycle per press', () => {
    const { fixture, host } = setup();

    button(fixture).click();
    button(fixture).click();

    expect(host.presses()).toBe(2);
  });

  it('right-aligns only when asked — a column of numbers is read down its last digit', () => {
    const { fixture, host } = setup();

    expect(button(fixture).classList.contains('sort-header__btn--end')).toBe(false);

    host.align.set('end');
    fixture.detectChanges();

    expect(button(fixture).classList.contains('sort-header__btn--end')).toBe(true);
  });
});
