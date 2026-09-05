import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
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
    phone_country_code: '+39',
    phone_national_number: '3331234567',
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

/**
 * The form loads the academy's price list on init (#1381). Every spec that
 * renders the component therefore has one extra pending request, and
 * `httpMock.verify()` would fail on it. Flush it here rather than teaching
 * each test about a field it isn't testing.
 */
function flushFeeTiers(httpMock: HttpTestingController, tiers: unknown[] = []): void {
  for (const req of httpMock.match('/api/v1/academy/fee-tiers')) {
    req.flush({ data: tiers });
  }
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
      ...provideI18nTesting(),
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

    it('renders the email input in create mode (only place to set it before the athlete exists)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('input#email')).not.toBeNull();
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

    it('renders inline BudojoFormField errors on empty-submit (#1050)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      // markAllAsTouched fires inside submit(); the *Error computeds
      // (toSignal(control.events)) re-render so first_name + last_name
      // (both required) surface inline errors via the wrapper.
      cmp.submit();
      fixture.detectChanges();

      const errors = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('small.budojo-form-field__error'),
      );
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it("POSTs payload and navigates to the new athlete's detail on success", () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const router = TestBed.inject(Router);
      const httpMock = TestBed.inject(HttpTestingController);

      cmp.form.setValue({
        first_name: 'Mario',
        last_name: 'Rossi',
        email: '',
        phone_country_code: '',
        phone_national_number: '',
        website: '',
        facebook: '',
        instagram: '',
        date_of_birth: null,
        belt: 'white',
        stripes: '0',
        status: 'active',
        joined_at: new Date(2026, 3, 23), // April 23 2026 local
        fee_tier_id: null,
        billing_period_months: 1,
        address: { line1: '', line2: '', city: '', postal_code: '', province: '', country: 'IT' },
      });

      cmp.submit();

      const req = httpMock.expectOne('/api/v1/athletes');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        fee_tier_id: null,
        billing_period_months: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        // Contact links (#162) — empty form fields serialize to `null`
        // on the wire, matching the server contract that treats `null`
        // as "clear this column".
        website: null,
        facebook: null,
        instagram: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2026-04-23',
        address: null,
      });
      req.flush({ data: makeAthlete({ id: 99, first_name: 'Mario', last_name: 'Rossi' }) });

      // After #281, on create we land directly on the new athlete's
      // detail (id taken from the response) instead of the list.
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes', 99]);
      flushFeeTiers(httpMock);
      httpMock.verify();
    });

    // ── #75 — structured phone pair ────────────────────────────────────────
    it('flags national number as required when only country code is filled (#75)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      cmp.phoneCountryCode.setValue('+39');
      cmp.phoneNationalNumber.markAsTouched();

      expect(cmp.phoneNationalNumber.errors?.['phonePairRequired']).toBe(true);
      expect(cmp.phoneCountryCode.errors).toBeNull();
    });

    it('flags country code as required when only national number is filled (#75)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      cmp.phoneNationalNumber.setValue('3331234567');
      cmp.phoneCountryCode.markAsTouched();

      expect(cmp.phoneCountryCode.errors?.['phonePairRequired']).toBe(true);
      expect(cmp.phoneNationalNumber.errors).toBeNull();
    });

    it('clears the pair error once both fields are filled (#75)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      cmp.phoneNationalNumber.setValue('3331234567');
      expect(cmp.phoneCountryCode.errors?.['phonePairRequired']).toBe(true);

      cmp.phoneCountryCode.setValue('+39');
      expect(cmp.phoneCountryCode.errors).toBeNull();
      expect(cmp.phoneNationalNumber.errors).toBeNull();
    });

    it('drops the pair error when the country code is cleared back to empty (#228)', () => {
      // Beta tester (Luigi) reported: tapping the CC dropdown locked
      // both fields. The underlying validator already handles
      // CC='' / null correctly; this test pins the behavior that the
      // new [showClear]="true" on the p-select relies on.
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      cmp.phoneCountryCode.setValue('+39');
      expect(cmp.phoneNationalNumber.errors?.['phonePairRequired']).toBe(true);

      // PrimeNG's [showClear] emits `null` to the form control at
      // runtime. The form is `fb.nonNullable.group(...)`, so the
      // strict-typed `setValue` rejects `null` at compile time — but the
      // runtime call is what we must exercise here, since that's the
      // exact thing the validator sees in production. The cast pins
      // the null path that `reset()` (which goes through the default
      // value, not null) would silently bypass.
      cmp.phoneCountryCode.setValue(null as unknown as string);
      expect(cmp.phoneCountryCode.errors).toBeNull();
      expect(cmp.phoneNationalNumber.errors).toBeNull();
    });

    it('rejects non-digit characters in the national number (#75)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      cmp.phoneNationalNumber.setValue('333 123 4567');
      expect(cmp.phoneNationalNumber.errors?.['pattern']).toBeTruthy();
    });

    it('sends the structured phone pair on submit (#75)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      cmp.form.setValue({
        first_name: 'Mario',
        last_name: 'Rossi',
        email: '',
        phone_country_code: '+39',
        phone_national_number: '3331234567',
        website: '',
        facebook: '',
        instagram: '',
        date_of_birth: null,
        belt: 'white',
        stripes: '0',
        status: 'active',
        joined_at: new Date(2026, 3, 23),
        fee_tier_id: null,
        billing_period_months: 1,
        address: { line1: '', line2: '', city: '', postal_code: '', province: '', country: 'IT' },
      });
      cmp.submit();

      const req = httpMock.expectOne('/api/v1/athletes');
      expect(req.request.body.phone_country_code).toBe('+39');
      expect(req.request.body.phone_national_number).toBe('3331234567');
      req.flush({
        data: makeAthlete({ phone_country_code: '+39', phone_national_number: '3331234567' }),
      });
      flushFeeTiers(httpMock);
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
      flushFeeTiers(httpMock);
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
      flushFeeTiers(httpMock);
      httpMock.verify();
    });

    it('hides the email INPUT in edit mode — the dedicated email-change-card on the detail page is the canonical editor', () => {
      // The form's `email` FormControl still exists (so the PUT
      // payload integrity is preserved when the action submits), but
      // the visible <input> is gated behind mode === 'create'. v2.1.0
      // user report: "two emails which one do I edit" — the form's
      // email field was the redundant third editor for `athletes.email`
      // alongside the detail-page email-change-card (the verification
      // flow lives there) and the form's own create-time entry. Closes
      // the duplication on edit.
      const athlete = makeAthlete({ id: 42 });
      const fixture = TestBed.createComponent(AthleteFormComponent);
      const httpMock = TestBed.inject(HttpTestingController);

      fixture.detectChanges();
      httpMock.expectOne('/api/v1/athletes/42').flush({ data: athlete });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('input#email')).toBeNull();
      // Control still on the form so the PUT body shape doesn't shift.
      expect(fixture.componentInstance.form.controls.email).toBeDefined();
      flushFeeTiers(httpMock);
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
      // PR #496 follow-up — `email` is omitted from the wire on edit,
      // not just hidden from the form. The dedicated email-change-card
      // is the canonical editor; sending email here would leak the
      // contract (Copilot review caught this). The form's `email`
      // FormControl still exists internally so the rest of the payload
      // serialization stays unaffected.
      expect('email' in putReq.request.body).toBe(false);
      putReq.flush({ data: { ...athlete, belt: 'black' } });

      const router = TestBed.inject(Router);
      // After #281, edit success returns to the parent detail (default
      // child tab Documents) instead of bouncing to the list — the
      // user stays in the page they were editing.
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes', 42]);
      flushFeeTiers(httpMock);
      httpMock.verify();
    });

    // ── #162 — contact-link hydration on edit ────────────────────────────────
    it('hydrates contact-link inputs from the loaded athlete', () => {
      const athlete = makeAthlete({
        id: 42,
        website: 'https://example.com',
        facebook: 'https://facebook.com/mario',
        instagram: 'https://instagram.com/mario',
      });
      const fixture = TestBed.createComponent(AthleteFormComponent);
      const httpMock = TestBed.inject(HttpTestingController);

      fixture.detectChanges();
      httpMock.expectOne('/api/v1/athletes/42').flush({ data: athlete });

      const cmp = fixture.componentInstance;
      expect(cmp.website.value).toBe('https://example.com');
      expect(cmp.facebook.value).toBe('https://facebook.com/mario');
      expect(cmp.instagram.value).toBe('https://instagram.com/mario');
      flushFeeTiers(httpMock);
      httpMock.verify();
    });
  });

  // ─── Contact links (#162) ─────────────────────────────────────────────────
  describe('contact links (#162)', () => {
    beforeEach(() => setupTestBed(null));

    it('persists contact links on POST when filled, sends null on the empty ones', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      cmp.form.patchValue({
        first_name: 'Mario',
        last_name: 'Rossi',
        joined_at: new Date(2026, 3, 23),
        website: 'https://example.com',
        facebook: '',
        instagram: 'https://instagram.com/mario',
      });
      cmp.submit();

      const req = httpMock.expectOne('/api/v1/athletes');
      expect(req.request.body.website).toBe('https://example.com');
      // Empty form input → `null` on the wire (clears the column).
      expect(req.request.body.facebook).toBeNull();
      expect(req.request.body.instagram).toBe('https://instagram.com/mario');
      req.flush({ data: makeAthlete() });
      flushFeeTiers(httpMock);
      httpMock.verify();
    });

    it('rejects a non-URL contact link at the form level (no network roundtrip)', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      // Bare @handle — backend would 422; the client validator catches it
      // first so the user gets inline feedback without the bounce.
      cmp.form.patchValue({
        first_name: 'Mario',
        last_name: 'Rossi',
        joined_at: new Date(2026, 3, 23),
        instagram: '@mario',
      });
      expect(cmp.instagram.errors?.['url']).toBe(true);

      cmp.submit();
      httpMock.expectNone('/api/v1/athletes');
    });

    it('rejects non-http/https schemes (mailto / javascript) at the form level', () => {
      const fixture = TestBed.createComponent(AthleteFormComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      // `URL` parses these as valid URIs but they're not what we want
      // for a "social profile" field — the validator filters by scheme.
      cmp.form.patchValue({ website: 'javascript:alert(1)' });
      expect(cmp.website.errors?.['url']).toBe(true);

      cmp.form.patchValue({ website: 'mailto:hi@example.com' });
      expect(cmp.website.errors?.['url']).toBe(true);

      cmp.form.patchValue({ website: 'https://example.com' });
      expect(cmp.website.errors).toBeNull();
    });
  });

  describe('cancel', () => {
    describe('from /athletes/new', () => {
      beforeEach(() => setupTestBed(null));

      it('navigates back to the athletes list', () => {
        const fixture = TestBed.createComponent(AthleteFormComponent);
        fixture.detectChanges();
        fixture.componentInstance.cancel();

        const router = TestBed.inject(Router);
        expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
      });
    });

    describe('from /athletes/:id/edit', () => {
      beforeEach(() => setupTestBed('42'));

      it('navigates back to the athlete detail (#281)', () => {
        const fixture = TestBed.createComponent(AthleteFormComponent);
        const httpMock = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
        // The form GET fires on init; flush it so the component is in
        // a stable state before we exercise cancel().
        httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete({ id: 42 }) });

        fixture.componentInstance.cancel();

        const router = TestBed.inject(Router);
        // Edit lives INSIDE the athlete detail as a sub-tab — cancel
        // returns to the parent so the header + tab strip remain
        // visible, instead of dumping the user out to the list.
        expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes', 42]);
        flushFeeTiers(httpMock);
        httpMock.verify();
      });
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
      flushFeeTiers(httpMock);
      httpMock.verify();
    });
  });
});
