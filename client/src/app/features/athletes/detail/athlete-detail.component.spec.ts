import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AthleteDetailComponent } from './athlete-detail.component';
import { Athlete } from '../../../core/services/athlete.service';

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 42,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'mario@example.com',
    phone: null,
    date_of_birth: '1990-05-15',
    belt: 'blue',
    stripes: 2,
    status: 'active',
    joined_at: '2023-01-10',
    created_at: '2026-04-22T10:00:00+00:00',
    ...overrides,
  };
}

function setupTestBed(idParam: string | null = '42'): HttpTestingController {
  const paramMap = convertToParamMap(idParam ? { id: idParam } : {});
  TestBed.configureTestingModule({
    imports: [AthleteDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(paramMap),
          snapshot: { paramMap },
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('AthleteDetailComponent', () => {
  it('loads the athlete and exposes the full name', () => {
    const httpMock = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.athlete()?.first_name).toBe('Mario');
    expect(fixture.componentInstance.fullName()).toBe('Mario Rossi');
    httpMock.verify();
  });

  it('redirects to the list when the id is non-numeric', () => {
    const httpMock = setupTestBed('abc');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    // No GET should fire for a NaN id.
    httpMock.expectNone((r) => r.url.startsWith('/api/v1/athletes/'));

    const router = TestBed.inject(Router);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
    httpMock.verify();
  });

  it('maps status to the expected p-tag severity', () => {
    const httpMock = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.statusSeverity('active')).toBe('success');
    expect(fixture.componentInstance.statusSeverity('suspended')).toBe('warn');
    expect(fixture.componentInstance.statusSeverity('inactive')).toBe('secondary');
    httpMock.verify();
  });

  it('exposes an error message when loading the athlete fails', () => {
    const httpMock = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/athletes/42')
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.error()).toBe('Could not load this athlete.');
    httpMock.verify();
  });
});
