import { TestBed } from '@angular/core/testing';
import { ErrorStateComponent } from './error-state.component';

describe('ErrorStateComponent (#1037)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ErrorStateComponent] });
  });

  function mount(inputs: {
    title?: string;
    hint?: string | null;
    retryLabel?: string | null;
    dataCy?: string | null;
  }) {
    const fixture = TestBed.createComponent(ErrorStateComponent);
    fixture.componentRef.setInput('title', inputs.title ?? 'Could not load');
    if (inputs.hint !== undefined) fixture.componentRef.setInput('hint', inputs.hint);
    if (inputs.retryLabel !== undefined)
      fixture.componentRef.setInput('retryLabel', inputs.retryLabel);
    if (inputs.dataCy !== undefined) fixture.componentRef.setInput('dataCy', inputs.dataCy);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the required title + canonical warning icon', () => {
    const fixture = mount({ title: 'Could not load athletes' });
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.error-state__title')?.textContent?.trim()).toBe(
      'Could not load athletes',
    );
    const icon = root.querySelector('.error-state__icon');
    expect(icon?.className).toContain('pi-exclamation-triangle');
  });

  it('sets role="alert" on the root so screen readers announce the error immediately', () => {
    const fixture = mount({ title: 'Could not load' });
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders the hint when supplied', () => {
    const fixture = mount({ title: 'Boom', hint: 'Refresh the page to try again.' });
    expect(fixture.nativeElement.querySelector('.error-state__hint')?.textContent?.trim()).toBe(
      'Refresh the page to try again.',
    );
  });

  it('omits the hint when not supplied', () => {
    const fixture = mount({ title: 'Boom' });
    expect(fixture.nativeElement.querySelector('.error-state__hint')).toBeNull();
  });

  it('renders the retry CTA only when retryLabel is supplied', () => {
    const fixtureWith = mount({ title: 'Boom', retryLabel: 'Try again' });
    expect(fixtureWith.nativeElement.querySelector('p-button')).not.toBeNull();

    const fixtureWithout = mount({ title: 'Boom' });
    expect(fixtureWithout.nativeElement.querySelector('p-button')).toBeNull();
  });

  it('forwards data-cy to the root and suffixes the retry CTA', () => {
    const fixture = mount({
      title: 'Boom',
      retryLabel: 'Try again',
      dataCy: 'athletes-error',
    });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[data-cy="athletes-error"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="athletes-error-retry"]')).not.toBeNull();
  });

  it('emits retry when the user activates the retry CTA', () => {
    const fixture = mount({ title: 'Boom', retryLabel: 'Try again' });
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);

    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;
    btn?.click();

    expect(retries).toBe(1);
  });
});
