import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AcademyService, Academy } from '../../../core/services/academy.service';
import { Athlete } from '../../../core/services/athlete.service';
import { UnpaidThisMonthWidgetComponent } from './unpaid-this-month-widget.component';

function makeAcademy(monthly_fee_cents: number | null): Academy {
  return {
    id: 1,
    name: 'Test Academy',
    slug: 'test-academy',
    address: null,
    logo_url: null,
    monthly_fee_cents,
    training_days: null,
  };
}

function makeAthlete(id: number): Athlete {
  return {
    id,
    first_name: `First${id}`,
    last_name: `Last${id}`,
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: null,
    belt: 'white',
    stripes: 0,
    status: 'active',
    joined_at: '2024-09-01',
    created_at: '2024-09-01T10:00:00+00:00',
  } as Athlete;
}

function setup(opts: { monthlyFee: number | null; date: Date }): {
  fixture: ReturnType<typeof TestBed.createComponent<UnpaidThisMonthWidgetComponent>>;
  httpMock: HttpTestingController;
} {
  const academyStub: Partial<AcademyService> = {
    academy: signal<Academy | null>(makeAcademy(opts.monthlyFee)) as never,
  };

  TestBed.configureTestingModule({
    imports: [UnpaidThisMonthWidgetComponent],
    providers: [
      { provide: AcademyService, useValue: academyStub },
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });

  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(UnpaidThisMonthWidgetComponent);

  // Override the date provider so the chasing-threshold gate is
  // deterministic without patching the global Date.
  const cmp = fixture.componentInstance as unknown as {
    now: { set: (fn: () => Date) => void };
  };
  cmp.now.set(() => opts.date);

  return { fixture, httpMock };
}

describe('UnpaidThisMonthWidgetComponent (#283)', () => {
  afterEach(() => {
    // Verify no unexpected / unflushed HTTP requests after each test.
    // Repo convention — keeps the suite honest as the component evolves.
    TestBed.inject(HttpTestingController).verify();
  });

  describe('visibility gates', () => {
    it('renders nothing when the academy has no monthly_fee_cents', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: null,
        date: new Date(Date.UTC(2026, 4, 20)), // 20 May 2026 — past threshold
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="unpaid-widget"]')).toBeNull();
      // No fetch fired — gate short-circuits before HTTP.
      httpMock.expectNone('/api/v1/athletes?paid=no');
    });

    it('renders nothing before the 16th of the month even with a fee set', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 15)), // 15 May 2026 — strictly BEFORE threshold
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="unpaid-widget"]')).toBeNull();
      httpMock.expectNone('/api/v1/athletes?paid=no');
    });

    it('renders + fetches on the 16th (boundary inclusive)', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 16)),
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="unpaid-widget"]')).not.toBeNull();

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('paid') === 'no',
      );
      req.flush({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } });
    });
  });

  describe('happy path (fee set + past threshold)', () => {
    it('shows the count + top 5 athlete names + a "View all" CTA when count > 5', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 20)),
      });
      fixture.detectChanges();

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('paid') === 'no',
      );
      req.flush({
        data: [1, 2, 3, 4, 5, 6, 7].map(makeAthlete),
        meta: { current_page: 1, last_page: 1, total: 7, per_page: 20 },
      });
      fixture.detectChanges();

      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('[data-cy="unpaid-widget-count"]')?.textContent?.trim()).toContain(
        '7',
      );
      expect(root.querySelector('[data-cy="unpaid-widget-count"]')?.textContent).toContain(
        'athletes still owe',
      );

      // Top 5 rendered (NOT all 7).
      expect(root.querySelectorAll('[data-cy^="unpaid-widget-row-"]').length).toBe(5);

      // CTA reflects the truncation: "View all 7 →".
      const cta = root.querySelector('[data-cy="unpaid-widget-cta"]');
      expect(cta?.textContent?.trim()).toMatch(/View all 7/);
    });

    it('renders an empty-state headline when count is 0', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 20)),
      });
      fixture.detectChanges();

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('paid') === 'no',
      );
      req.flush({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } });
      fixture.detectChanges();

      const title = fixture.nativeElement.querySelector('.unpaid-widget__title');
      expect(title?.textContent).toContain('Everyone paid');
      // No CTA when there's no list to view.
      expect(fixture.nativeElement.querySelector('[data-cy="unpaid-widget-cta"]')).toBeNull();
    });

    it('singularises the headline when count is 1', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 20)),
      });
      fixture.detectChanges();

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('paid') === 'no',
      );
      req.flush({
        data: [makeAthlete(1)],
        meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 },
      });
      fixture.detectChanges();

      const count = fixture.nativeElement.querySelector('[data-cy="unpaid-widget-count"]');
      expect(count?.textContent).toContain('athlete still owes'); // singular
      expect(count?.textContent).not.toContain('athletes still owe'); // not plural
    });

    it('falls back to the muted error tile if the fetch fails', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 20)),
      });
      fixture.detectChanges();

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('paid') === 'no',
      );
      req.flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="unpaid-widget-error"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="unpaid-widget"]')).not.toBeNull();
    });

    it('each name row links to the per-athlete payments tab', () => {
      const { fixture, httpMock } = setup({
        monthlyFee: 5000,
        date: new Date(Date.UTC(2026, 4, 20)),
      });
      fixture.detectChanges();

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('paid') === 'no',
      );
      req.flush({
        data: [makeAthlete(42)],
        meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 },
      });
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector(
        '[data-cy="unpaid-widget-row-42"] a',
      ) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/dashboard/athletes/42/payments');
    });
  });
});
