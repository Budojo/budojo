import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { Mock } from 'vitest';
import { AthletesListComponent } from './athletes-list.component';
import { AthleteService } from '../../../core/services/athlete.service';

class FakeAthleteService {
  readonly list = vi.fn(() =>
    of({ data: [], meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 } }),
  );
  readonly delete = vi.fn(() => of(void 0));
}

describe('AthletesListComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthletesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AthleteService, useClass: FakeAthleteService },
      ],
    });
  });

  describe('onSort allowlist (#101)', () => {
    // Stripes is meaningful only as a within-belt tiebreaker (handled in
    // `applyBeltSort()` on the backend). It's never the right primary sort,
    // so the table no longer offers it as a sortable column AND the runtime
    // allowlist rejects it defensively in case PrimeNG ever fires the event
    // anyway (e.g. via custom keyboard binding or external code).
    it('ignores field="stripes" — sortField stays at the previously-set value', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.onSort({ field: 'belt', order: -1 });
      expect(component.sortField()).toBe('belt');
      expect(component.sortOrder()).toBe('desc');

      component.onSort({ field: 'stripes', order: -1 });
      // Unchanged — 'stripes' was filtered out of the allowlist.
      expect(component.sortField()).toBe('belt');
      expect(component.sortOrder()).toBe('desc');
    });

    it('accepts every field in the allowlist as a primary sort', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Mirrors the runtime allowlist in `onSort()`. `created_at` is the
      // default-fallback column on the backend; keeping it explicitly
      // allowed lets the table fire `sort_by=created_at` in the (rare)
      // case a future header binds to it.
      for (const field of ['belt', 'first_name', 'last_name', 'joined_at', 'created_at'] as const) {
        component.onSort({ field, order: 1 });
        expect(component.sortField()).toBe(field);
      }
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
});
