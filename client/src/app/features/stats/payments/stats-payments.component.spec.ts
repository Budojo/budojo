import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsPaymentsComponent } from './stats-payments.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService } from '../../../core/services/language.service';

interface ChartOptions {
  readonly plugins: {
    readonly tooltip: { readonly callbacks: { label(c: { parsed: { y: number } }): string } };
  };
  readonly scales: { readonly y: { readonly ticks: { callback(v: number): string } } };
}

describe('StatsPaymentsComponent', () => {
  let fixture: ComponentFixture<StatsPaymentsComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPaymentsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsPaymentsComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The chart options are a computed now, because the formatter follows the language. */
  const componentOptions = (): ChartOptions =>
    (fixture.componentInstance as unknown as { chartOptions(): ChartOptions }).chartOptions();

  it('shows the loading skeleton while fetching', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-loading"]')).toBeTruthy();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({ data: [] });
  });

  it('shows the empty state when no buckets are returned', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({ data: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-empty"]')).toBeTruthy();
  });

  it('renders the chart when data is populated', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [
        { month: '2026-04', currency: 'EUR', amount_cents: 30000, future: false },
        { month: '2026-05', currency: 'EUR', amount_cents: 50000, future: false },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-chart"]')).toBeTruthy();
  });

  it('writes the bars as money, which the chart never used to say (#1549)', () => {
    // Hovering a bar gave `17.61`, and the chart never said seventeen of what.
    // The currency was computed from the first release and never rendered.
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [{ month: '2026-09', currency: 'EUR', amount_cents: 1761, future: false }],
    });
    fixture.detectChanges();

    const options = componentOptions();
    expect(options.plugins.tooltip.callbacks.label({ parsed: { y: 17.61 } })).toBe('€17.61');
    // The axis speaks the same language as the tooltip — a bare `18` beside a
    // `€17.61` would be the same defect one line down.
    expect(options.scales.y.ticks.callback(2560)).toBe('€2,560.00');
  });

  it('follows the language for the symbol side and the separators', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [{ month: '2026-09', currency: 'EUR', amount_cents: 256000, future: false }],
    });
    fixture.detectChanges();

    TestBed.inject(LanguageService).setLanguage('it');
    fixture.detectChanges();

    // Italian puts the symbol LAST and uses a comma for the decimals — the
    // reason this goes through `Intl` rather than a hand-rolled `€` prefix.
    //
    // Asserted as properties rather than one exact string: the thousands
    // separator is the ICU build's call (this one omits it for `it-IT`), and
    // pinning it would make the test a statement about Node rather than about
    // the component.
    const italian = componentOptions().plugins.tooltip.callbacks.label({ parsed: { y: 2560 } });
    expect(italian.endsWith('€')).toBe(true);
    expect(italian).toContain(',00');
    expect(italian.startsWith('€')).toBe(false);
  });

  it('draws the months already paid for, past today, as lighter bars (#1553)', () => {
    // The window reaches forward to the last month a fee covers, so a
    // quarterly bought this month puts two bars to the right of today. They
    // are the same series — money the academy already has — but they are not
    // earned yet, and a bar for November drawn in September at full strength
    // would read as revenue that has happened.
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [
        { month: '2026-09', currency: 'EUR', amount_cents: 8000, future: false },
        { month: '2026-10', currency: 'EUR', amount_cents: 8000, future: true },
        { month: '2026-11', currency: 'EUR', amount_cents: 8000, future: true },
      ],
    });
    fixture.detectChanges();

    const data = (
      fixture.componentInstance as unknown as {
        chartData(): { datasets: { backgroundColor: string[] }[] };
      }
    ).chartData();

    expect(data.datasets[0].backgroundColor).toEqual(['#5b6cff', '#5b6cff55', '#5b6cff55']);
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-error"]')).toBeTruthy();
  });
});
