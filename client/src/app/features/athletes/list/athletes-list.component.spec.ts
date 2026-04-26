import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AthletesListComponent } from './athletes-list.component';
import { AthleteService } from '../../../core/services/athlete.service';

class FakeAthleteService {
  readonly list = vi.fn(() =>
    of({ data: [], meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 } }),
  );
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

    it('accepts belt / first_name / last_name / joined_at as primary sorts', () => {
      const fixture = TestBed.createComponent(AthletesListComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      for (const field of ['belt', 'first_name', 'last_name', 'joined_at'] as const) {
        component.onSort({ field, order: 1 });
        expect(component.sortField()).toBe(field);
      }
    });
  });
});
