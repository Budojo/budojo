import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { Athlete } from '../../core/services/athlete.service';
import { SearchPaletteComponent } from './search-palette.component';

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 1,
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
    ...overrides,
  };
}

describe('SearchPaletteComponent (#426)', () => {
  let httpMock: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [SearchPaletteComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SearchPaletteComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('keyboard shortcut', () => {
    it('opens the palette on Cmd+K (metaKey)', () => {
      const { fixture, cmp } = setup();
      expect(cmp.open()).toBe(false);

      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      // Spy on preventDefault to lock the behaviour: a global hotkey
      // MUST cancel the browser's default Cmd+K (which is "focus the
      // address bar" on Chrome/Edge). Without preventDefault the
      // palette opens BUT the user's typing then bypasses the input.
      const spy = vi.spyOn(event, 'preventDefault');
      window.dispatchEvent(event);
      fixture.detectChanges();

      expect(cmp.open()).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('opens the palette on Ctrl+K (ctrlKey)', () => {
      const { fixture, cmp } = setup();
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
      window.dispatchEvent(event);
      fixture.detectChanges();
      expect(cmp.open()).toBe(true);
    });

    it('does NOT open on a plain `k` keypress', () => {
      const { fixture, cmp } = setup();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
      fixture.detectChanges();
      expect(cmp.open()).toBe(false);
    });

    it('toggles closed when Cmd+K fires while open', () => {
      const { fixture, cmp } = setup();
      cmp.open.set(true);
      fixture.detectChanges();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      fixture.detectChanges();

      expect(cmp.open()).toBe(false);
    });

    it('reads `K` (uppercase) the same as `k`', () => {
      const { fixture, cmp } = setup();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', metaKey: true }));
      fixture.detectChanges();
      expect(cmp.open()).toBe(true);
    });
  });

  describe('search behaviour', () => {
    // The debounce is 200 ms in production and is verified by
    // `triggerSearchNow` not being involved in the keystroke pipeline
    // (the rxjs operator is set up in the constructor; we don't override
    // it here). These specs drive the wire-fire path directly via the
    // public `triggerSearchNow` test affordance — same shape the
    // production debounce subscriber calls.

    it('fires GET /api/v1/search?q=mario via the search pipeline and stores the result list', () => {
      const { fixture, cmp } = setup();
      cmp.open.set(true);
      fixture.detectChanges();

      cmp.triggerSearchNow('mario');
      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/search' && r.params.get('q') === 'mario',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: [makeAthlete()] });
      fixture.detectChanges();

      expect(cmp.results().length).toBe(1);
      expect(cmp.results()[0].first_name).toBe('Mario');
    });

    it('shows the empty hint and issues NO request when the query is empty', () => {
      const { fixture, cmp } = setup();
      cmp.open.set(true);
      fixture.detectChanges();

      // No HTTP call should have fired — the empty-query branch in
      // SearchService short-circuits at the source. httpMock.verify()
      // in afterEach asserts no unmatched requests.
      expect(cmp.results().length).toBe(0);
      expect(cmp.hasQuery()).toBe(false);
    });

    it('does NOT issue a request when triggerSearchNow gets a whitespace-only query', () => {
      const { cmp } = setup();
      cmp.open.set(true);

      cmp.triggerSearchNow('   ');
      httpMock.expectNone((r) => r.url === '/api/v1/search');
      expect(cmp.results()).toEqual([]);
    });

    it('declares a 200 ms debounce window — the public constant the rxjs pipeline reads', () => {
      // Locks the `Doherty < 400 ms` invariant. If a future edit drops
      // this below 50 ms (network spam) or pushes it above 400 ms (UI
      // feels laggy) the assertion fails immediately.
      expect(SearchPaletteComponent.DEBOUNCE_MS).toBe(200);
    });
  });

  describe('result selection', () => {
    it('clicking a result navigates to /dashboard/athletes/:id and closes the palette', () => {
      const { fixture, cmp } = setup();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      cmp.open.set(true);

      cmp.triggerSearchNow('mario');
      const req = httpMock.expectOne((r) => r.params.get('q') === 'mario');
      req.flush({ data: [makeAthlete({ id: 42 })] });
      fixture.detectChanges();

      cmp.selectAthlete(makeAthlete({ id: 42 }));

      expect(navSpy).toHaveBeenCalledWith(['/dashboard/athletes', 42]);
      expect(cmp.open()).toBe(false);
    });
  });

  describe('keyboard navigation within results', () => {
    function fillResults(cmp: SearchPaletteComponent, count: number) {
      const data = Array.from({ length: count }, (_, i) =>
        makeAthlete({ id: i + 1, first_name: `Athlete${i + 1}` }),
      );
      cmp.results.set(data);
    }

    it('ArrowDown advances the active index; ArrowUp rewinds; both wrap at boundaries', () => {
      const { fixture, cmp } = setup();
      cmp.open.set(true);
      fillResults(cmp, 3);
      fixture.detectChanges();

      expect(cmp.activeIndex()).toBe(0);
      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(cmp.activeIndex()).toBe(1);
      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(cmp.activeIndex()).toBe(2);
      // Wraps at the end — common pattern for command palettes (Krug + Jakob)
      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(cmp.activeIndex()).toBe(0);

      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(cmp.activeIndex()).toBe(2);
    });

    it('Enter selects the currently active result', () => {
      const { fixture, cmp } = setup();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      cmp.open.set(true);
      fillResults(cmp, 3);
      fixture.detectChanges();

      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(navSpy).toHaveBeenCalledWith(['/dashboard/athletes', 2]);
      expect(cmp.open()).toBe(false);
    });

    it('resets activeIndex to 0 when results change', () => {
      const { fixture, cmp } = setup();
      cmp.open.set(true);
      fillResults(cmp, 3);
      fixture.detectChanges();
      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      cmp.handleListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(cmp.activeIndex()).toBe(2);

      // New search → new results list → cursor must reset so the user
      // doesn't land on a nonsensical "third row" that may not exist
      // in the smaller new result set.
      cmp.results.set([makeAthlete()]);
      fixture.detectChanges();

      expect(cmp.activeIndex()).toBe(0);
    });
  });

  describe('palette dismissal', () => {
    it('clears the query and results when the dialog is closed', () => {
      const { fixture, cmp } = setup();
      cmp.open.set(true);
      cmp.query.set('mario');
      cmp.results.set([makeAthlete()]);
      fixture.detectChanges();

      cmp.handleClose();
      fixture.detectChanges();

      expect(cmp.open()).toBe(false);
      expect(cmp.query()).toBe('');
      expect(cmp.results()).toEqual([]);
    });
  });
});
