import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

  describe('Belt 2-state sort cycle (#210)', () => {
    // The Belt header has its own custom click handler (replacing the
    // dropped pSortableColumn + p-sort-icon pair, see #205 / #210). The
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

    it('resetFilters clears `?paid` from the URL so refresh-after-reset stays clean (#803 reviewer)', async () => {
      // Reviewer finding on PR #804: `resetFilters()` mutated the
      // signal directly without dropping the URL param; a refresh
      // after Reset re-applied the just-cleared `paid=no` filter
      // because the URL was the source of truth post-#803.
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });
      const router = TestBed.inject(Router);
      await router.navigate([], { queryParams: { paid: 'no' } });

      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.selectedPaid()).toBe('no');

      component.resetFilters();
      await fixture.whenStable();

      expect(component.selectedPaid()).toBe('');
      expect(router.url).not.toContain('paid=');
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

    it('Paid column header carries the current month abbreviation (#282)', () => {
      // Header should read "Paid · Apr" (or whatever the current month
      // is) so an instructor doesn't have to guess which month the
      // status refers to. We don't pin a specific month here — that
      // would make the test break every time the wall clock crosses
      // a month boundary — but we DO assert the prefix + the
      // separator + a 3-letter abbreviation matching the component's
      // own derivation.
      const academyService = TestBed.inject(AcademyService);
      academyService.academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const headerText = fixture.nativeElement
        .querySelector('[data-cy="athletes-th-paid"]')
        ?.textContent?.trim();
      const expected = `Paid · ${fixture.componentInstance.currentMonthShort()}`;
      expect(headerText).toBe(expected);

      // Sanity-check that the derived month is a recognisable
      // 3-letter English abbreviation — guards against a future
      // refactor that changes the format token (e.g. "month: 'numeric'")
      // and silently breaks the contract.
      expect(fixture.componentInstance.currentMonthShort()).toMatch(/^[A-Z][a-z]{2}$/);
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
  // that routes through <p-confirm-dialog key="athlete-delete-mobile">
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

    it('openCardMenu populates cardMenuItems with the expanded quick-actions set (#985)', () => {
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
      // 5 items: attendance, documents, promotions, edit, delete. The
      // conditional Payments + Public profile entries are exercised in
      // the follow-up assertions below.
      expect(items).toHaveLength(5);
      const icons = items.map((it) => it.icon);
      expect(icons).toEqual([
        'pi pi-calendar',
        'pi pi-file',
        'pi pi-trophy',
        'pi pi-pencil',
        'pi pi-trash',
      ]);
      const last = items[items.length - 1];
      expect(last?.styleClass).toBe('menu-item--danger');
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

    it('confirmDeleteFromCardMenu routes through ConfirmationService with the mobile dialog key', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();
      // ConfirmationService is declared in the component's `providers: []`
      // (component-scoped), so resolve it through the component's element
      // injector rather than the TestBed root.
      const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
      const confirmSpy = vi.spyOn(confirmationService, 'confirm');

      const component = fixture.componentInstance as unknown as {
        confirmDeleteFromCardMenu: (athlete: Athlete) => void;
      };

      component.confirmDeleteFromCardMenu(makeAthlete({ id: 99, first_name: 'Anna' }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      const config = confirmSpy.mock.calls[0]![0] as {
        key?: string;
        message?: string;
        acceptButtonProps?: { severity?: string };
        accept?: () => void;
      };
      expect(config.key).toBe('athlete-delete-mobile');
      expect(config.message).toContain('Anna');
      expect(config.acceptButtonProps?.severity).toBe('danger');

      // The accept callback must reach the same delete(athlete) path the
      // desktop popup uses; assert via the AthleteService spy.
      const athleteService = TestBed.inject(AthleteService) as unknown as FakeAthleteService;
      config.accept?.();
      expect(athleteService.delete).toHaveBeenCalledTimes(1);
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
      expect(tbody?.querySelectorAll('app-paid-badge').length).toBe(1);
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
            makeAthlete({ id: 11, status: 'suspended', paid_current_month: false }),
            makeAthlete({ id: 12, status: 'inactive', paid_current_month: false }),
          ],
          meta: { total: 3, current_page: 1, per_page: 20, last_page: 1 },
        }),
      );

      const fixture = TestBed.createComponent(AthletesListComponent);
      fixture.detectChanges();

      const tbody = (fixture.nativeElement as HTMLElement).querySelector('tbody');
      // Two em-dash placeholders (suspended + inactive); one paid-badge
      // (active). The Owner-as-athlete branch is not exercised here
      // (all three rows have is_self=false from `makeAthlete` default).
      expect(tbody?.querySelectorAll('.athlete-paid-empty').length).toBe(2);
      expect(tbody?.querySelectorAll('app-paid-badge').length).toBe(1);
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

  it('does not expect payment from a suspended athlete', () => {
    expect(predicate()(athlete({ status: 'suspended' }))).toBe(true);
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
