import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AthleteDetailComponent } from './athlete-detail.component';
import { Athlete } from '../../../core/services/athlete.service';

// PrimeNG's <p-tabs> binds a ResizeObserver in ngAfterViewInit; jsdom
// doesn't ship one. The component is exercised once data arrives, so
// stub the constructor with a no-op to keep CD past the second pass.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver ??=
  ResizeObserverStub;

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
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
    ...overrides,
  };
}

function setupTestBed(
  idParam: string | null = '42',
  initialUrl = '/dashboard/athletes/42/documents',
): { http: HttpTestingController; routerEvents: Subject<unknown> } {
  const paramMap = convertToParamMap(idParam ? { id: idParam } : {});
  const routerEvents = new Subject<unknown>();
  TestBed.configureTestingModule({
    imports: [AthleteDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: Router,
        useValue: {
          navigate: vi.fn().mockResolvedValue(true),
          events: routerEvents.asObservable(),
          url: initialUrl,
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(paramMap),
          snapshot: { paramMap },
        },
      },
    ],
  });
  return { http: TestBed.inject(HttpTestingController), routerEvents };
}

describe('AthleteDetailComponent', () => {
  it('loads the athlete and exposes the full name', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.athlete()?.first_name).toBe('Mario');
    expect(fixture.componentInstance.fullName()).toBe('Mario Rossi');
    httpMock.verify();
  });

  it('redirects to the list when the id is non-numeric', () => {
    const { http: httpMock } = setupTestBed('abc');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    // No GET should fire for a NaN id.
    httpMock.expectNone((r) => r.url.startsWith('/api/v1/athletes/'));

    const router = TestBed.inject(Router);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
    httpMock.verify();
  });

  it('maps status to the expected p-tag severity', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.statusSeverity('active')).toBe('success');
    expect(fixture.componentInstance.statusSeverity('suspended')).toBe('warn');
    expect(fixture.componentInstance.statusSeverity('inactive')).toBe('secondary');
    httpMock.verify();
  });

  it('exposes an error message when loading the athlete fails', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/athletes/42')
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.error()).toBe('Could not load this athlete.');
    httpMock.verify();
  });

  it('reads the active tab from the current URL', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/attendance');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.activeTab()).toBe('attendance');
    httpMock.verify();
  });

  // ─── Contact links (#162 frontend half) ──────────────────────────────────
  // The header renders the populated subset as icon chips that open in a
  // new tab. Empty channels collapse silently — when ALL three are empty
  // the entire chip list is omitted (no row of grey placeholders).

  it('renders only the populated contact-link chips with the right icon + href', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({
      data: makeAthlete({
        website: 'https://example.com',
        facebook: 'https://facebook.com/mario',
        // instagram intentionally omitted — should NOT render a chip.
      }),
    });
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.contact-links a');
    expect(chips.length).toBe(2);
    expect(chips[0].getAttribute('href')).toBe('https://example.com');
    expect(chips[0].getAttribute('target')).toBe('_blank');
    expect(chips[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(chips[0].querySelector('i')?.className).toContain('pi-globe');
    expect(chips[1].getAttribute('href')).toBe('https://facebook.com/mario');
    expect(chips[1].querySelector('i')?.className).toContain('pi-facebook');

    // Sanity: no Instagram chip rendered.
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-link-instagram"]')).toBeNull();
    httpMock.verify();
  });

  it('omits the contact-link list entirely when no channel is populated', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({
      data: makeAthlete({ website: null, facebook: null, instagram: null }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.contact-links')).toBeNull();
    httpMock.verify();
  });
});
