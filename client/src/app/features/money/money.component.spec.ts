import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { Athlete } from '../../core/services/athlete.service';
import { MoneyComponent } from './money.component';

const athlete = (id: number, first_name: string, over: Partial<Athlete> = {}): Athlete =>
  ({
    id,
    first_name,
    last_name: 'Rossi',
    belt: 'white',
    stripes: 0,
    status: 'active',
    is_self: false,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    monthly_fee_cents: 6000,
    billing_period_months: 1,
    billing_floor: '2025-01-01',
    payment_coverage: 'none',
    paid_current_month: false,
    active_carnet: null,
    ...over,
  }) as Athlete;

const ANNA = athlete(1, 'Anna');
const BRUNO = athlete(2, 'Bruno');
const CARLA = athlete(3, 'Carla', { payment_coverage: 'monthly' });

function setup() {
  TestBed.configureTestingModule({
    imports: [MoneyComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(MoneyComponent);
  fixture.detectChanges();
  return { fixture, http, root: fixture.nativeElement as HTMLElement };
}

function answer(
  http: HttpTestingController,
  roster: Athlete[],
  behind: { id: number; months: string[] }[],
  present: number[],
): void {
  http
    .expectOne(
      (r) =>
        r.url.endsWith('/api/v1/athletes') &&
        r.params.get('sort_by') === 'last_name' &&
        r.params.get('sort_order') === 'asc',
    )
    .flush({
      data: roster,
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 200, to: 3, total: 3 },
    });
  http
    .expectOne((r) => r.url.endsWith('/api/v1/attendance'))
    .flush({
      data: present.map((id, i) => ({ id: 100 + i, athlete_id: id, attended_on: '2026-10-06' })),
    });
  http
    .expectOne((r) => r.url.endsWith('/stats/payments/arrears'))
    .flush({
      data: behind.map((row) => ({
        athlete: { id: row.id, first_name: 'A', last_name: 'B' },
        months_behind: row.months.length,
        first_unpaid: row.months[0],
        unpaid_months: row.months,
        owed_cents: 6000 * row.months.length,
      })),
    });
}

const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('MoneyComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 19, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it("lists who still has to pay, tonight's people first, with the months behind", () => {
    const { fixture, http, root } = setup();
    expect(root.querySelector('[data-cy="money-loading"]')).not.toBeNull();

    answer(http, [ANNA, BRUNO, CARLA], [{ id: 1, months: ['2026-07', '2026-08'] }], [2]);
    fixture.detectChanges();

    const groups = Array.from(root.querySelectorAll('[data-cy^="money-group-"]'));
    expect(groups.map((g) => g.getAttribute('data-cy'))).toEqual([
      'money-group-tonight',
      'money-group-others',
    ]);
    expect(text(groups[0].querySelector('h2'))).toBe('On the mat tonight');
    expect(groups[0].querySelector('[data-cy="money-row-2"]')).not.toBeNull();
    expect(text(root.querySelector('[data-cy="money-row-1"] .money-row__lead'))).toBe('October');
    expect(text(root.querySelector('[data-cy="money-row-1"] .money-row__also'))).toBe(
      'also July and August',
    );
    // Carla's month is paid: no row.
    expect(root.querySelector('[data-cy="money-row-3"]')).toBeNull();
  });

  it('shows one list without headings when nobody is on the mat', () => {
    const { fixture, http, root } = setup();
    answer(http, [ANNA, BRUNO], [], []);
    fixture.detectChanges();

    expect(root.querySelectorAll('[data-cy^="money-row-"]')).toHaveLength(2);
    expect(root.querySelector('[data-cy^="money-group-"] h2')).toBeNull();
  });

  it('says everyone is paid up when nobody owes', () => {
    const { fixture, http, root } = setup();
    answer(http, [CARLA], [], []);
    fixture.detectChanges();

    expect(text(root.querySelector('[data-cy="money-empty"]'))).toContain('Everyone is paid up');
  });

  it('offers a retry when the roster does not load', () => {
    const { fixture, http, root } = setup();
    http
      .expectOne((r) => r.url.endsWith('/api/v1/athletes'))
      .flush('', { status: 500, statusText: 'x' });
    http.expectOne((r) => r.url.endsWith('/api/v1/attendance')).flush({ data: [] });
    http.expectOne((r) => r.url.endsWith('/stats/payments/arrears')).flush({ data: [] });
    fixture.detectChanges();

    expect(root.querySelector('[data-cy="money-error"]')).not.toBeNull();
  });

  it('offers a retry, never «paid up», when the arrears list does not load', () => {
    const { fixture, http, root } = setup();
    http
      .expectOne((r) => r.url.endsWith('/api/v1/athletes'))
      .flush({
        data: [athlete(4, 'Dario', { payment_coverage: 'monthly' })],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 200, to: 1, total: 1 },
      });
    http.expectOne((r) => r.url.endsWith('/api/v1/attendance')).flush({ data: [] });
    http
      .expectOne((r) => r.url.endsWith('/stats/payments/arrears'))
      .flush('', { status: 500, statusText: 'x' });
    fixture.detectChanges();

    expect(root.querySelector('[data-cy="money-empty"]')).toBeNull();
    expect(root.querySelector('[data-cy="money-error"]')).not.toBeNull();
  });

  it('opens the payment sheet on a row, at the oldest month owed', () => {
    const { fixture, http, root } = setup();
    answer(http, [ANNA], [{ id: 1, months: ['2026-08'] }], []);
    fixture.detectChanges();

    (root.querySelector('[data-cy="money-row-1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.endsWith('/athletes/1/payments'))
      .flush({ data: [], overdue_months: ['2026-08'] });
    fixture.detectChanges();

    const picked = document.body.querySelector<HTMLInputElement>(
      '[data-cy="pay-sheet-month-2026-08"] input',
    );
    expect(picked?.checked).toBe(true);
  });
});
