import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import type { Mock } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AthletesListComponent } from './athletes-list.component';
import { AcademyService, type Academy } from '../../../core/services/academy.service';
import { RuntimeService } from '../../../core/services/runtime.service';
import { AthleteService, type Athlete } from '../../../core/services/athlete.service';
import { PaymentService } from '../../../core/services/payment.service';

class FakeAthleteService {
  // Declare the default `data` slot as `Athlete[]` (not `never[]`) so
  // per-test `list.mockReturnValue(...)` calls can ship a populated
  // roster without a type-cast — caught when wiring the owner-chip
  // rendering specs (#754 Copilot review).
  readonly list = vi.fn(() =>
    of({
      data: [] as Athlete[],
      meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 },
    }),
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
        ...provideI18nTesting(),
      ],
    });
  });

  describe('load error state (#1033)', () => {
    it('renders an inline error-state banner when the list load fails (replaces the scroll-away toast)', () => {
      const list = TestBed.inject(AthleteService).list as unknown as Mock;
      list.mockReturnValue(throwError(() => new Error('load failed')));
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="athletes-error"]')).not.toBeNull();
    });

    it('retry re-issues the list request and clears the banner on success', () => {
      const list = TestBed.inject(AthleteService).list as unknown as Mock;
      list.mockReturnValue(throwError(() => new Error('load failed')));
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      const before = list.mock.calls.length;

      list.mockReturnValue(
        of({
          data: [] as Athlete[],
          meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 },
        }),
      );
      (fixture.componentInstance as unknown as { reload: () => void }).reload();
      fixture.detectChanges();

      expect(list.mock.calls.length).toBeGreaterThan(before);
      expect(fixture.nativeElement.querySelector('[data-cy="athletes-error"]')).toBeNull();
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

  describe('Belt sort — two states, and the order the page opens on (#1457)', () => {
    // Belt is the roster's default sort now, so the control lost its third
    // "off" leg: turning it off would drop the reader into insertion order,
    // which is an artefact of how rows were typed in rather than an order
    // anyone would choose. The sort still moves away from belt — the Full
    // name and Sessions headers take it — just not from this button.

    it('opens the roster on belt, highest rank first', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sortField()).toBe('belt');
      expect(fixture.componentInstance.sortOrder()).toBe('desc');
    });

    it('asks the server for that order on the very first load', () => {
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      // The default is worth nothing if it only exists in the component: the
      // server does the ranking, so it has to be on the first request.
      expect(listSpy.mock.calls[0][0]).toMatchObject({ sortBy: 'belt', sortOrder: 'desc' });
    });

    it('flips between desc and asc, and never turns itself off', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleBeltSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'asc']);

      component.cycleBeltSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'desc']);

      // A third press is the second state again, not a null field.
      component.cycleBeltSort();
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'asc']);
    });

    it('comes back to descending when the sort was on another column', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.cycleFullNameSort();
      expect(component.sortField()).toBe('first_name');

      component.cycleBeltSort();
      // The order the page opens on, not the flip of whatever it was before.
      expect([component.sortField(), component.sortOrder()]).toEqual(['belt', 'desc']);
    });

    it('shows the direction on the button, and goes neutral when the sort is elsewhere', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      const icon = (): DOMTokenList =>
        (fixture.nativeElement.querySelector('[data-cy="athletes-sort-belt"] i') as HTMLElement)
          .classList;

      // Lit on arrival now, because the page arrives sorted by belt.
      expect(icon()).toContain('pi-sort-amount-down');

      component.cycleBeltSort();
      fixture.detectChanges();
      expect(icon()).toContain('pi-sort-amount-up-alt');

      // Sorting by something else returns this control to neutral — the
      // signal is the source, so it cannot be left highlighted the way
      // PrimeNG's own sort icon was (#205).
      component.cycleFullNameSort();
      fixture.detectChanges();
      expect(icon()).toContain('pi-sort-alt');
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
    it('passes paid=yes to the service when the filter is set', async () => {
      // The `paid` filter is gated on `hasMonthlyFee()` — has to seed the
      // academy with a configured fee or load() drops the value.
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;
      listSpy.mockClear();

      // onPaidChange now updates the URL; the queryParamMap subscription
      // (#803) then sets the signal + calls load. Need to flush the
      // navigation Promise for the assertion to see the load call.
      component.onPaidChange('yes');
      await fixture.whenStable();

      expect(listSpy).toHaveBeenCalledTimes(1);
      expect(listSpy.mock.calls[0][0].paid).toBe('yes');
    });

    it('clearAllFiltersAndSearch clears `?paid` from the URL so refresh-after-reset stays clean (#803 reviewer)', async () => {
      // Reviewer finding on PR #804: clearing the filter mutated the
      // signal directly without dropping the URL param; a refresh
      // after Reset re-applied the just-cleared `paid=no` filter
      // because the URL was the source of truth post-#803.
      //
      // The action that owns this moved in #1446 — see the sibling test
      // below for why the sheet's own Reset no longer does it.
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });
      const router = TestBed.inject(Router);
      await router.navigate([], { queryParams: { paid: 'no' } });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.selectedPaid()).toBe('no');

      (component as unknown as { clearAllFiltersAndSearch: () => void }).clearAllFiltersAndSearch();
      await fixture.whenStable();

      expect(component.selectedPaid()).toBe('');
      expect(router.url).not.toContain('paid=');
    });

    it('the sheet Reset leaves the payment filter alone — it is not in the sheet (#1446)', async () => {
      // #1446 moved payment out of the filter sheet and onto the control
      // row, where it renders on the phone too and shows its own state.
      // A Reset that cleared it anyway would change the list for a reason
      // the user cannot see, and `activeFilterCount` — which no longer
      // counts it — would have said nothing was active beforehand.
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });
      const router = TestBed.inject(Router);
      await router.navigate([], { queryParams: { paid: 'no' } });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      component.selectedBelt.set('blue');

      component.resetFilters();
      await fixture.whenStable();

      expect(component.selectedBelt()).toBe('');
      expect(component.selectedPaid()).toBe('no');
      expect(router.url).toContain('paid=no');
    });

    it('hydrates selectedPaid from the `paid` query param on first render (#803)', async () => {
      // Bug #803: tapping "Vedi tutti i N" on the unpaid widget navigates
      // to /dashboard/athletes?paid=no, but since the user was already on
      // that route, ngOnInit didn't re-fire and there was no queryParams
      // subscription, so the filter never applied. This test pins the
      // queryParamMap → selectedPaid → load() hydration.
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });
      await TestBed.inject(Router).navigate([], { queryParams: { paid: 'no' } });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.selectedPaid()).toBe('no');
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBe('no');
    });

    it('omits paid from the filters when set back to the empty (All) option', async () => {
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      component.onPaidChange('no');
      await fixture.whenStable();
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBe('no');

      listSpy.mockClear();
      component.onPaidChange('');
      await fixture.whenStable();
      expect(listSpy.mock.calls[0][0].paid).toBeUndefined();
    });

    it('cycles all → paid → unpaid → all on the toolbar button (#1446)', async () => {
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      const listSpy = TestBed.inject(AthleteService).list as unknown as Mock;

      component.cyclePaid();
      await fixture.whenStable();
      expect(component.selectedPaid()).toBe('yes');
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBe('yes');

      component.cyclePaid();
      await fixture.whenStable();
      expect(component.selectedPaid()).toBe('no');
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBe('no');

      listSpy.mockClear();
      component.cyclePaid();
      await fixture.whenStable();
      expect(component.selectedPaid()).toBe('');
      expect(listSpy.mock.calls.at(-1)?.[0].paid).toBeUndefined();
    });

    it('the button says which state it is in, not only what colour it is', async () => {
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Resolved EN copy, not the key — a missing key renders the key and
      // still passes an assertion written against it.
      expect(component.paidCycleLabel()).toBe('Payment');

      component.cyclePaid();
      await fixture.whenStable();
      expect(component.paidCycleLabel()).toBe('Paid');

      component.cyclePaid();
      await fixture.whenStable();
      expect(component.paidCycleLabel()).toBe('Unpaid');
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

    it('names the payment column without a month, because most cells are not about one (#1425)', () => {
      // It read "Payment · Sep" from #282, when the column answered "has this
      // athlete paid for September". Since #1402 it answers HOW the month is
      // covered — and a Quarterly bought in February or an Annual bought in
      // January are exactly the cells the month suffix contradicted.
      const academyService = TestBed.inject(AcademyService);
      academyService.academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const headerText = fixture.nativeElement
        .querySelector('[data-cy="athletes-th-paid"]')
        ?.textContent?.trim();

      expect(headerText).toBe('Payment');
      expect(headerText).not.toContain('·');
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

      const messageSpy = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');
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

      const messageSpy = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

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

    it('drops a stale paid filter when monthly_fee_cents is cleared after the filter was set', async () => {
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

      // onPaidChange routes through the URL now (#803); flush before
      // asserting on the load call.
      component.onPaidChange('yes');
      await fixture.whenStable();
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

  describe('social icons inline in the Full name cell', () => {
    // Mirrors the academy-detail social-link pattern (academy
    // canon: see `academy-detail.component.ts § contactLinks`).
    // Conditional render — the icon row only mounts when the
    // athlete actually carries that social. No empty placeholders.
    function makeListAthlete(over: Partial<Athlete> = {}): Athlete {
      return {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
        ...over,
      } as Athlete;
    }

    function setupWithRows(rows: Athlete[]) {
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      fixture.componentInstance.athletes.set(rows);
      fixture.detectChanges();
      return fixture;
    }

    it('renders a Facebook icon link when athlete.facebook is set', () => {
      const fixture = setupWithRows([
        makeListAthlete({ id: 7, facebook: 'https://facebook.com/mario' }),
      ]);
      const link = fixture.nativeElement.querySelector('[data-cy="athlete-social-facebook-7"]');
      expect(link).not.toBeNull();
      expect(link.getAttribute('href')).toBe('https://facebook.com/mario');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('renders an Instagram icon link when athlete.instagram is set', () => {
      const fixture = setupWithRows([
        makeListAthlete({ id: 8, instagram: 'https://instagram.com/mario' }),
      ]);
      const link = fixture.nativeElement.querySelector('[data-cy="athlete-social-instagram-8"]');
      expect(link).not.toBeNull();
      expect(link.getAttribute('href')).toBe('https://instagram.com/mario');
    });

    it('puts the socials on the name line, not on a line of their own (#1445)', () => {
      // The point of #1445 is vertical space, and the only thing that actually
      // buys it is WHERE the icons sit. A test that just finds the link would
      // stay green if they drifted back under the name, so this one pins the
      // parent: the socials group is a sibling of the age badge inside the
      // primary line, and there is no wrapper stacking a second row.
      const fixture = setupWithRows([
        makeListAthlete({ id: 20, facebook: 'https://facebook.com/mario' }),
      ]);
      const link = fixture.nativeElement.querySelector('[data-cy="athlete-social-facebook-20"]');

      // The line itself moved into the shared identity block in #1458, so
      // the parent to assert moved with it — the contract is unchanged: the
      // icons are ON the name's line, not on a row of their own.
      expect(link.closest('.athlete-identity__body')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.athlete-name__body')).toBeNull();
    });

    it('renders neither icon when both socials are null', () => {
      const fixture = setupWithRows([makeListAthlete({ id: 9, facebook: null, instagram: null })]);
      expect(
        fixture.nativeElement.querySelector('[data-cy^="athlete-social-facebook-"]'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-cy^="athlete-social-instagram-"]'),
      ).toBeNull();
    });

    it('icon link click does NOT bubble — the row navigation should not trigger', () => {
      // Asserts the propagation gate by attaching a listener on a
      // higher ancestor and verifying it does NOT fire when the icon
      // link is clicked. Spying on `Event.prototype.stopPropagation`
      // was brittle in jsdom (Copilot review on PR #496) and the
      // post-dispatch `cancelBubble` flag wasn't reliably reflected
      // through Angular's event-binding wrapper. The parent-listener
      // approach is the most honest assertion: it matches the actual
      // user-visible side-effect ("clicking the social icon must not
      // trigger the row's primary nav target").
      const fixture = setupWithRows([
        makeListAthlete({ id: 10, facebook: 'https://facebook.com/x' }),
      ]);
      const link = fixture.nativeElement.querySelector(
        '[data-cy="athlete-social-facebook-10"]',
      ) as HTMLAnchorElement;
      // Stub the default-action so jsdom doesn't try to navigate to
      // facebook.com during the assertion.
      link.addEventListener('click', (ev) => ev.preventDefault());

      const ancestorSpy = vi.fn();
      document.body.addEventListener('click', ancestorSpy);
      try {
        link.click();
        expect(ancestorSpy).not.toHaveBeenCalled();
      } finally {
        document.body.removeEventListener('click', ancestorSpy);
      }
    });
  });

  // ── Mobile card 3-dot menu (#670) ────────────────────────────────────
  //
  // The mobile card layout collapses Edit + Delete into a single 3-dot
  // menu. The menu's model is rebuilt per-athlete each time the button
  // is tapped — these specs cover that build + the dedicated delete flow
  // that routes through <p-confirmDialog key="athlete-delete-mobile">
  // instead of the desktop anchored popup.

  describe('mobile card 3-dot menu (#670)', () => {
    function makeAthlete(over: Partial<Athlete> = {}): Athlete {
      return {
        id: 42,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
        ...over,
      } as Athlete;
    }

    it('openCardMenu populates cardMenuItems with the quick-actions set (#985, #1430)', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance as unknown as {
        openCardMenu: (event: Event, athlete: Athlete) => void;
        cardMenuItems: () => Array<{ label?: string; icon?: string; styleClass?: string }>;
        cardMenu?: { toggle: Mock };
      };
      component.cardMenu = { toggle: vi.fn() };

      component.openCardMenu({ stopPropagation: vi.fn() } as unknown as Event, makeAthlete());

      const items = component.cardMenuItems();
      // No monthly_fee + no handle on the default makeAthlete fixture →
      // 4 items: attendance, documents, promotions, edit. The conditional
      // Payments + Public profile entries are exercised in the follow-up
      // assertions below. Delete moved off this menu entirely (#1430) — the
      // danger zone on the edit page is the only place it lives now.
      expect(items).toHaveLength(4);
      const icons = items.map((it) => it.icon);
      expect(icons).toEqual(['pi pi-calendar', 'pi pi-file', 'pi pi-trophy', 'pi pi-pencil']);
      expect(icons).not.toContain('pi pi-trash');
      expect(component.cardMenu?.toggle).toHaveBeenCalledTimes(1);
    });

    it('openCardMenu includes Public profile only when the athlete has a handle (#985)', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance as unknown as {
        openCardMenu: (event: Event, athlete: Athlete) => void;
        cardMenuItems: () => Array<{ icon?: string }>;
        cardMenu?: { toggle: Mock };
      };
      component.cardMenu = { toggle: vi.fn() };

      component.openCardMenu(
        { stopPropagation: vi.fn() } as unknown as Event,
        makeAthlete({ user_handle: 'mario.rossi' }),
      );

      const icons = component.cardMenuItems().map((it) => it.icon);
      // Jakob's law — public profile uses the same `pi pi-id-card`
      // glyph as the desktop `.athletes-page__public-profile-link`.
      expect(icons).toContain('pi pi-id-card');
    });

    // #1349 — the public profile lives behind `capabilityGuard('community')`,
    // and the desktop runtime has NO capabilities. Rendering the control there
    // offered one the guard refuses, bouncing the click to the dashboard.
    describe('without the community capability (the desktop build)', () => {
      // Same shape `capability.guard.spec.ts` uses: a runtime that simply has
      // nothing, which is literally the desktop profile — `config/budojo.php`
      // gives it an empty capability list.
      function withoutCommunity(): void {
        TestBed.overrideProvider(RuntimeService, {
          useValue: { load: vi.fn().mockResolvedValue(undefined), has: signal(() => false) },
        });
      }

      it('offers no public-profile item in the card menu', () => {
        withoutCommunity();
        const fixture = TestBed.createComponent(AthletesListComponent);
        fixture.detectChanges();

        const component = fixture.componentInstance as unknown as {
          openCardMenu: (e: Event, a: Athlete) => void;
          cardMenuItems: () => Array<{ icon?: string }>;
          cardMenu?: { toggle: Mock };
        };
        component.cardMenu = { toggle: vi.fn() };
        component.openCardMenu(
          { stopPropagation: vi.fn() } as unknown as Event,
          makeAthlete({ user_handle: 'mario.rossi' }),
        );

        expect(component.cardMenuItems().map((it) => it.icon)).not.toContain('pi pi-id-card');
      });

      it('renders no public-profile link in any layout', () => {
        withoutCommunity();
        const fixture = TestBed.createComponent(AthletesListComponent);
        fixture.detectChanges();
        fixture.componentInstance.athletes.set([makeAthlete({ user_handle: 'mario.rossi' })]);
        fixture.detectChanges();

        const root: HTMLElement = fixture.nativeElement;

        expect(root.querySelectorAll('a[href*="/dashboard/u/"]').length).toBe(0);
      });

      // The web app must be untouched — this is a capability gate, not a
      // removal, and the same spec file asserts the link everywhere else.
      it('still renders it when the capability is present', () => {
        const fixture = TestBed.createComponent(AthletesListComponent);
        fixture.detectChanges();
        fixture.componentInstance.athletes.set([makeAthlete({ user_handle: 'mario.rossi' })]);
        fixture.detectChanges();

        const root: HTMLElement = fixture.nativeElement;

        expect(root.querySelectorAll('a[href*="/dashboard/u/"]').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Owner-as-athlete chip + paid placeholder rendering (#750, #754 Copilot review)', () => {
    function makeAthlete(over: Partial<Athlete> = {}): Athlete {
      return {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
        is_self: false,
        paid_current_month: true,
        ...over,
      } as Athlete;
    }

    it('renders the Owner chip on self-rows and omits it on the rest', () => {
      const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
      athleteService.list.mockReturnValue(
        of({
          data: [makeAthlete({ id: 1, is_self: true }), makeAthlete({ id: 2, is_self: false })],
          meta: { total: 2, current_page: 1, per_page: 20, last_page: 1 },
        }),
      );

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-cy="athlete-owner-chip-1"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="athlete-owner-chip-2"]')).toBeNull();
    });

    it('renders the paid placeholder on self-rows and the paid badge on the rest when the academy has a monthly fee', () => {
      // `hasMonthlyFee()` reads from AcademyService.academy(); without a
      // fee the entire paid column is gated out (#105) and there's nothing
      // to assert on. The root-singleton signal is reset by TestBed's
      // per-test module setup.
      TestBed.inject(AcademyService).academy.set({
        id: 1,
        name: 'Test',
        slug: 'test',
        address: null,
        logo_url: null,
        monthly_fee_cents: 9500,
      } as Academy);

      const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
      athleteService.list.mockReturnValue(
        of({
          data: [
            makeAthlete({ id: 1, is_self: true, paid_current_month: true }),
            makeAthlete({ id: 2, is_self: false, paid_current_month: true }),
          ],
          meta: { total: 2, current_page: 1, per_page: 20, last_page: 1 },
        }),
      );

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      // Scope assertions to the desktop `<tbody>`. The mobile-cards
      // view (`.athletes-cards`) also renders the paid badge but does
      // NOT gate on `is_self` (separate inconsistency tracked outside
      // this test) — both views are present in jsdom regardless of
      // viewport so a global count would conflate them.
      const tbody = el.querySelector('tbody');
      expect(tbody).not.toBeNull();
      expect(tbody?.querySelectorAll('.athlete-paid-empty').length).toBe(1);
      // The badge became the coverage chip (#1402): same gate, same em-dash
      // for the rows where payment is not expected, a different thing on the
      // rows where it is.
      expect(tbody?.querySelectorAll('.athlete-coverage').length).toBe(1);
    });

    it('renders the paid placeholder (em-dash) for suspended + inactive rows, paid badge only on active rows (#805)', () => {
      // Same gate as the self-row branch: payment is not expected from
      // non-active athletes, so the Unpaid chip shouldn't render for
      // them. Owner-as-athlete already used the em-dash placeholder;
      // this test pins that suspended / inactive rows follow the same
      // affordance.
      TestBed.inject(AcademyService).academy.set({
        id: 1,
        name: 'Test',
        slug: 'test',
        address: null,
        logo_url: null,
        monthly_fee_cents: 9500,
      } as Academy);

      const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
      athleteService.list.mockReturnValue(
        of({
          data: [
            makeAthlete({ id: 10, status: 'active', paid_current_month: false }),
            makeAthlete({ id: 11, status: 'inactive', paid_current_month: false }),
            makeAthlete({ id: 12, status: 'inactive', paid_current_month: false }),
          ],
          meta: { total: 3, current_page: 1, per_page: 20, last_page: 1 },
        }),
      );

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const tbody = (fixture.nativeElement as HTMLElement).querySelector('tbody');
      // Two em-dash placeholders (suspended + inactive); one coverage chip
      // (active). The Owner-as-athlete branch is not exercised here
      // (all three rows have is_self=false from `makeAthlete` default).
      expect(tbody?.querySelectorAll('.athlete-paid-empty').length).toBe(2);
      expect(tbody?.querySelectorAll('.athlete-coverage').length).toBe(1);
    });
  });

  describe('empty-state onboarding CTA (#1033 wave 3)', () => {
    it('renders an Add athlete CTA when the roster is empty and no filters are set', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const empty = fixture.nativeElement.querySelector(
        '[data-cy="athletes-empty"]',
      ) as HTMLElement | null;
      expect(empty).not.toBeNull();
      // The empty state turns into the academy owner's onboarding moment —
      // a primary CTA wired to goToNew() reduces time-to-first-athlete
      // (the #1 friction point at sign-up).
      expect(empty!.querySelector('[data-cy="athletes-empty-cta"]')).not.toBeNull();
    });

    it('the empty-state Clear filters action also clears searchTerm — not just the dropdowns (#1090 reviewer)', () => {
      // resetFilters() is contracted to leave the search box untouched
      // (#704 mobile-sheet Reset). The empty-state CTA mustn't dead-end
      // a user who landed there via a search term — wire to a sibling
      // that clears everything, search included.
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.searchTerm.set('zzz');
      expect(component.searchTerm()).toBe('zzz');

      (component as unknown as { clearAllFiltersAndSearch: () => void }).clearAllFiltersAndSearch();

      expect(component.searchTerm()).toBe('');
    });

    it('renders a Clear filters CTA when a filter is active and the result is empty (#1090 reviewer)', () => {
      // Exercises the filtered-empty branch + asserts the resolved
      // translation — client/CLAUDE.md § i18n: the parity spec confirms
      // key sets match but NOT that template paths resolve, so a fat-
      // fingered key on this branch would ship green otherwise.
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      fixture.componentInstance.searchTerm.set('zzz');
      fixture.detectChanges();

      const cta = fixture.nativeElement.querySelector(
        '[data-cy="athletes-empty-cta"]',
      ) as HTMLElement | null;
      expect(cta).not.toBeNull();
      expect(cta!.textContent).toContain('Clear filters');
    });
  });
});

describe('AthletesListComponent — who is expected to pay (#1381)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
        ...provideI18nTesting(),
      ],
    });
  });

  function athlete(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      first_name: 'Mario',
      last_name: 'Rossi',
      status: 'active',
      is_self: false,
      monthly_fee_cents: 6500,
      ...overrides,
    } as never;
  }

  function predicate() {
    const fixture = TestBed.createComponent(AthletesListComponent);
    return fixture.componentInstance.paymentNotExpected.bind(fixture.componentInstance);
  }

  it('expects payment from an ordinary active athlete on a fee', () => {
    expect(predicate()(athlete())).toBe(false);
  });

  it('does not expect payment from the owner training in their own academy', () => {
    expect(predicate()(athlete({ is_self: true }))).toBe(true);
  });

  it('does not expect payment from an inactive athlete', () => {
    expect(predicate()(athlete({ status: 'inactive' }))).toBe(true);
  });

  it('does not expect payment when no fee resolves for them', () => {
    // A tier-only academy where nobody put this athlete on a tier: they owe
    // nothing, and the server would 422 the toggle.
    expect(predicate()(athlete({ monthly_fee_cents: null }))).toBe(true);
  });

  it('still expects payment on a pre-#1381 payload with no fee field', () => {
    expect(predicate()(athlete({ monthly_fee_cents: undefined }))).toBe(false);
  });
});

describe('AthletesListComponent — the roster paid toggle says what it does (#1382)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
        ...provideI18nTesting(),
      ],
    });
  });

  function confirmMessageFor(billingPeriodMonths: number | undefined, paid: boolean): string {
    const fixture = TestBed.createComponent(AthletesListComponent);
    const cmp = fixture.componentInstance;
    const confirmService = fixture.componentRef.injector.get(ConfirmationService);

    let message = '';
    confirmService.confirm = vi.fn((cfg: { message: string }) => {
      message = cfg.message;
      return confirmService;
    }) as never;

    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });
    cmp.confirmTogglePaid(event, {
      id: 1,
      first_name: 'Mario',
      last_name: 'Rossi',
      paid_current_month: paid,
      billing_period_months: billingPeriodMonths,
    } as never);

    return message;
  }

  it('names the whole quarter it is about to record', () => {
    // "April 2026" alone would be a quietly false description of a €165
    // receipt covering three months.
    const message = confirmMessageFor(3, false);
    expect(message).toContain('Mario Rossi');
    expect(message).toMatch(/–/);
  });

  it('names the whole quarter it is about to undo', () => {
    expect(confirmMessageFor(3, true)).toMatch(/–/);
  });

  it('keeps the plain single-month wording for a monthly athlete', () => {
    const message = confirmMessageFor(1, false);
    expect(message).toContain('Mario Rossi');
    expect(message).not.toMatch(/–/);
  });

  it('treats a pre-#1382 payload with no period as monthly', () => {
    expect(confirmMessageFor(undefined, false)).not.toMatch(/–/);
  });
});

describe('AthletesListComponent — the roster shows who trains here (#1403)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
        ...provideI18nTesting(),
      ],
    });
  });

  it('asks the server for the actives, not for everyone', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();

    const list = TestBed.inject(AthleteService).list as unknown as Mock;
    // The roster answers "who trains here"; someone who left is not part of
    // that answer, and used to arrive on page one anyway.
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'active' });
  });

  it('the eye asks for everyone, and asking again goes back', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const list = TestBed.inject(AthleteService).list as unknown as Mock;

    cmp.toggleInactive();
    expect(cmp.showingInactive()).toBe(true);
    expect(list.mock.calls.at(-1)?.[0].status).toBeUndefined();

    cmp.toggleInactive();
    expect(cmp.showingInactive()).toBe(false);
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'active' });
  });

  it('lights the eye for any list that is wider than the actives', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    // The eye is derived, never held beside the state — so anything that is
    // not "only the actives" has to light it, or the grey rows on screen have
    // no explanation.
    cmp.onStatusChange('inactive');
    expect(cmp.showingInactive()).toBe(true);
  });

  it('hides the eye in the restore picker, where it would mean nothing', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.onStatusChange('trashed');
    expect(cmp.canToggleInactive()).toBe(false);
  });

  it('has no status select left — the eye is the whole control (#1426)', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();

    // Two controls answering the same question, wired so they could not
    // contradict each other. The wiring existed because they were the same
    // question; one of them had to go, and the eye is one gesture with a
    // default state that answers what people open the page with.
    const selects = fixture.nativeElement.querySelectorAll('p-select');
    const labels = Array.from(selects).map((el) => (el as HTMLElement).getAttribute('placeholder'));
    expect(labels).not.toContain('All statuses');
  });

  it('keeps the eye reachable on a phone, where the inline row is not (#1426)', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();

    // The consequence the issue did not anticipate: the eye used to live
    // inside `__filters-inline`, which is `display: none` below 768px, and the
    // status select was what carried this job there. Removing the select with
    // the eye still inside would have left a phone unable to see an inactive
    // athlete at all.
    const inline = fixture.nativeElement.querySelector('[data-cy="athletes-filters-inline"]');
    const eye = fixture.nativeElement.querySelector('[data-cy="athletes-reveal-inactive"]');

    expect(eye).not.toBeNull();
    expect(inline?.contains(eye)).toBe(false);
  });

  it('reaches the deleted athletes without the select that used to hold them (#1426)', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    // The second consequence, and the one that would have broken a feature:
    // `trashed` was a value in the status menu, so removing the menu removed
    // the only way into the restore picker (#700).
    const bin = fixture.nativeElement.querySelector(
      '[data-cy="athletes-reveal-trashed"]',
    ) as HTMLButtonElement;
    expect(bin).not.toBeNull();

    bin.click();
    expect(cmp.isTrashedMode()).toBe(true);

    bin.click();
    // Back to the default list, not to whatever the eye was showing before:
    // restoring someone is a finished errand, not a filter you were in.
    expect(cmp.isTrashedMode()).toBe(false);
    expect(cmp.selectedStatus()).toBe('active');
  });

  it('resets to the actives, not to everyone', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.onStatusChange('');
    cmp.resetFilters();

    // "Reset" means the list you started from, and that list is the actives.
    expect(cmp.selectedStatus()).toBe('active');
    expect(cmp.showingInactive()).toBe(false);
  });

  it('does not count the default as an active filter', () => {
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();

    // The mobile filter chip would otherwise show a permanent "1".
    expect(fixture.componentInstance.activeFilterCount()).toBe(0);
  });
});

describe('AthletesListComponent — what is paying for the month (#1402)', () => {
  // Local copy: the two existing `makeAthlete` helpers are scoped inside their
  // own describes, and hoisting one out would touch specs this change has no
  // business editing.
  function makeAthlete(over: Partial<Athlete> = {}): Athlete {
    return {
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: null,
      phone_country_code: null,
      phone_national_number: null,
      address: null,
      date_of_birth: null,
      belt: 'white',
      stripes: 0,
      status: 'active',
      joined_at: '2026-01-01',
      created_at: '2026-01-01T00:00:00Z',
      ...over,
    } as Athlete;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
        ...provideI18nTesting(),
      ],
    });
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      monthly_fee_cents: 9500,
      carnet_price_cents: 7000,
      carnet_entries: 10,
    } as Academy);
  });

  function render(rows: Athlete[]) {
    const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
    athleteService.list.mockReturnValue(
      of({
        data: rows,
        meta: { total: rows.length, current_page: 1, per_page: 20, last_page: 1 },
      }),
    );
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();

    return fixture;
  }

  function chip(fixture: ComponentFixture<AthletesListComponent>, id: number): string {
    return (
      (fixture.nativeElement as HTMLElement)
        .querySelector(`[data-cy="athlete-coverage-${id}"]`)
        ?.textContent?.trim() ?? ''
    );
  }

  it('says carnet for the athlete who bought one, instead of calling them unpaid', () => {
    // The bug behind the whole change: eight entries left, and the column said
    // "Non pagato".
    const fixture = render([
      makeAthlete({
        id: 1,
        paid_current_month: false,
        payment_coverage: 'carnet',
        active_carnet: { id: 9, code: 'A7K2', remaining_entries: 8, expires_at: '2027-01-01' },
      }),
    ]);

    expect(chip(fixture, 1)).toContain('Carnet');
    expect(chip(fixture, 1)).toContain('8');
  });

  it('names the period rather than just saying paid', () => {
    const fixture = render([
      makeAthlete({ id: 2, paid_current_month: true, payment_coverage: 'quarterly' }),
    ]);

    expect(chip(fixture, 2)).toContain('Quarterly');
  });

  it('still says unpaid when nothing covers the month', () => {
    const fixture = render([
      makeAthlete({ id: 3, paid_current_month: false, payment_coverage: 'none' }),
    ]);

    expect(chip(fixture, 3)).toContain('Unpaid');
  });

  it('falls back to the old boolean on a payload without the new field', () => {
    // Pre-#1402 responses, and every fixture written before it.
    const fixture = render([makeAthlete({ id: 4, paid_current_month: true })]);

    expect(chip(fixture, 4)).toContain('Monthly');
  });

  function chipIcon(fixture: ComponentFixture<AthletesListComponent>, id: number): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(
        `[data-cy="athlete-coverage-${id}"] .p-tag-icon`,
      )?.className ?? ''
    );
  }

  /**
   * The same chip on the mobile card. Both layouts render in jsdom, so
   * without this the card's own `[icon]` binding could be deleted and the
   * suite would stay green — on the form factor this app is built for.
   */
  function cardChipIcon(fixture: ComponentFixture<AthletesListComponent>, id: number): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(
        `[data-cy="athlete-card-coverage-${id}"] .p-tag-icon`,
      )?.className ?? ''
    );
  }

  it('gives the chip a glyph for what pays, so the column can be scanned (#1444)', () => {
    // Three shapes, not five: every subscription period is the same answer to
    // "is this settled", and the carnet is the one that is settled by a
    // different mechanism. The cross is the only row that wants something.
    const covered = render([
      makeAthlete({ id: 10, paid_current_month: true, payment_coverage: 'monthly' }),
    ]);
    expect(chipIcon(covered, 10)).toContain('pi-money-bill');

    const annual = render([
      makeAthlete({ id: 11, paid_current_month: true, payment_coverage: 'annual' }),
    ]);
    expect(chipIcon(annual, 11)).toContain('pi-money-bill');

    const carnet = render([
      makeAthlete({
        id: 12,
        paid_current_month: false,
        payment_coverage: 'carnet',
        active_carnet: { id: 9, code: 'A7K2', remaining_entries: 8, expires_at: '2027-01-01' },
      }),
    ]);
    expect(chipIcon(carnet, 12)).toContain('pi-ticket');

    const unpaid = render([
      makeAthlete({ id: 13, paid_current_month: false, payment_coverage: 'none' }),
    ]);
    expect(chipIcon(unpaid, 13)).toContain('pi-times-circle');

    // The card carries the same fact, and #1402 settled that it has to read
    // the same in both places or it does not exist for the instructor on the
    // mat. Asserted on the card too, or half the binding is untested.
    expect(cardChipIcon(carnet, 12)).toContain('pi-ticket');
    expect(cardChipIcon(unpaid, 13)).toContain('pi-times-circle');
  });

  it('tells paid from unpaid without reading the colour (#1444)', () => {
    // The reason this chip is allowed an icon at all: its states are a
    // green/amber pair, which is the one pair a red-green reader cannot
    // separate. The glyph has to differ, not just the fill.
    const paid = render([
      makeAthlete({ id: 14, paid_current_month: true, payment_coverage: 'monthly' }),
    ]);
    const unpaid = render([
      makeAthlete({ id: 15, paid_current_month: false, payment_coverage: 'none' }),
    ]);

    expect(chipIcon(paid, 14)).not.toBe(chipIcon(unpaid, 15));
  });

  it('offers marking paid only to someone who is not covered', () => {
    const fixture = render([]);
    const cmp = fixture.componentInstance;
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

    cmp['openPaymentMenu'](event, makeAthlete({ id: 5, payment_coverage: 'none' }) as never);
    const labels = cmp['paymentMenuItems']().map((i) => i.label);

    // A menu that offers "undo the payment" to someone who has none teaches
    // the reader to ignore half of it.
    expect(labels).toContain('Mark paid');
    expect(labels).not.toContain('Undo the payment');
  });

  it('offers undoing only where there is a fee payment to undo', () => {
    const fixture = render([]);
    const cmp = fixture.componentInstance;
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

    cmp['openPaymentMenu'](event, makeAthlete({ id: 6, payment_coverage: 'quarterly' }) as never);
    expect(cmp['paymentMenuItems']().map((i) => i.label)).toContain('Undo the payment');

    // A carnet is undone by deleting the carnet — a different act, with its
    // own warning about the sessions it covers.
    cmp['openPaymentMenu'](event, makeAthlete({ id: 7, payment_coverage: 'carnet' }) as never);
    expect(cmp['paymentMenuItems']().map((i) => i.label)).not.toContain('Undo the payment');
  });

  it('does not offer a carnet in an academy that sells none', () => {
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      monthly_fee_cents: 9500,
    } as Academy);

    const fixture = render([]);
    const cmp = fixture.componentInstance;
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

    cmp['openPaymentMenu'](event, makeAthlete({ id: 8, payment_coverage: 'none' }) as never);
    expect(cmp['paymentMenuItems']().map((i) => i.label)).not.toContain('Sell a carnet');
  });
});

describe('AthletesListComponent — how often they actually turn up (#1447)', () => {
  function makeAthlete(over: Partial<Athlete> = {}): Athlete {
    return {
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: null,
      phone_country_code: null,
      phone_national_number: null,
      address: null,
      date_of_birth: null,
      belt: 'white',
      stripes: 0,
      status: 'active',
      joined_at: '2026-01-01',
      created_at: '2026-01-01T00:00:00Z',
      attendance_month_count: 0,
      attendance_total_count: 0,
      ...over,
    } as Athlete;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
        ...provideI18nTesting(),
      ],
    });
  });

  function render(rows: Athlete[]) {
    const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
    athleteService.list.mockReturnValue(
      of({
        data: rows,
        meta: { total: rows.length, current_page: 1, per_page: 20, last_page: 1 },
      }),
    );
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();

    return fixture;
  }

  function el(
    fixture: ComponentFixture<AthletesListComponent>,
    selector: string,
  ): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  it('shows this month loudly and the all-time count as context', () => {
    const fixture = render([
      makeAthlete({ id: 1, attendance_month_count: 6, attendance_total_count: 214 }),
    ]);

    expect(el(fixture, '.athlete-attendance__month')?.textContent?.trim()).toBe('6');
    expect(el(fixture, '.athlete-attendance__total')?.textContent).toContain('214');
  });

  it('hides the column entirely when the payload never carried the counts', () => {
    // A pre-#1447 server, or any payload that did not select them. Rendering
    // "0" there would report that nobody has ever trained — a worse lie than
    // showing nothing, and one the reader cannot tell from the truth.
    const fixture = render([
      makeAthlete({ id: 1, attendance_month_count: undefined, attendance_total_count: undefined }),
    ]);

    expect(el(fixture, '[data-cy="athletes-th-attendance"]')).toBeNull();
    expect(el(fixture, '.athlete-attendance')).toBeNull();
  });

  it('still shows a genuine zero, which is a real answer', () => {
    const fixture = render([
      makeAthlete({ id: 1, attendance_month_count: 0, attendance_total_count: 0 }),
    ]);

    expect(el(fixture, '[data-cy="athletes-th-attendance"]')).not.toBeNull();
    expect(el(fixture, '.athlete-attendance__month')?.textContent?.trim()).toBe('0');
  });

  it('cycles month desc → month asc → total desc → total asc → month desc', () => {
    const fixture = render([makeAthlete({ id: 1 })]);
    const cmp = fixture.componentInstance;

    // Descending first: a count column is opened with "who trains most", and
    // every leaderboard the user has seen starts at the top.
    cmp.cycleAttendanceSort();
    expect([cmp.sortField(), cmp.sortOrder()]).toEqual(['attendance_month', 'desc']);

    cmp.cycleAttendanceSort();
    expect([cmp.sortField(), cmp.sortOrder()]).toEqual(['attendance_month', 'asc']);

    cmp.cycleAttendanceSort();
    expect([cmp.sortField(), cmp.sortOrder()]).toEqual(['attendance_total', 'desc']);

    cmp.cycleAttendanceSort();
    expect([cmp.sortField(), cmp.sortOrder()]).toEqual(['attendance_total', 'asc']);

    cmp.cycleAttendanceSort();
    expect([cmp.sortField(), cmp.sortOrder()]).toEqual(['attendance_month', 'desc']);
  });

  it('restarts the cycle when the sort is currently on another column', () => {
    const fixture = render([makeAthlete({ id: 1 })]);
    const cmp = fixture.componentInstance;
    cmp.sortField.set('belt');
    cmp.sortOrder.set('asc');

    cmp.cycleAttendanceSort();

    expect([cmp.sortField(), cmp.sortOrder()]).toEqual(['attendance_month', 'desc']);
  });

  it('sends the alias on the wire, not a column name', () => {
    const fixture = render([makeAthlete({ id: 1 })]);
    // `as Mock` for the args, the way the sibling describes read them — the
    // fake's own `vi.fn()` signature takes no parameters.
    const list = TestBed.inject(AthleteService).list as unknown as Mock;

    fixture.componentInstance.cycleAttendanceSort();

    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({
      sortBy: 'attendance_month',
      sortOrder: 'desc',
    });
  });

  it('says which of the two numbers leads, and which way', () => {
    // Same signifier contract as the Full name header's F↑/L↓: the letter is
    // the lead, the arrow the direction, and `↕` means the sort is elsewhere.
    const fixture = render([makeAthlete({ id: 1 })]);
    const cmp = fixture.componentInstance;

    expect(cmp.attendanceSortLabel()).toBeNull();

    cmp.cycleAttendanceSort();
    expect(cmp.attendanceSortLabel()).toBe('M↓');

    cmp.cycleAttendanceSort();
    expect(cmp.attendanceSortLabel()).toBe('M↑');

    cmp.cycleAttendanceSort();
    expect(cmp.attendanceSortLabel()).toBe('T↓');
  });

  it('reports the direction to assistive tech, and nothing when it is not sorting', () => {
    const fixture = render([makeAthlete({ id: 1 })]);
    const cmp = fixture.componentInstance;

    expect(cmp.attendanceAriaSort()).toBe('none');

    cmp.cycleAttendanceSort();
    expect(cmp.attendanceAriaSort()).toBe('descending');

    cmp.cycleAttendanceSort();
    expect(cmp.attendanceAriaSort()).toBe('ascending');
  });

  it('gives the cell an aria-label with both numbers spelled out', () => {
    // The separator between them is `aria-hidden`, so without this a screen
    // reader would read "6 214" and leave the listener to guess.
    const fixture = render([
      makeAthlete({ id: 1, attendance_month_count: 6, attendance_total_count: 214 }),
    ]);

    const label = el(fixture, '.athlete-attendance')?.getAttribute('aria-label');
    expect(label).toContain('6');
    expect(label).toContain('214');
    expect(label).not.toBe('');
  });

  it('puts only this month on the mobile card, where there is no header to sort from', () => {
    const fixture = render([
      makeAthlete({ id: 1, attendance_month_count: 6, attendance_total_count: 214 }),
    ]);

    const card = el(fixture, '[data-cy="athlete-card-attendance-1"]');
    expect(card?.textContent).toContain('6');
    // An all-time count nobody can order is reference material, not a chip.
    expect(card?.textContent).not.toContain('214');
    // And the label has to agree with the card. `textContent` never sees an
    // attribute, so the assertion above passed while the card announced
    // "214 in total" to a screen reader — a number that is not on it.
    const label = card?.getAttribute('aria-label') ?? '';
    expect(label).toContain('6');
    expect(label).not.toContain('214');
  });

  it('keeps the column once the server has proved it sends counts', () => {
    // Derived from the current page, this vanished whenever a search came
    // back empty — including mid-sort, leaving an attendance sort running
    // with no control to turn it off — and again on every skeleton render,
    // shifting the table sideways on each reload.
    const fixture = render([makeAthlete({ id: 1, attendance_month_count: 6 })]);
    expect(fixture.componentInstance.hasAttendanceCounts()).toBe(true);

    const list = TestBed.inject(AthleteService).list as unknown as Mock;
    list.mockReturnValue(
      of({ data: [], meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 } }),
    );
    fixture.componentInstance.onSearchInput('zzz');
    fixture.componentInstance.resetFilters();
    fixture.detectChanges();

    // An empty page proves nothing about the server, so it must not
    // un-prove what an earlier page already showed.
    expect(fixture.componentInstance.hasAttendanceCounts()).toBe(true);
    expect(el(fixture, '[data-cy="athletes-th-attendance"]')).not.toBeNull();
  });
});

describe('AthletesListComponent — sessions out of sessions held (#1455)', () => {
  function makeAthlete(over: Partial<Athlete> = {}): Athlete {
    return {
      id: 1,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: null,
      phone_country_code: null,
      phone_national_number: null,
      address: null,
      date_of_birth: null,
      belt: 'white',
      stripes: 0,
      status: 'active',
      joined_at: '2026-09-01',
      created_at: '2026-01-01T00:00:00Z',
      attendance_month_count: 2,
      attendance_total_count: 2,
      ...over,
    } as Athlete;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
        { provide: PaymentService, useClass: FakePaymentService },
        ...provideI18nTesting(),
      ],
    });
  });

  function render(
    rows: Athlete[],
    trainingDays: number[] | null = [1, 2, 3, 4, 5, 6, 0],
    season: { season_start: string; season_label: string } | null = null,
  ) {
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: trainingDays,
      ...(season ?? {}),
    } as unknown as Academy);
    const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
    athleteService.list.mockReturnValue(
      of({
        data: rows,
        meta: { total: rows.length, current_page: 1, per_page: 20, last_page: 1 },
      }),
    );
    const fixture = TestBed.createComponent(AthletesListComponent);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * `YYYY-MM-DD`, n days before today.
   *
   * Relative rather than fixed because the component's windows all end at
   * `new Date()`, so a hard-coded season start would make the denominator
   * grow by one every day and the test fail tomorrow.
   */
  function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function text(fixture: ComponentFixture<AthletesListComponent>, sel: string): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(sel)?.textContent?.replace(/\s+/g, '') ??
      ''
    );
  }

  it('writes each line as attended over sessions held', () => {
    // Training every day, so the denominator is "days elapsed this month" —
    // deterministic without freezing the clock, since both lines count the
    // same days the component does.
    const fixture = render([makeAthlete()]);

    expect(text(fixture, '.athlete-attendance__month')).toMatch(/^2\/\d+$/);
    expect(text(fixture, '.athlete-attendance__total')).toMatch(/^2\/\d+$/);
  });

  it('measures the total against the athlete, not against the academy', () => {
    // Someone who joined yesterday is compared to yesterday's sessions. The
    // alternative — every athlete over the academy's whole history — reports
    // a number about the gym and calls it the athlete's.
    const joinedToday = new Date();
    const iso = `${joinedToday.getFullYear()}-${String(joinedToday.getMonth() + 1).padStart(2, '0')}-${String(joinedToday.getDate()).padStart(2, '0')}`;
    const fixture = render([
      makeAthlete({ joined_at: iso, attendance_month_count: 1, attendance_total_count: 1 }),
    ]);

    // One session held since they joined today, and they were at it. No
    // season on this fixture, so the window is theirs alone.
    expect(text(fixture, '.athlete-attendance__total')).toBe('1/1');
  });

  it('drops the denominator when the academy has no schedule on file', () => {
    // Not a zero: nobody has said which days they train, so "out of how
    // many" has no answer and the cell shows the counts alone.
    const fixture = render([makeAthlete()], null);

    expect(text(fixture, '.athlete-attendance__month')).toBe('2');
    expect(text(fixture, '.athlete-attendance__total')).toBe('2');
  });

  it('says both windows in words for a screen reader', () => {
    // The stacking is the only thing distinguishing the two lines visually,
    // and a screen reader cannot see a layout.
    const fixture = render([makeAthlete()]);
    const label =
      (fixture.nativeElement as HTMLElement)
        .querySelector('.athlete-attendance')
        ?.getAttribute('aria-label') ?? '';

    expect(label).toContain('this month');
    expect(label).toContain('this season');
  });

  it('measures the lower line against the season, not the whole membership', () => {
    // A veteran of three years, in a season 20 days old. The denominator has
    // to be the season's sessions, not the academy's history — that is the
    // entire point of #1484, and the bug it replaces showed a 900-session
    // denominator next to a number that only ever counted this year.
    const fixture = render(
      [makeAthlete({ joined_at: '2023-01-10', attendance_total_count: 12 })],
      [1, 2, 3, 4, 5, 6, 0],
      { season_start: isoDaysAgo(19), season_label: '2025/26' },
    );

    // 20 days of a train-every-day schedule, inclusive of both ends.
    expect(text(fixture, '.athlete-attendance__total')).toBe('12/20');
  });

  it('starts a mid-season arrival at their own joining day', () => {
    // Joined ten days into a twenty-day season. Dividing them by the season's
    // twenty would report the academy's calendar as if it were their record.
    const fixture = render(
      [makeAthlete({ joined_at: isoDaysAgo(9), attendance_total_count: 4 })],
      [1, 2, 3, 4, 5, 6, 0],
      { season_start: isoDaysAgo(19), season_label: '2025/26' },
    );

    expect(text(fixture, '.athlete-attendance__total')).toBe('4/10');
  });

  it('names the season in the lower line\u2019s tooltip', () => {
    const fixture = render([makeAthlete({ joined_at: '2023-01-10' })], [1, 2, 3, 4, 5, 6, 0], {
      season_start: isoDaysAgo(19),
      season_label: '2025/26',
    });
    const tooltip = fixture.componentInstance as unknown as {
      sessionsTooltip: (a: Athlete) => string;
    };

    expect(tooltip.sessionsTooltip(makeAthlete({ joined_at: '2023-01-10' }))).toContain('2025/26');
  });

  it('says so in the tooltip when the athlete joined after the season opened', () => {
    // The half of #1484 the feedback asked for by name: without it a February
    // arrival reads as someone who misses most sessions, when the truth is
    // that most of the season happened before they existed.
    const joined = isoDaysAgo(9);
    const fixture = render([makeAthlete({ joined_at: joined })], [1, 2, 3, 4, 5, 6, 0], {
      season_start: isoDaysAgo(19),
      season_label: '2025/26',
    });
    const tooltip = fixture.componentInstance as unknown as {
      sessionsTooltip: (a: Athlete) => string;
    };
    const text_ = tooltip.sessionsTooltip(makeAthlete({ joined_at: joined }));

    expect(text_).toContain('2025/26');
    // The joining date itself, spelled out — so the shorter window is
    // explained rather than merely implied. Asserted against the formatted
    // date and not against `/\d{4}/`, which the `2025` inside the season
    // label already satisfies: that version passed whether or not the date
    // interpolated at all.
    const [y, m, d] = joined.split('-').map(Number);
    const spelled = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(text_).toContain(spelled);
  });

  it('shows no tooltip on the lower line until the academy has loaded', () => {
    // Naming a season we cannot name would be worse than saying nothing.
    const fixture = render([makeAthlete()]);
    const tooltip = fixture.componentInstance as unknown as {
      sessionsTooltip: (a: Athlete) => string;
    };

    expect(tooltip.sessionsTooltip(makeAthlete())).toBe('');
  });

  it('no longer draws the attendance summary widget beside the table', () => {
    // It answered the same question for the top five athletes that the
    // column now answers for every row.
    const fixture = render([makeAthlete()]);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-monthly-summary-widget'),
    ).toBeNull();
  });
});
