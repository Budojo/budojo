import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsPaymentsComponent } from './stats-payments.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

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
        { month: '2026-04', currency: 'EUR', amount_cents: 30000 },
        { month: '2026-05', currency: 'EUR', amount_cents: 50000 },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-chart"]')).toBeTruthy();
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-error"]')).toBeTruthy();
  });
});
