import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Athlete } from '../../../../core/services/athlete.service';
import { AthletePayment } from '../../../../core/services/payment.service';
import { MatMoney } from './mat-money';

const ARREARS = '/api/v1/stats/payments/arrears';

const athlete = (over: Partial<Athlete> = {}): Athlete =>
  ({
    id: 7,
    first_name: 'Anna',
    last_name: 'Bianchi',
    belt: 'white',
    stripes: 0,
    status: 'active',
    is_self: false,
    monthly_fee_cents: 5500,
    billing_period_months: 1,
    billing_floor: '2025-01-01',
    payment_coverage: 'none',
    paid_current_month: false,
    ...over,
  }) as Athlete;

const payment = (over: Partial<AthletePayment> = {}): AthletePayment => ({
  id: 90,
  athlete_id: 7,
  year: 2026,
  month: 8,
  period_months: 1,
  amount_cents: 5500,
  paid_at: '2026-10-03',
  payment_method: 'cash',
  ...over,
});

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), MatMoney],
  });
  return {
    money: TestBed.inject(MatMoney),
    http: TestBed.inject(HttpTestingController),
  };
}

function behind(http: HttpTestingController, rows: { id: number; months: string[] }[]): void {
  http
    .expectOne((r) => r.url.endsWith(ARREARS))
    .flush({
      data: rows.map((row) => ({
        athlete: { id: row.id, first_name: 'A', last_name: 'B' },
        months_behind: row.months.length,
        first_unpaid: row.months[0],
        unpaid_months: row.months,
        owed_cents: 5500 * row.months.length,
      })),
    });
}

describe('MatMoney', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 19, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows no chip until the arrears list answers', () => {
    const { money, http } = setup();
    money.load();
    expect(money.chipFor(athlete())).toBeNull();
    behind(http, [{ id: 7, months: ['2026-08'] }]);
    expect(money.chipFor(athlete())).toEqual({ kind: 'due', month: '2026-08' });
  });

  it("still shows this month's state when the arrears list fails", () => {
    const { money, http } = setup();
    money.load();
    http.expectOne((r) => r.url.endsWith(ARREARS)).flush('', { status: 500, statusText: 'x' });
    expect(money.chipFor(athlete())).toEqual({ kind: 'due', month: '2026-10' });
    // «Soldi» cannot list who is behind without it, and has to say so.
    expect(money.failed()).toBe(true);

    money.load();
    expect(money.failed()).toBe(false);
    behind(http, []);
  });

  it('knows every month behind from the arrears list alone', () => {
    const { money, http } = setup();
    money.load();
    behind(http, [{ id: 7, months: ['2026-07', '2026-08'] }]);

    // Paid here for July: August is next, with no request for the months.
    money.record(athlete(), '2026-07', 'cash').subscribe();
    http.expectOne((r) => r.method === 'POST').flush({ data: payment({ month: 7 }) });
    expect(money.chipFor(athlete())).toEqual({ kind: 'due', month: '2026-08' });
  });

  it("lists who still has to pay, tonight's people first", () => {
    const { money, http } = setup();
    const anna = athlete();
    const bruno = athlete({ id: 8, first_name: 'Bruno' });
    const carla = athlete({ id: 9, first_name: 'Carla', payment_coverage: 'monthly' });
    expect(money.whoOwes([anna, bruno, carla], new Set([8]))).toBeNull();

    money.load();
    behind(http, [{ id: 7, months: ['2026-08'] }]);

    const rows = money.whoOwes([anna, bruno, carla], new Set([8]));
    expect(rows?.tonight.map((row) => row.athlete.id)).toEqual([8]);
    expect(rows?.others.map((row) => [row.athlete.id, row.lead, row.also])).toEqual([
      [7, '2026-10', ['2026-08']],
    ]);
  });

  it('asks every year from the first month behind, and adds this month', () => {
    const { money, http } = setup();
    money.load();
    behind(http, [{ id: 7, months: ['2025-12'] }]);

    let owed: string[] = [];
    money.owedFor(athlete()).subscribe((months) => (owed = months));
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments') && r.params.get('year') === '2025')
      .flush({ data: [], overdue_months: ['2025-12'] });
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments') && r.params.get('year') === '2026')
      .flush({ data: [], overdue_months: ['2026-08', '2026-09'] });

    expect(owed).toEqual(['2025-12', '2026-08', '2026-09', '2026-10']);
  });

  it('offers a quarterly payer one quarter for the months behind', () => {
    const { money, http } = setup();
    money.load();
    behind(http, [{ id: 7, months: ['2026-08'] }]);

    let owed: string[] = [];
    money.owedFor(athlete({ billing_period_months: 3 })).subscribe((months) => (owed = months));
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08', '2026-09'] });

    // August to October settles all three: August, September and this month.
    expect(owed).toEqual(['2026-08']);
  });

  it('asks nothing for someone not behind', () => {
    const { money, http } = setup();
    money.load();
    behind(http, []);

    let owed: string[] = [];
    money.owedFor(athlete()).subscribe((months) => (owed = months));
    expect(owed).toEqual(['2026-10']);
  });

  it("records a quarterly payer's period, and the chip moves past it", () => {
    const { money, http } = setup();
    const quarterly = athlete({ billing_period_months: 3 });
    money.load();
    behind(http, [{ id: 7, months: ['2026-08'] }]);

    money.owedFor(quarterly).subscribe();
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08', '2026-09'] });

    money.record(quarterly, '2026-08', 'cash').subscribe();
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).toEqual({
      year: 2026,
      month: 8,
      period_months: 3,
      payment_method: 'cash',
    });
    post.flush({ data: payment({ period_months: 3, amount_cents: 16500 }) });

    expect(money.chipFor(quarterly)).toEqual({ kind: 'covered' });
  });

  it('puts the month back on an undo', () => {
    const { money, http } = setup();
    money.load();
    behind(http, []);

    money.record(athlete(), '2026-10', 'pos').subscribe();
    http.expectOne((r) => r.method === 'POST').flush({ data: payment({ month: 10 }) });
    expect(money.chipFor(athlete())).toEqual({ kind: 'covered' });

    money.undo(athlete(), payment({ month: 10 })).subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/athletes/7/payments/2026/10'))
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(money.chipFor(athlete())).toEqual({ kind: 'due', month: '2026-10' });
  });

  it('prices one payment as the fee times the period', () => {
    const { money } = setup();
    expect(money.amountOf(athlete({ billing_period_months: 3 }))).toBe(16500);
    expect(money.amountOf(athlete({ billing_period_months: undefined }))).toBe(5500);
  });
});
