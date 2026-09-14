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
    headingLevel?: 1 | 2 | 3 | 4;
    ctaSeverity?: 'primary' | 'secondary';
    secondaryLabel?: string | null;
  }) {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', inputs.title ?? 'No rows yet');
    if (inputs.icon !== undefined) fixture.componentRef.setInput('icon', inputs.icon);
    if (inputs.hint !== undefined) fixture.componentRef.setInput('hint', inputs.hint);
    if (inputs.ctaLabel !== undefined) fixture.componentRef.setInput('ctaLabel', inputs.ctaLabel);
    if (inputs.dataCy !== undefined) fixture.componentRef.setInput('dataCy', inputs.dataCy);
    if (inputs.headingLevel !== undefined)
      fixture.componentRef.setInput('headingLevel', inputs.headingLevel);
    if (inputs.ctaSeverity !== undefined)
      fixture.componentRef.setInput('ctaSeverity', inputs.ctaSeverity);
    if (inputs.secondaryLabel !== undefined)
      fixture.componentRef.setInput('secondaryLabel', inputs.secondaryLabel);
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

  it('renders the title as an h2 by default (#1042 reviewer)', () => {
    const fixture = mount({ title: 'No rows' });
    expect(fixture.nativeElement.querySelector('h2.empty-state__title')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('h1.empty-state__title')).toBeNull();
    expect(fixture.nativeElement.querySelector('h3.empty-state__title')).toBeNull();
  });

  it('honours headingLevel=1 / 3 / 4 overrides (#1042 reviewer)', () => {
    for (const level of [1, 3, 4] as const) {
      const fixture = mount({ title: 'No rows', headingLevel: level });
      expect(fixture.nativeElement.querySelector(`h${level}.empty-state__title`)).not.toBeNull();
    }
  });

  it('emits ctaClick when the user activates the CTA', () => {
    const fixture = mount({ title: 'No rows', ctaLabel: 'Add first' });
    let clicks = 0;
    fixture.componentInstance.ctaClick.subscribe(() => clicks++);

    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;
    btn?.click();

    expect(clicks).toBe(1);
  });

  // #1618: an empty state whose CTA undoes something (clear the filters) must
  // not look like the page's main action, and a first-run empty state can
  // offer two ways in.
  it('renders the CTA outlined when ctaSeverity is secondary', () => {
    const fixture = mount({ ctaLabel: 'Clear filters', ctaSeverity: 'secondary', dataCy: 'x' });
    const button = fixture.nativeElement.querySelector('[data-cy="x-cta"] button');
    expect(button?.className).toContain('p-button-outlined');
  });

  it('omits the secondary action by default', () => {
    const fixture = mount({ ctaLabel: 'Add', dataCy: 'x' });
    expect(fixture.nativeElement.querySelector('[data-cy="x-secondary"]')).toBeNull();
  });

  it('renders the secondary action beside the CTA and emits when activated', () => {
    const fixture = mount({ ctaLabel: 'Add', secondaryLabel: 'Import', dataCy: 'x' });
    const emitted: string[] = [];
    fixture.componentInstance.secondaryClick.subscribe(() => emitted.push('secondary'));
    const button = fixture.nativeElement.querySelector(
      '[data-cy="x-secondary"] button',
    ) as HTMLButtonElement | null;
    expect(button?.textContent).toContain('Import');
    button?.click();
    expect(emitted).toEqual(['secondary']);
  });
});
