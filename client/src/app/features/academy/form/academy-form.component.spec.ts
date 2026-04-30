import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AcademyFormComponent } from './academy-form.component';
import { Academy, AcademyService, Address } from '../../../core/services/academy.service';

function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    line1: 'Via Roma 1',
    line2: null,
    city: 'Torino',
    postal_code: '10100',
    province: 'TO',
    country: 'IT',
    ...overrides,
  };
}

function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 1,
    name: 'Gracie Barra Torino',
    slug: 'gracie-barra-torino-a1b2c3d4',
    address: makeAddress(),
    logo_url: null,
    ...overrides,
  };
}

interface Harness {
  fixture: ReturnType<typeof TestBed.createComponent<AcademyFormComponent>>;
  component: AcademyFormComponent;
  httpMock: HttpTestingController;
  router: Router;
}

function setup(cached: Academy | null = makeAcademy()): Harness {
  TestBed.configureTestingModule({
    imports: [AcademyFormComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(AcademyService).academy.set(cached);

  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(AcademyFormComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
    router,
  };
}

describe('AcademyFormComponent', () => {
  it('pre-populates the form from the cached academy signal', () => {
    const { component } = setup(
      makeAcademy({
        name: 'Checkmat Milano',
        address: makeAddress({
          line1: 'Via Milano 5',
          city: 'Milano',
          postal_code: '20100',
          province: 'MI',
        }),
      }),
    );
    expect(component.form.value.name).toBe('Checkmat Milano');
    expect(component.form.value.address?.line1).toBe('Via Milano 5');
    expect(component.form.value.address?.city).toBe('Milano');
    expect(component.form.value.address?.province).toBe('MI');
    expect(component.slug()).toBe('gracie-barra-torino-a1b2c3d4');
  });

  it('renders empty address fields when the cached academy has a null address', () => {
    const { component } = setup(makeAcademy({ address: null }));
    expect(component.form.value.address?.line1).toBe('');
    expect(component.form.value.address?.city).toBe('');
    expect(component.form.value.address?.postal_code).toBe('');
    expect(component.form.value.address?.province).toBe('');
    // Country defaults to IT — non-empty so the all-or-nothing validator
    // doesn't see it as a "filled" signal on its own.
    expect(component.form.value.address?.country).toBe('IT');
  });

  it('redirects to the detail page when the signal is unset on init (defensive)', () => {
    const { router } = setup(null);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/academy']);
  });

  it('blocks submission when the name is empty or whitespace-only', () => {
    const { component, httpMock } = setup();
    component.form.patchValue({ name: '   ' });
    component.submit();
    httpMock.expectNone('/api/v1/academy');
    expect(component.name.errors?.['whitespace']).toBe(true);
  });

  it('blocks submission when the name exceeds 255 characters', () => {
    const { component, httpMock } = setup();
    component.form.patchValue({ name: 'x'.repeat(256) });
    component.submit();
    httpMock.expectNone('/api/v1/academy');
    expect(component.name.errors?.['maxlength']).toBeTruthy();
  });

  it('PATCHes with the structured address payload and redirects to detail on 200', () => {
    const { component, httpMock, router } = setup();
    component.form.patchValue({
      name: '  New Name  ',
      address: {
        line1: '  Via Nuova 10  ',
        line2: null,
        city: '  Roma  ',
        postal_code: '00100',
        province: 'RM',
        country: 'IT',
      },
    });

    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      name: 'New Name',
      phone_country_code: null,
      phone_national_number: null,
      // Contact links (#162) — empty form fields serialize to `null`
      // on the wire, matching the server contract that treats `null`
      // as "clear this column" and an absent key as "leave untouched".
      website: null,
      facebook: null,
      instagram: null,
      address: {
        line1: 'Via Nuova 10',
        line2: null,
        city: 'Roma',
        postal_code: '00100',
        province: 'RM',
        country: 'IT',
      },
      // Monthly fee (#267) — `null` because makeAcademy() default has
      // no fee set, so the form-level control hydrates to null and
      // serializes to null on the wire.
      monthly_fee_cents: null,
      training_days: null,
    });
    req.flush({
      data: makeAcademy({
        name: 'New Name',
        address: makeAddress({
          line1: 'Via Nuova 10',
          city: 'Roma',
          postal_code: '00100',
          province: 'RM',
        }),
      }),
    });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/academy']);
  });

  it('sends address: null on the wire when the user clears every required field', () => {
    // Server contract: a missing key leaves the value untouched; only an
    // explicit `null` clears the morph row. Exercising the path that lets
    // a user remove an existing address from the academy.
    const { component, httpMock } = setup();
    component.form.patchValue({
      name: 'Kept Name',
      address: {
        line1: '   ',
        line2: null,
        city: '   ',
        postal_code: '',
        province: '',
        country: 'IT',
      },
    });

    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body).toEqual({
      name: 'Kept Name',
      phone_country_code: null,
      phone_national_number: null,
      website: null,
      facebook: null,
      instagram: null,
      address: null,
      monthly_fee_cents: null,
      training_days: null,
    });
    req.flush({ data: makeAcademy({ address: null }) });
  });

  it('blocks submission when only some address fields are filled (all-or-nothing)', () => {
    const { component, httpMock } = setup(makeAcademy({ address: null }));
    // Fills only line1 — the cross-field validator should mark the group
    // as invalid and prevent the PATCH from going out.
    component.form.patchValue({
      name: 'Some Name',
      address: {
        line1: 'Via Nuova 10',
        line2: null,
        city: '',
        postal_code: '',
        province: '',
        country: 'IT',
      },
    });

    component.submit();
    httpMock.expectNone('/api/v1/academy');
    expect(component.addressGroup.errors?.['addressIncomplete']).toBe(true);
  });

  it('rejects an Italian CAP that is not exactly 5 digits at the field level', () => {
    const { component } = setup(makeAcademy({ address: null }));
    component.form.patchValue({ address: { postal_code: '123' } });
    expect(component.addressPostalCode.errors?.['pattern']).toBeTruthy();
  });

  it('surfaces a 422 validation error inline, without navigating away', () => {
    const { component, router, httpMock } = setup();
    component.form.patchValue({ name: 'New Name' });
    component.submit();

    httpMock.expectOne('/api/v1/academy').flush(
      { message: 'Invalid', errors: { name: ['Name is already taken.'] } },
      {
        status: 422,
        statusText: 'Unprocessable',
      },
    );

    expect(component.error()).toBe('Name is already taken.');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  it('falls back to a generic message on a 5xx', () => {
    const { component, httpMock } = setup();
    component.form.patchValue({ name: 'New Name' });
    component.submit();

    httpMock.expectOne('/api/v1/academy').flush('boom', {
      status: 500,
      statusText: 'Internal Server Error',
    });

    expect(component.error()).toMatch(/something went wrong/i);
  });

  it('on 403 clears the academy cache and redirects to /dashboard so guards can re-decide', () => {
    const { component, router, httpMock } = setup();
    const service = TestBed.inject(AcademyService);
    component.form.patchValue({ name: 'New Name' });
    component.submit();

    httpMock
      .expectOne('/api/v1/academy')
      .flush({ message: 'Forbidden.' }, { status: 403, statusText: 'Forbidden' });

    expect(service.academy()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('cancel() navigates back to the detail page without submitting', () => {
    const { component, router, httpMock } = setup();
    component.cancel();
    httpMock.expectNone('/api/v1/academy');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/academy']);
  });

  // ─── Contact links (#162) ───────────────────────────────────────────────────

  it('persists contact links on PATCH when filled, sends null on the empty ones', () => {
    const { component, httpMock } = setup();
    component.form.patchValue({
      name: 'Kept',
      website: 'https://gracie-barra.com',
      facebook: '',
      instagram: 'https://instagram.com/graciebarra',
    });

    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.website).toBe('https://gracie-barra.com');
    // Empty form input → `null` on the wire (clears the column).
    expect(req.request.body.facebook).toBeNull();
    expect(req.request.body.instagram).toBe('https://instagram.com/graciebarra');
    req.flush({ data: makeAcademy() });
  });

  it('rejects a non-URL contact link at the form level (no network roundtrip)', () => {
    const { component, httpMock } = setup();
    // Bare @handle — backend would 422; the client validator catches it
    // first so the user gets inline feedback without the bounce.
    component.form.patchValue({ name: 'Some', instagram: '@graciebarra' });
    expect(component.instagram.errors?.['url']).toBe(true);

    component.submit();
    httpMock.expectNone('/api/v1/academy');
  });

  it('rejects non-http/https schemes (mailto / javascript) at the form level', () => {
    const { component } = setup();
    // `URL` parses these as valid URIs but they're not what we want
    // for a "social profile" field — the validator filters by scheme.
    component.form.patchValue({ website: 'javascript:alert(1)' });
    expect(component.website.errors?.['url']).toBe(true);

    component.form.patchValue({ website: 'mailto:hi@example.com' });
    expect(component.website.errors?.['url']).toBe(true);

    component.form.patchValue({ website: 'https://example.com' });
    expect(component.website.errors).toBeNull();
  });

  it('hydrates contact-link inputs from the cached academy on init', () => {
    const { component } = setup(
      makeAcademy({
        website: 'https://gracie-barra.com',
        facebook: 'https://facebook.com/graciebarra',
        instagram: 'https://instagram.com/graciebarra',
      }),
    );
    expect(component.website.value).toBe('https://gracie-barra.com');
    expect(component.facebook.value).toBe('https://facebook.com/graciebarra');
    expect(component.instagram.value).toBe('https://instagram.com/graciebarra');
  });

  // ─── Monthly fee (#267) ─────────────────────────────────────────────────────

  it('hydrates the monthly_fee input in euros from the cached cents value', () => {
    const { component } = setup(makeAcademy({ monthly_fee_cents: 5000 }));
    // 5000 cents → 50 euros at the form layer. The wire-level token
    // stays cents; the form is euros for human input.
    expect(component.monthlyFee.value).toBe(50);
  });

  it('hydrates monthly_fee to null when the cached fee_cents is null (no fee set)', () => {
    const { component } = setup(makeAcademy({ monthly_fee_cents: null }));
    expect(component.monthlyFee.value).toBeNull();
  });

  it('PATCHes monthly_fee_cents = euros × 100 on submit', () => {
    const { component, httpMock } = setup();
    component.form.patchValue({ name: 'Some', monthly_fee: 50 });
    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.monthly_fee_cents).toBe(5000);
    req.flush({ data: makeAcademy({ monthly_fee_cents: 5000 }) });
  });

  it('rounds half-euro fees to the nearest cent (no float artefacts)', () => {
    // 50.5 euros × 100 = 5049.999999999999 in IEEE 754. The buildPayload
    // uses Math.round so the wire value is an integer the server's
    // `integer` validator accepts.
    const { component, httpMock } = setup();
    component.form.patchValue({ name: 'Some', monthly_fee: 50.5 });
    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.monthly_fee_cents).toBe(5050);
    expect(Number.isInteger(req.request.body.monthly_fee_cents)).toBe(true);
    req.flush({ data: makeAcademy({ monthly_fee_cents: 5050 }) });
  });

  it('null round-trips — clearing the fee sends monthly_fee_cents: null on the wire', () => {
    // User had a fee, clears the input, submits → server side is told
    // explicitly to set the column to NULL (the v1.7.0 payments features
    // hide again).
    const { component, httpMock } = setup(makeAcademy({ monthly_fee_cents: 5000 }));
    expect(component.monthlyFee.value).toBe(50);
    component.form.patchValue({ monthly_fee: null });
    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.monthly_fee_cents).toBeNull();
    req.flush({ data: makeAcademy({ monthly_fee_cents: null }) });
  });

  it('rejects a negative monthly fee at the form level (no network roundtrip)', () => {
    const { component, httpMock } = setup();
    component.form.patchValue({ name: 'Some', monthly_fee: -1 });
    expect(component.monthlyFee.errors?.['min']).toBeTruthy();
    component.submit();
    httpMock.expectNone('/api/v1/academy');
  });
});
