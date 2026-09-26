import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import type { ArrearsRow } from '../../../../core/services/stats.service';
import { PaymentsArrearsComponent } from './payments-arrears.component';

const URL = '/api/v1/stats/payments/arrears';

function row(id: number, months: number, since: string, owed: number): ArrearsRow {
  return {
    athlete: {
      id,
      first_name: `Name${id}`,
      last_name: `Surname${id}`,
      belt: 'blue',
      stripes: 0,
      date_of_birth: null,
      photo_url: null,
      user_avatar_url: null,
    },
    months_behind: months,
    first_unpaid: since,
    owed_cents: owed,
  };
}

/**
 * Who is behind, since when, and by how much (#1760).
 *
 * The list answers the question the unpaid chip cannot — "since July" — so
 * what is pinned is that each row says how long and since when, in the
 * owner's language, and opens the athlete's payments.
 */
describe('PaymentsArrearsComponent', () => {
  let fixture: ComponentFixture<PaymentsArrearsComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentsArrearsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        ...provideI18nTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PaymentsArrearsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function load(rows: ArrearsRow[]): void {
    http.expectOne(URL).flush({ data: rows });
    fixture.detectChanges();
  }

  it('shows a skeleton while it reads', () => {
    expect(el().querySelector('[data-cy="arrears-loading"]')).toBeTruthy();
    load([]);
  });

  it('says so when nobody is behind', () => {
    load([]);

    expect(el().querySelector('[data-cy="arrears-empty"]')?.textContent).toContain(
      'Nobody is behind',
    );
    expect(el().querySelector('[data-cy="arrears-list"]')).toBeNull();
  });

  it('says how long, since when and how much, for each athlete', () => {
    load([row(1, 4, '2026-03', 22000), row(2, 1, '2026-08', 5500)]);

    const rows = el().querySelectorAll('[data-cy^="arrears-row-"]');
    expect(rows.length).toBe(2);

    const first = rows[0].textContent ?? '';
    expect(first).toContain('Name1');
    expect(first).toContain('4 months');
    expect(first).toContain('March 2026');
    expect(first).toContain('€220.00');

    // One month is "1 month", never "1 months".
    expect(rows[1].textContent).toContain('1 month');
    expect(rows[1].textContent).not.toContain('1 months');
  });

  it('adds up the estimate in the header', () => {
    load([row(1, 4, '2026-03', 22000), row(2, 1, '2026-08', 5500)]);

    expect(el().querySelector('[data-cy="arrears-total"]')?.textContent).toContain('€275.00');
  });

  it('opens the athlete on their payments', () => {
    load([row(7, 2, '2026-07', 11000)]);

    const link = el().querySelector('[data-cy="arrears-row-7"] a');
    expect(link?.getAttribute('href')).toBe('/dashboard/athletes/7/payments');
  });

  it('offers a retry when the read fails', () => {
    http.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el().querySelector('[data-cy="arrears-error"]')).toBeTruthy();
  });
});
