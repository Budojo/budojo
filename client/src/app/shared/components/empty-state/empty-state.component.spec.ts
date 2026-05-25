import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent (#1036)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [EmptyStateComponent] });
  });

  function mount(inputs: {
    title?: string;
    icon?: string;
    hint?: string | null;
    ctaLabel?: string | null;
    dataCy?: string | null;
  }) {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', inputs.title ?? 'No rows yet');
    if (inputs.icon !== undefined) fixture.componentRef.setInput('icon', inputs.icon);
    if (inputs.hint !== undefined) fixture.componentRef.setInput('hint', inputs.hint);
    if (inputs.ctaLabel !== undefined) fixture.componentRef.setInput('ctaLabel', inputs.ctaLabel);
    if (inputs.dataCy !== undefined) fixture.componentRef.setInput('dataCy', inputs.dataCy);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the required title and the default inbox icon', () => {
    const fixture = mount({ title: 'No athletes yet' });
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.empty-state__title')?.textContent?.trim()).toBe('No athletes yet');
    const icon = root.querySelector('.empty-state__icon');
    expect(icon?.className).toContain('pi-inbox');
  });

  it('renders the supplied icon when provided', () => {
    const fixture = mount({ title: 'No athletes', icon: 'pi pi-users' });
    expect(fixture.nativeElement.querySelector('.empty-state__icon')?.className).toContain(
      'pi-users',
    );
  });

  it('renders the hint sub-line when supplied', () => {
    const fixture = mount({ title: 'No rows', hint: 'Add your first row to get started.' });
    expect(fixture.nativeElement.querySelector('.empty-state__hint')?.textContent?.trim()).toBe(
      'Add your first row to get started.',
    );
  });

  it('omits the hint when not supplied', () => {
    const fixture = mount({ title: 'No rows' });
    expect(fixture.nativeElement.querySelector('.empty-state__hint')).toBeNull();
  });

  it('renders the CTA button when ctaLabel is supplied', () => {
    const fixture = mount({ title: 'No rows', ctaLabel: 'Add first' });
    expect(fixture.nativeElement.querySelector('p-button')).not.toBeNull();
  });

  it('omits the CTA button when ctaLabel is null', () => {
    const fixture = mount({ title: 'No rows' });
    expect(fixture.nativeElement.querySelector('p-button')).toBeNull();
  });

  it('forwards data-cy to the root element AND suffixes the CTA when present', () => {
    const fixture = mount({
      title: 'No athletes',
      ctaLabel: 'Add first',
      dataCy: 'athletes-empty',
    });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[data-cy="athletes-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="athletes-empty-cta"]')).not.toBeNull();
  });

  it('emits ctaClick when the user activates the CTA', () => {
    const fixture = mount({ title: 'No rows', ctaLabel: 'Add first' });
    let clicks = 0;
    fixture.componentInstance.ctaClick.subscribe(() => clicks++);

    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;
    btn?.click();

    expect(clicks).toBe(1);
  });
});
