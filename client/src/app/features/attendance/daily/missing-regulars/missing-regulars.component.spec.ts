import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import type { ClassRegular, ClassRegulars } from '../../../../core/services/attendance.service';
import { MissingRegularsComponent } from './missing-regulars.component';

function regular(over: Partial<ClassRegular> & { id: number }): ClassRegular {
  return {
    first_name: 'Athlete',
    last_name: `N${over.id}`,
    belt: 'blue',
    stripes: 1,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    phone_country_code: '+39',
    phone_national_number: '3471234567',
    attended: 4,
    last_attended_on: null,
    ...over,
  };
}

function regulars(data: ClassRegular[], occurrences = 4): ClassRegulars {
  const dates = ['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19'].slice(0, occurrences);
  return { data, meta: { occurrences, occurrence_dates: dates } };
}

function render(
  value: ClassRegulars | null,
  present: ReadonlyMap<number, number> = new Map(),
  failed = false,
) {
  TestBed.configureTestingModule({
    imports: [MissingRegularsComponent],
    providers: [provideRouter([]), ...provideI18nTesting()],
  });
  const fixture = TestBed.createComponent(MissingRegularsComponent);
  fixture.componentRef.setInput('regulars', value);
  fixture.componentRef.setInput('present', present);
  fixture.componentRef.setInput('failed', failed);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root };
}

function text(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function open(fixture: ReturnType<typeof render>['fixture']): void {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>('[data-cy="missing-regulars-toggle"]')
    ?.click();
  fixture.detectChanges();
}

describe('MissingRegularsComponent (#1730)', () => {
  it('heads a folded panel with how many regulars are not here, not how many exist', () => {
    const { root } = render(
      regulars([regular({ id: 1 }), regular({ id: 2 }), regular({ id: 3 })]),
      new Map([[2, 900]]),
    );

    expect(text(root, '[data-cy="missing-regulars-count"]')).toBe('2 regulars missing');
    const toggle = root.querySelector('[data-cy="missing-regulars-toggle"]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    // Folded by default: the table above is what the screen is for.
    expect(root.querySelector('[data-cy="missing-regular-1"]')).toBeNull();
  });

  it('says one regular in the singular', () => {
    const { root } = render(regulars([regular({ id: 1 })]));

    expect(text(root, '[data-cy="missing-regulars-count"]')).toBe('1 regular missing');
  });

  it('opens on the rows: who, how often they come, when last seen, and how to reach them', () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const iso = `${lastWeek.getFullYear()}-${String(lastWeek.getMonth() + 1).padStart(2, '0')}-${String(lastWeek.getDate()).padStart(2, '0')}`;
    const { fixture, root } = render(
      regulars([regular({ id: 1, attended: 3, last_attended_on: iso })]),
    );

    open(fixture);

    expect(
      root.querySelector('[data-cy="missing-regulars-toggle"]')?.getAttribute('aria-expanded'),
    ).toBe('true');
    const row = root.querySelector('[data-cy="missing-regular-1"]');
    expect(row?.querySelector('app-athlete-identity')).not.toBeNull();
    expect(text(root, '[data-cy="missing-regular-1"] .missing__why')).toContain('3 of the last 4');
    expect(text(root, '[data-cy="missing-regular-1"] .missing__why')).toContain(
      'Last seen a week ago',
    );
    expect(root.querySelector('[data-cy="missing-contact-1-whatsapp"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="missing-contact-1-call"]')).not.toBeNull();
  });

  it('offers a disabled contact control for a regular with no number', () => {
    const { fixture, root } = render(
      regulars([regular({ id: 5, phone_country_code: null, phone_national_number: null })]),
    );

    open(fixture);

    expect(root.querySelector('[data-cy="missing-contact-5-none"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="missing-contact-5-call"]')).toBeNull();
  });

  it('drops a regular the moment they are ticked, with nothing asked of the server', () => {
    const { fixture, root } = render(regulars([regular({ id: 1 }), regular({ id: 2 })]));
    open(fixture);
    expect(root.querySelector('[data-cy="missing-regular-1"]')).not.toBeNull();

    // What the check-in does on a tap: a new present-map, optimistically.
    fixture.componentRef.setInput('present', new Map([[1, 501]]));
    fixture.detectChanges();

    expect(root.querySelector('[data-cy="missing-regular-1"]')).toBeNull();
    expect(text(root, '[data-cy="missing-regulars-count"]')).toBe('1 regular missing');
  });

  it('says everyone is here only when every regular is ticked', () => {
    const { root } = render(regulars([regular({ id: 1 })]), new Map([[1, 501]]));

    expect(text(root, '[data-cy="missing-regulars-all-here"]')).toContain(
      'Everyone who usually comes is here',
    );
    expect(root.querySelector('[data-cy="missing-regulars-toggle"]')).toBeNull();
  });

  it('never reads too little history as everyone being here', () => {
    // The regression worth a test: "we cannot tell yet" dressed as "all fine".
    const two = render(regulars([], 2)).root;
    expect(two.querySelector('[data-cy="missing-regulars-all-here"]')).toBeNull();
    expect(text(two, '[data-cy="missing-regulars-not-enough"]')).toContain(
      'Only 2 sessions of this class on record',
    );

    TestBed.resetTestingModule();
    const one = render(regulars([], 1)).root;
    expect(text(one, '[data-cy="missing-regulars-not-enough"]')).toContain(
      'Only 1 session of this class on record',
    );

    TestBed.resetTestingModule();
    const none = render(regulars([], 0)).root;
    expect(text(none, '[data-cy="missing-regulars-not-enough"]')).toContain(
      'No session of this class on record yet',
    );
  });

  it('reads an empty list over enough history as nobody being a regular yet — everyone is here', () => {
    // Four sessions and nobody at three of them: nobody is missing.
    const { root } = render(regulars([], 4));

    expect(root.querySelector('[data-cy="missing-regulars-all-here"]')).not.toBeNull();
  });

  it('renders nothing while the answer is on its way', () => {
    const { root } = render(null);

    expect(root.querySelector('[data-cy^="missing-regulars"]')).toBeNull();
  });

  it('says so when the answer failed, and offers to ask again', () => {
    const { fixture, root } = render(null, new Map(), true);
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    expect(text(root, '[data-cy="missing-regulars-error"]')).toContain(
      'Could not load who usually comes to this class.',
    );
    root.querySelector<HTMLButtonElement>('[data-cy="missing-regulars-retry"]')?.click();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
