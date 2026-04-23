import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AthleteFormComponent } from './athlete-form.component';
import { Athlete } from '../../../core/services/athlete.service';

// `of` is needed below to provide the paramMap as an Observable on the mocked
// ActivatedRoute — the component subscribes to it (not the snapshot) so it
// reloads if the `:id` changes while the component instance is reused.

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 1,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'mario@example.com',
    phone: '+39 333 123456',
    date_of_birth: '1990-05-15',
    belt: 'blue',
    stripes: 2,
    status: 'active',
    joined_at: '2023-01-10',
    created_at: '2026-04-22T10:00:00+00:00',
    ...overrides,
  };
}

function setupTestBed(routeId: string | null = null): void {
  const paramMap = convertToParamMap(routeId ? { id: routeId } : {});
  TestBed.configureTestingModule({
    imports: [AthleteFormComponent],
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
}

describe('AthleteFormComponent', () => {
  describe('create mode (no :id route param)', () => {
    beforeEach(() => setupTestBed(null));

    it('defaults to create mode with an empty form', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      expect(cmp.mode()).toBe('create');
      expect(cmp.form.controls.first_name.value).toBe('');
      expect(cmp.form.controls.belt.value).toBe('white');
      expect(cmp.form.controls.stripes.value).toBe('0');
      expect(cmp.form.controls.status.value).toBe('active');
    });

    it('marks the form as invalid when required fields are empty', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      cmp.submit();
      expect(cmp.firstName.invalid).toBe(true);
      expect(cmp.lastName.invalid).toBe(true);
      expect(cmp.firstName.touched).toBe(true);
    });

    it('POSTs payload and navigates to /dashboard/athletes on success', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const router = TestBed.inject(Router);
      const httpMock = TestBed.inject(HttpTestingController);

      cmp.form.setValue({
        first_name: 'Mario',
        last_name: 'Rossi',
        email: '',
        phone: '',
        date_of_birth: null,
        belt: 'white',
        stripes: '0',
        status: 'active',
        joined_at: new Date(2026, 3, 23), // April 23 2026 local
      });

      cmp.submit();

      const req = httpMock.expectOne('/api/v1/athletes');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2026-04-23',
      });
      req.flush({ data: makeAthlete({ first_name: 'Mario', last_name: 'Rossi' }) });

      expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
      httpMock.verify();
    });

    it('surfaces 422 server validation errors in the error signal', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      cmp.form.patchValue({
        first_name: 'Mario',
        last_name: 'Rossi',
        joined_at: new Date(2026, 3, 23),
      });
      cmp.submit();

      const req = httpMock.expectOne('/api/v1/athletes');
      req.flush(
        { message: 'Validation failed', errors: { email: ['The email has already been taken.'] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(cmp.error()).toBe('The email has already been taken.');
      httpMock.verify();
    });
  });

  describe('edit mode (:id route param)', () => {
    beforeEach(() => setupTestBed('42'));

    it('loads the athlete and patches the form', () => {
      const athlete = makeAthlete({ id: 42, belt: 'purple', stripes: 3 });
      const fixture = TestBed.createComponent(AthleteFormComponent);
      const httpMock = TestBed.inject(HttpTestingController);

      fixture.detectChanges(); // triggers ngOnInit

      const req = httpMock.expectOne('/api/v1/athletes/42');
      expect(req.request.method).toBe('GET');
      req.flush({ data: athlete });

      const cmp = fixture.componentInstance;
      expect(cmp.mode()).toBe('edit');
      expect(cmp.form.controls.first_name.value).toBe('Mario');
      expect(cmp.form.controls.belt.value).toBe('purple');
      expect(cmp.form.controls.stripes.value).toBe('3');
      expect(cmp.form.controls.email.value).toBe('mario@example.com');
      httpMock.verify();
    });

    it('PUTs payload to /api/v1/athletes/:id on submit', () => {
      const athlete = makeAthlete({ id: 42 });
      const fixture = TestBed.createComponent(AthleteFormComponent);
      const httpMock = TestBed.inject(HttpTestingController);

      fixture.detectChanges();
      httpMock.expectOne('/api/v1/athletes/42').flush({ data: athlete });

      const cmp = fixture.componentInstance;
      cmp.form.patchValue({ belt: 'black' });
      cmp.submit();

      const putReq = httpMock.expectOne('/api/v1/athletes/42');
      expect(putReq.request.method).toBe('PUT');
      expect(putReq.request.body.belt).toBe('black');
      putReq.flush({ data: { ...athlete, belt: 'black' } });

      const router = TestBed.inject(Router);
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
      httpMock.verify();
    });
  });

  describe('cancel', () => {
    beforeEach(() => setupTestBed(null));

    it('navigates back to /dashboard/athletes', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      fixture.componentInstance.cancel();

      const router = TestBed.inject(Router);
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
    });
  });

  describe('invalid :id route param', () => {
    beforeEach(() => setupTestBed('not-a-number'));

    it('shows an error toast and redirects to /dashboard/athletes', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      const httpMock = TestBed.inject(HttpTestingController);

      fixture.detectChanges(); // ngOnInit

      // No GET should fire for a NaN id
      httpMock.expectNone((req) => req.url.startsWith('/api/v1/athletes/'));

      const router = TestBed.inject(Router);
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
      httpMock.verify();
    });
  });
});
