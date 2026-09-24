import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { HowCountedComponent } from './how-counted.component';

@Component({
  imports: [HowCountedComponent],
  template: `<app-how-counted dataCy="the-method">
    <p data-cy="method-text">Counts days, not presences.</p>
  </app-how-counted>`,
})
class HostComponent {}

describe('HowCountedComponent (#1853)', () => {
  function render() {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [...provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('folds the method behind a question the owner opens when they wonder', () => {
    const root = render();
    const details = root.querySelector('details[data-cy="the-method"]') as HTMLDetailsElement;

    // Closed at rest: the one-line meaning above it is what the page says.
    expect(details.open).toBe(false);
    // A native <details>: its <summary> is the accessible name and the
    // keyboard control, so it is written as a question.
    expect(details.querySelector('summary')?.textContent?.trim()).toBe('How is this counted?');
  });

  it('carries whatever the page projects as the method', () => {
    const root = render();
    expect(
      root.querySelector('[data-cy="the-method"] [data-cy="method-text"]')?.textContent,
    ).toContain('Counts days, not presences.');
  });
});
