import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { Academy, AcademyService } from '../../../../core/services/academy.service';
import { PaymentsSummary } from '../../../../core/services/stats.service';
import { PaymentsSummaryComponent } from './payments-summary.component';

const URL = '/api/v1/stats/payments/summary';

function summary(overrides: Partial<PaymentsSummary> = {}): PaymentsSummary {
  return {
    year: 2026,
    month: 9,
    currency: 'EUR',
    expected_cents: 84000,
    collected_cents: 69400,
    outstanding_count: 7,
    outstanding_cents: 49000,
    collection_rate: 0.826,
    estimated: false,
    ...overrides,
  };
}

/** An academy that charges a flat fee — the one case the tiles are for. */
const CHARGING = { id: 1, monthly_fee_cents: 7000, fee_tier_count: 0 } as unknown as Academy;
/** No flat fee, no tiers, no personal fees: nothing to expect or collect. */
const FREE = {
  id: 1,
  monthly_fee_cents: null,
  fee_tier_count: 0,
  fee_override_count: 0,
} as unknown as Academy;

/**
 * The four money tiles above the revenue chart (#1759).
 *
 * The one rule worth pinning hardest is that the rate is READ, never
 * computed: an academy expecting nothing sends `collection_rate: null`, and a
 * component dividing `collected / expected` itself would print `NaN%` or
 * `Infinity%` exactly there.
 */
describe('PaymentsSummaryComponent', () => {
  let fixture: ComponentFixture<PaymentsSummaryComponent>;
  let http: HttpTestingController;

  const text = (cy: string): string =>
    (fixture.nativeElement as HTMLElement)
      .querySelector(`[data-cy="${cy}"]`)
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';

  function render(academy: Academy | null, payload?: PaymentsSummary): void {
    TestBed.inject(AcademyService).academy.set(academy);
    fixture = TestBed.createComponent(PaymentsSummaryComponent);
    fixture.detectChanges();
    if (payload !== undefined) {
      http.expectOne(URL).flush({ data: payload });
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentsSummaryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for the current month and shows the four tiles, written as money', () => {
    render(CHARGING, summary());

    expect(text('summary-expected')).toContain('€840.00');
    expect(text('summary-collected')).toContain('€694.00');
    expect(text('summary-rate')).toContain('83%');
    expect(text('summary-outstanding')).toContain('7 athletes owe €490.00');
  });

  it('loads in the shape of the result, so nothing below jumps', () => {
    render(CHARGING);
    const root = fixture.nativeElement as HTMLElement;

    // The real tiles, labels and hint — static text that wraps the same way
    // loaded or not — with a skeleton only where each figure goes.
    const loading = root.querySelector('[data-cy="summary-loading"]');
    expect(loading?.querySelectorAll('.summary__tile').length).toBe(4);
    expect(loading?.querySelectorAll('p-skeleton').length).toBe(4);
    expect(text('summary-expected')).toContain('Expected this month');
    expect(text('summary-collected')).toContain('Collected');
    expect(text('summary-rate')).toContain('Collected of expected');
    expect(root.querySelector('.summary__hint')?.textContent).toContain('This month so far');

    http.expectOne(URL).flush({ data: summary() });
    fixture.detectChanges();

    expect(root.querySelector('[data-cy="summary-loading"]')).toBeNull();
    expect(root.querySelectorAll('p-skeleton').length).toBe(0);
  });

  it('prints the figures in the classes the accent guard watches', () => {
    // `accent-means-action.spec.ts` keeps `__number` / `__total` in ink; a
    // figure under another name would escape it.
    render(CHARGING, summary());
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.summary__number').length).toBe(3);
    expect(root.querySelectorAll('.summary__total').length).toBe(1);
  });

  it('reads the rate from the payload rather than dividing the two figures itself', () => {
    // Were the component to compute collected / expected it would print 100%.
    render(CHARGING, summary({ expected_cents: 5000, collected_cents: 5000 }));

    expect(text('summary-rate')).toContain('83%');
  });

  it('writes one athlete in the singular', () => {
    render(CHARGING, summary({ outstanding_count: 1, outstanding_cents: 7000 }));

    expect(text('summary-outstanding')).toContain('1 athlete owes €70.00');
  });

  it('shows a dash for the rate when nothing was expected, never NaN% or 0%', () => {
    render(CHARGING, summary({ expected_cents: 0, collected_cents: 0, collection_rate: null }));

    expect(text('summary-rate')).toContain('—');
    expect(text('summary-rate')).not.toMatch(/NaN|Infinity|0%/);
  });

  it('renders no tiles, and asks for nothing, for an academy that charges no fee', () => {
    render(FREE);

    http.expectNone(URL);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-cy="summary"]')).toBeNull();
  });

  it('renders nothing before the academy is known', () => {
    render(null);

    http.expectNone(URL);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-cy="summary"]')).toBeNull();
  });

  it('says so when the month cannot be read, and draws no figures', () => {
    render(CHARGING);
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text('summary-error')).toContain("This month's summary couldn't be loaded");
    expect(text('summary-collected')).toBe('');
  });
});
