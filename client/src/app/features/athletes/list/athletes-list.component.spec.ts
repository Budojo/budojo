import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import type { Mock } from 'vitest';
import { AthletesListComponent } from './athletes-list.component';
import { AcademyService } from '../../../core/services/academy.service';
import { AthleteService, type Athlete } from '../../../core/services/athlete.service';
import { PaymentService } from '../../../core/services/payment.service';

class FakeAthleteService {
  readonly list = vi.fn(() =>
    of({ data: [], meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 } }),
  );
  readonly delete = vi.fn(() => of(void 0));
}

class FakePaymentService {
  readonly markPaid = vi.fn(() =>
    of({
      id: 1,
      athlete_id: 42,
      year: 2026,
      month: 4,
      amount_cents: 9500,
      paid_at: '2026-04-30T08:00:00Z',
    }),
  );
  readonly unmarkPaid = vi.fn(() => of(void 0));
}

const ACADEMY_BASE = {
  id: 1,
  name: 'Test',
  slug: 'test',
  address: null,
  logo_url: null,
} as const;

describe('AthletesListComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
      ],
    });
  });

  describe('Full name 4-state sort cycle (#196)', () => {
    // The synthetic Full name column cycles four states on click:
    // first asc → first desc → last asc → last desc → (loops back to first asc).
    // Coming in from any other state (null, belt, created_at, last desc)
    // restarts at first asc — the most common starting expectation
    // ("alphabetical by first name").

    it('starts the cycle at first_name asc when the sort is initially neutral', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleFullNameSort();
      expect(component.sortField()).toBe('first_name');
      expect(component.sortOrder()).toBe('asc');
    });

    it('cycles first asc → first desc → last asc → last desc → first asc', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleFullNameSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['first_name', 'asc']);

      component.cycleFullNameSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['first_name', 'desc']);

      component.cycleFullNameSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['last_name', 'asc']);

      component.cycleFullNameSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['last_name', 'desc']);

      // Loops back to the first state.
      component.cycleFullNameSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['first_name', 'asc']);
    });

    it('restarts the cycle at first asc when the active sort is on a non-name column', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleBeltSort();
      expect(component.sortField()).toBe('belt');

      component.cycleFullNameSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['first_name', 'asc']);
    });

    it('renders a compact F↑/F↓/L↑/L↓ signifier in the active sort state', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Neutral state — no name signifier.
      expect(component.fullNameSortLabel()).toBeNull();

      component.cycleFullNameSort();
      expect(component.fullNameSortLabel()).toBe('F↑');

      component.cycleFullNameSort();
      expect(component.fullNameSortLabel()).toBe('F↓');

      component.cycleFullNameSort();
      expect(component.fullNameSortLabel()).toBe('L↑');

      component.cycleFullNameSort();
      expect(component.fullNameSortLabel()).toBe('L↓');
    });

    it('forwards the chosen primary name + direction to the backend filter', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      listSpy.mockClear();
      component.cycleFullNameSort(); // first asc
      expect(listSpy.mock.calls[0][0].sortBy).toBe('first_name');
      expect(listSpy.mock.calls[0][0].sortOrder).toBe('asc');

      listSpy.mockClear();
      component.cycleFullNameSort(); // first desc
      expect(listSpy.mock.calls[0][0].sortBy).toBe('first_name');
      expect(listSpy.mock.calls[0][0].sortOrder).toBe('desc');

      listSpy.mockClear();
      component.cycleFullNameSort(); // last asc
      expect(listSpy.mock.calls[0][0].sortBy).toBe('last_name');
      expect(listSpy.mock.calls[0][0].sortOrder).toBe('asc');
    });
  });

  describe('Belt 2-state sort cycle (#210)', () => {
    // The Belt header has its own custom click handler (replacing the
    // dropped pSortableColumn + p-sortIcon pair, see #205 / #210). The
    // cycle is simpler than Full-name's 4-state — just asc / desc on
    // the belt rank, since there's no first-vs-last lead to choose.

    it('starts at belt asc when the sort is initially neutral', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleBeltSort();
      expect(component.sortField()).toBe('belt');
      expect(component.sortOrder()).toBe('asc');
    });

    it('flips asc → desc → asc on subsequent clicks of the same column', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleBeltSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'asc']);

      component.cycleBeltSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'desc']);

      component.cycleBeltSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'asc']);
    });

    it('restarts at asc when the active sort is on a different column', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleFullNameSort(); // first_name asc
      component.cycleFullNameSort(); // first_name desc
      expect([component.sortField(), component.sortOrder()]).toEqual(['first_name', 'desc']);

      component.cycleBeltSort();
      // Coming in from a non-belt sort → back to asc, not flipped to desc.
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'asc']);
    });

    it('renders the signifier as ↑/↓ when active and ↕ when inactive', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Neutral.
      expect(component.beltSortLabel()).toBe('↕');

      component.cycleBeltSort();
      expect(component.beltSortLabel()).toBe('↑');

      component.cycleBeltSort();
      expect(component.beltSortLabel()).toBe('↓');

      // Move to a different column — Belt signifier returns to neutral.
      component.cycleFullNameSort();
      expect(component.beltSortLabel()).toBe('↕');
    });

    it('forwards sort_by=belt + sort_order to the backend filter', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      listSpy.mockClear();
      component.cycleBeltSort();
      expect(listSpy.mock.calls[0][0].sortBy).toBe('belt');
      expect(listSpy.mock.calls[0][0].sortOrder).toBe('asc');

      listSpy.mockClear();
      component.cycleBeltSort();
      expect(listSpy.mock.calls[0][0].sortBy).toBe('belt');
      expect(listSpy.mock.calls[0][0].sortOrder).toBe('desc');
    });
  });

  describe('search filter (#102)', () => {
    // The search box drives a `searchTerm` signal. When non-empty, the term is
    // forwarded to the backend as `q=...` so the filter spans all pages —
    // not just the current 20 rows. Empty / whitespace-only terms are stripped
    // so we don't poke the backend with a useless WHERE 1=1 LIKE '%%' clause.
    it('passes q to the service when load() runs with a non-empty searchTerm', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;
      listSpy.mockClear();

      component.searchTerm.set('mario');
      // Any public method that re-triggers load() will surface the filter
      // shape — using a no-op belt change keeps the call minimal.
      component.onBeltChange('');

      expect(listSpy).toHaveBeenCalledTimes(1);
      expect(listSpy.mock.calls[0][0].q).toBe('mario');
    });

    it('omits q from the filters when searchTerm is empty or whitespace-only', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      listSpy.mockClear();
      component.searchTerm.set('');
      component.onBeltChange('');
      expect(listSpy.mock.calls[0][0].q).toBeUndefined();

      listSpy.mockClear();
      component.searchTerm.set('   ');
      component.onBeltChange('');
      expect(listSpy.mock.calls[0][0].q).toBeUndefined();
    });

    it('normalises the searchTerm via applySearch — whitespace is trimmed before storage', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Whitespace-only input is "no search", not a search-with-spaces.
      // Storing the canonical value keeps the empty-state hint in the
      // template honest — `searchTerm()` truthiness now matches what the
      // backend actually sees.
      component.applySearch('   ');
      expect(component.searchTerm()).toBe('');

      component.applySearch('  mario  ');
      expect(component.searchTerm()).toBe('mario');
    });

    it('resets the page to 1 when the search term changes', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      // Land on page 3 first.
      component.onPageChange({ first: 40, rows: 20 });
      expect(listSpy.mock.calls.at(-1)?.[0].page).toBe(3);

      // Now applying a search term should bounce back to page 1 — otherwise
      // a filter that matches fewer than 41 rows leaves us on an empty page.
      listSpy.mockClear();
      component.applySearch('mario');
      expect(listSpy.mock.calls[0][0].page).toBe(1);
      expect(listSpy.mock.calls[0][0].q).toBe('mario');
    });
  });

  describe('paid filter (#105)', () => {
    // Two coupled behaviours: the `paid` filter param is forwarded to the
    // backend (server-side filter so it spans all pages, not just the
    // currently loaded 20), and the whole filter UI / badge column is
    // hidden when the academy hasn't configured a fee.
    it('passes paid=yes to the service when the filter is set', () => {
      // The `paid` filter is gated on `hasMonthlyFee()` — has to seed the
      // academy with a configured fee or load() drops the value.
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;
      listSpy.mockClear();

      component.onPaidChange('yes');

      expect(listSpy).toHaveBeenCalledTimes(1);
      expect(listSpy.mock.calls[0][0].paid).toBe('yes');
    });

    it('omits paid from the filters when set back to the empty (All) option', () => {
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      component.onPaidChange('no');
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBe('no');

      listSpy.mockClear();
      component.onPaidChange('');
      expect(listSpy.mock.calls[0][0].paid).toBeUndefined();
    });

    it('hasMonthlyFee=false when academy.monthly_fee_cents is null or absent', () => {
      const academyService = TestBed.inject(AcademyService);
      academyService.academy.set({ ...ACADEMY_BASE, monthly_fee_cents: null });

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.hasMonthlyFee()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-cy="athletes-paid-filter"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="athletes-th-paid"]')).toBeNull();
    });

    it('hasMonthlyFee=true when academy.monthly_fee_cents is set — filter + column visible', () => {
      const academyService = TestBed.inject(AcademyService);
      academyService.academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.hasMonthlyFee()).toBe(true);
      expect(
        fixture.nativeElement.querySelector('[data-cy="athletes-paid-filter"]'),
      ).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="athletes-th-paid"]')).not.toBeNull();
    });

    function makeAthlete(over: Partial<Athlete> = {}): Athlete {
      return {
        id: 42,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: 'mario@example.com',
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: '1990-05-15',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        joined_at: '2023-01-10',
        created_at: '2026-04-22T10:00:00+00:00',
        paid_current_month: false,
        ...over,
      } as Athlete;
    }

    function setupWithPopulatedRow(over: Partial<Athlete> = {}) {
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const athlete = makeAthlete(over);
      component.athletes.set([athlete]);
      return { fixture, component, athlete };
    }

    it('confirmTogglePaid → on accept (mark paid) calls PaymentService.markPaid + flips local state + shows toast', () => {
      const { fixture, component, athlete } = setupWithPopulatedRow({
        paid_current_month: false,
      });

      // ConfirmationService and MessageService are component-level
      // providers (declared on the @Component decorator), so we must
      // resolve them from the component's own injector — TestBed.inject
      // would walk up to the root injector and miss them.
      const confirmService = fixture.componentRef.injector.get(ConfirmationService);
      confirmService.confirm = vi.fn((cfg: { accept: () => void }) => {
        cfg.accept();
        return confirmService;
      }) as never;

      const messageSpy = vi.spyOn(
        fixture.componentRef.injector.get(MessageService),
        'add',
      );
      const paymentSpy = TestBed.inject(PaymentService).markPaid as unknown as Mock;

      const target = document.createElement('button');
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'currentTarget', { value: target });

      component.confirmTogglePaid(event, athlete);

      expect(paymentSpy).toHaveBeenCalledTimes(1);
      // Args: (athleteId, year, month). Year + month are computed from
      // `new Date()` so we just check the athleteId is right and the
      // year/month look like real values.
      expect(paymentSpy.mock.calls[0][0]).toBe(42);
      expect(paymentSpy.mock.calls[0][1]).toBeGreaterThanOrEqual(2025);
      expect(paymentSpy.mock.calls[0][2]).toBeGreaterThanOrEqual(1);

      // Local state flipped optimistically — no reload triggered.
      expect(component.athletes()[0].paid_current_month).toBe(true);

      expect(messageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success', summary: 'Marked paid' }),
      );
    });

    it('confirmTogglePaid → on accept (mark unpaid when currently paid) calls unmarkPaid', () => {
      const { fixture, component, athlete } = setupWithPopulatedRow({
        paid_current_month: true,
      });

      const confirmService = fixture.componentRef.injector.get(ConfirmationService);
      confirmService.confirm = vi.fn((cfg: { accept: () => void }) => {
        cfg.accept();
        return confirmService;
      }) as never;

      const unmarkSpy = TestBed.inject(PaymentService).unmarkPaid as unknown as Mock;

      const event = new MouseEvent('click');
      Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

      component.confirmTogglePaid(event, athlete);

      expect(unmarkSpy).toHaveBeenCalledTimes(1);
      // Local state flipped optimistically.
      expect(component.athletes()[0].paid_current_month).toBe(false);
    });

    it('confirmTogglePaid → 422 from the server surfaces an error toast about the missing fee', () => {
      const { fixture, component, athlete } = setupWithPopulatedRow({
        paid_current_month: false,
      });

      const confirmService = fixture.componentRef.injector.get(ConfirmationService);
      confirmService.confirm = vi.fn((cfg: { accept: () => void }) => {
        cfg.accept();
        return confirmService;
      }) as never;

      // Override the markPaid spy to throw a 422.
      const paymentSvc = TestBed.inject(PaymentService);
      (paymentSvc as unknown as { markPaid: Mock }).markPaid = vi.fn(() =>
        throwError(() => ({ status: 422 })),
      );

      const messageSpy = vi.spyOn(
        fixture.componentRef.injector.get(MessageService),
        'add',
      );

      const event = new MouseEvent('click');
      Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

      component.confirmTogglePaid(event, athlete);

      // Local state is NOT flipped on error — the server is the
      // source of truth, optimistic update only happens on success.
      expect(component.athletes()[0].paid_current_month).toBe(false);
      expect(messageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: expect.stringContaining('monthly fee'),
        }),
      );
    });

    it('drops a stale paid filter when monthly_fee_cents is cleared after the filter was set', () => {
      // Defensive: if the owner clears the academy fee in another tab while
      // this component is alive, the Paid select disappears but the signal
      // value is sticky. `load()` must NOT keep forwarding `paid` past that
      // point — otherwise the user sees filtered results with no UI to
      // reset them.
      const academyService = TestBed.inject(AcademyService);
      academyService.academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      component.onPaidChange('yes');
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBe('yes');

      // Fee gets cleared.
      academyService.academy.set({ ...ACADEMY_BASE, monthly_fee_cents: null });

      // Any subsequent reload (page change, belt change, sort, …) must
      // omit `paid` from the wire.
      listSpy.mockClear();
      component.onBeltChange('');
      expect(listSpy.mock.calls[0][0].paid).toBeUndefined();
    });
  });
});
