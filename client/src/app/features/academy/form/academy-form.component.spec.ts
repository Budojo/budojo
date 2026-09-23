import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AcademyFormComponent } from './academy-form.component';
import { Academy, AcademyService, Address } from '../../../core/services/academy.service';
import { RuntimeService } from '../../../core/services/runtime.service';

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

function setup(cached: Academy | null = makeAcademy(), fresh?: Academy): Harness {
  TestBed.configureTestingModule({
    imports: [AcademyFormComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
      {
        provide: RuntimeService,
        useValue: {
          profile: signal(runtimeProfile),
          loaded: signal(true),
          has: signal(() => true),
        },
      },
    ],
  });
  TestBed.inject(AcademyService).academy.set(cached);

  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(AcademyFormComponent);
  fixture.detectChanges();
  const httpMock = TestBed.inject(HttpTestingController);
  // The form re-reads the academy on open for a fresh lock (#1802); the
  // server agrees with the cache unless a test says otherwise.
  if (cached) {
    httpMock.expectOne({ method: 'GET', url: '/api/v1/academy' }).flush({ data: fresh ?? cached });
    fixture.detectChanges();
  }
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock,
    router,
  };
}

let runtimeProfile: 'web' | 'desktop' = 'web';

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

  it('hides the training-day pills and sends no training_days while the timetable sets them (#1575)', () => {
    const { fixture, component, httpMock } = setup(
      makeAcademy({ classes_count: 3, training_days: [1, 3, 5] }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="academy-form-training-days"]')).toBeNull();
    expect(el.querySelector('[data-cy="academy-form-schedule-planner"]')).toBeNull();
    expect(el.querySelector('[data-cy="academy-form-training-days-derived"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="academy-form-open-timetable"]')?.getAttribute('href')).toBe(
      '/dashboard/academy/timetable',
    );

    component.submit();

    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.method).toBe('PATCH');
    // The server refuses it in this state; the form does not offer it.
    expect('training_days' in req.request.body).toBe(false);
    req.flush({ data: makeAcademy({ classes_count: 3 }) });
  });

  it('keeps the pills, and sends the days, when there is no timetable', () => {
    const { fixture, component, httpMock } = setup(makeAcademy({ classes_count: 0 }));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="academy-form-training-days"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="academy-form-training-days-derived"]')).toBeNull();

    component.setTrainingDays([1, 3]);
    component.submit();

    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.training_days).toEqual([1, 3]);
    req.flush({ data: makeAcademy({ training_days: [1, 3] }) });
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

  it('renders an inline BudojoFormField error on the name field after empty-submit (#1052)', () => {
    const { fixture, component } = setup();
    component.form.patchValue({ name: '' });

    // markAllAsTouched fires inside submit(); nameError (toSignal of
    // control.events) re-renders so the required name surfaces an
    // inline error via the wrapper.
    component.submit();
    fixture.detectChanges();

    const err = (fixture.nativeElement as HTMLElement).querySelector(
      'small.budojo-form-field__error',
    );
    expect(err?.textContent?.trim()).toBeTruthy();
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
      carnet_price_cents: null,
      carnet_entries: null,
      carnet_entry_unit: 'lesson',
      season_start_month: null,
      billing_from: null,
      training_days: null,
      // Unlocked (no athletes, timetable, lessons or programme yet), so the picker's
      // value rides along; the server accepts its own value unchanged.
      martial_art: 'bjj',
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
      carnet_price_cents: null,
      carnet_entries: null,
      carnet_entry_unit: 'lesson',
      season_start_month: null,
      billing_from: null,
      training_days: null,
      // Unlocked (no athletes, timetable, lessons or programme yet), so the picker's
      // value rides along; the server accepts its own value unchanged.
      martial_art: 'bjj',
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

describe('AcademyFormComponent — what one carnet entry covers (#1576)', () => {
  const unitField = (fixture: Harness['fixture']) =>
    fixture.nativeElement.querySelector('[data-cy="academy-form-carnet-entry-unit-field"]');

  it('asks only once both halves of the carnet offering are set', () => {
    const { fixture, component } = setup();
    expect(unitField(fixture)).toBeNull();

    component.form.patchValue({ carnet_price: 70 });
    fixture.detectChanges();
    expect(unitField(fixture)).toBeNull();

    component.form.patchValue({ carnet_entries: 10 });
    fixture.detectChanges();
    expect(unitField(fixture)).not.toBeNull();

    // Clearing either half takes the question away again.
    component.form.patchValue({ carnet_price: null });
    fixture.detectChanges();
    expect(unitField(fixture)).toBeNull();
  });

  it('hydrates the unit from the academy', () => {
    const { component } = setup(
      makeAcademy({ carnet_price_cents: 7000, carnet_entries: 10, carnet_entry_unit: 'day' }),
    );
    expect(component.form.controls.carnet_entry_unit.value).toBe('day');
  });

  it('defaults to the lesson when the server says nothing', () => {
    const { component } = setup(makeAcademy());
    expect(component.form.controls.carnet_entry_unit.value).toBe('lesson');
  });

  it('keeps the persisted unit when the offering is cleared, so hiding the question does not answer it', () => {
    // The control leaves the page when either half of the offering goes; the
    // value it holds must still be the academy's, or clearing the price would
    // silently flip a `day` academy back to lessons and recount every carnet.
    const { component, httpMock } = setup(
      makeAcademy({ carnet_price_cents: 7000, carnet_entries: 10, carnet_entry_unit: 'day' }),
    );
    component.form.patchValue({ carnet_price: null });
    component.submit();

    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.carnet_price_cents).toBeNull();
    expect(req.request.body.carnet_entry_unit).toBe('day');
    req.flush({ data: makeAcademy({ carnet_entry_unit: 'day' }) });
  });

  it('sends the chosen unit with the rest of the offering', () => {
    const { component, httpMock } = setup(
      makeAcademy({ carnet_price_cents: 7000, carnet_entries: 10 }),
    );
    component.form.patchValue({ carnet_entry_unit: 'day' });
    component.submit();

    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.carnet_price_cents).toBe(7000);
    expect(req.request.body.carnet_entries).toBe(10);
    expect(req.request.body.carnet_entry_unit).toBe('day');
    req.flush({ data: makeAcademy({ carnet_entry_unit: 'day' }) });
  });

  it("names the two answers in the reader's language", () => {
    const { fixture } = setup(makeAcademy({ carnet_price_cents: 7000, carnet_entries: 10 }));
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-cy="academy-form-carnet-entry-unit"] .p-togglebutton',
      ) as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['One lesson', 'A whole day']);
  });

  // #1627 — a permalink is a public URL, and this build has none.
  it('hides the permalink box on a build with no public URLs', () => {
    runtimeProfile = 'desktop';
    try {
      const { fixture } = setup();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-cy="academy-form-slug"]'),
      ).toBeNull();
    } finally {
      runtimeProfile = 'web';
    }
  });

  it('keeps it on the web', () => {
    const { fixture } = setup();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="academy-form-slug"]'),
    ).not.toBeNull();
  });

  // ─── Form polish (#1650) ───────────────────────────────────────────────

  describe('the optional address group', () => {
    it('marks no field with the asterisk that means required everywhere else', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement as HTMLElement;

      // Four red asterisks sat under a legend reading "(optional)", and the
      // legend then told you to fill "all marked fields" — the marker and
      // the word contradicted each other on the same line.
      expect(el.querySelectorAll('.required-when-filled')).toHaveLength(0);
      const legend = el.querySelector('.address-group legend');
      expect(legend?.textContent).toContain('fill them all');
    });
  });

  describe('the address placeholders', () => {
    it('follow the language, instead of being hardcoded Italian', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement as HTMLElement;
      const line2 = () => el.querySelector<HTMLInputElement>('#academy-address-line2');

      // They were written straight into the template — `Scala B, interno 4`
      // — so they stayed Italian whatever the sidebar said, and the i18n
      // parity spec could not see them at all.
      expect(line2()?.placeholder).toBe('Block B, flat 4');

      TestBed.inject(TranslateService).use('it');
      fixture.detectChanges();

      expect(line2()?.placeholder).toBe('Scala B, interno 4');
    });
  });

  // ─── Clearing the phone prefix (#1705) ───────────────────────────────────

  it('clears the phone through the ✕ instead of killing the Save button', () => {
    const { component, httpMock } = setup(
      makeAcademy({ phone_country_code: '+39', phone_national_number: '0111234567' }),
    );

    // The exact sequence the ✕ exists for (#1645): empty the number, then
    // clear the prefix. `showClear` writes null through the CVA, past the
    // `nonNullable` group's `string` type — which only describes `reset()`.
    component.form.controls.phone_national_number.setValue('');
    component.form.controls.phone_country_code.setValue(null as unknown as string);

    // Valid, because `phonePairRequired` normalises with `?? ''` — so this
    // reaches buildPayload rather than being stopped by submit()'s guard.
    expect(component.form.valid).toBe(true);

    component.submit();

    // It used to throw here, inside buildPayload and before submitting.set(true),
    // so the owner got no spinner, no toast, no error and no request — Salva
    // was simply dead until they reloaded.
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.phone_country_code).toBeNull();
    expect(req.request.body.phone_national_number).toBeNull();
    req.flush({ data: makeAcademy({ phone_country_code: null, phone_national_number: null }) });
  });
});

describe('AcademyFormComponent — when fees started being recorded here (#1742)', () => {
  it('hydrates the month picker from the cached academy', () => {
    const { component } = setup(makeAcademy({ billing_from: '2027-01-01' }));
    const control = component.form.controls.billing_from;

    expect(control.value).toBeInstanceOf(Date);
    // Local parts, not UTC: east of Greenwich `new Date('2027-01-01')` is
    // 31 December 2026 at 01:00, which would show the wrong month.
    expect((control.value as Date).getFullYear()).toBe(2027);
    expect((control.value as Date).getMonth()).toBe(0);
  });

  it('sends the first of the chosen month, built from local parts', () => {
    const { component } = setup(makeAcademy({ billing_from: null }));
    component.form.controls.billing_from.setValue(new Date(2027, 0, 17));

    expect(component['buildPayload']().billing_from).toBe('2027-01-01');
  });

  it('sends null when the owner clears it', () => {
    const { component } = setup(makeAcademy({ billing_from: '2027-01-01' }));
    component.form.controls.billing_from.setValue(null);

    // Null is "no floor", which restores the pre-#1742 ledger exactly — not
    // "since forever", and not "leave it as it was".
    expect(component['buildPayload']().billing_from).toBeNull();
  });
});

describe('AcademyFormComponent — the martial art (#1802)', () => {
  it('offers the picker while the martial art can still change', () => {
    const { fixture } = setup(makeAcademy({ martial_art: 'judo', martial_art_locked: false }));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-cy="martial-art-judo"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(el.querySelector('[data-cy="academy-form-martial-art-locked"]')).toBeNull();
  });

  it('sends the martial art the owner switched to', () => {
    const { fixture, component, httpMock } = setup(
      makeAcademy({ martial_art: 'bjj', martial_art_locked: false }),
    );

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-cy="martial-art-karate"]')!
      .click();
    component.submit();

    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body.martial_art).toBe('karate');
    expect(component.form.dirty).toBe(true);
  });

  it('takes the lock from the server, not from a cache older than the first athlete', () => {
    // Loaded unlocked, then the owner added an athlete: nothing refreshed
    // the cache, and the picker would have offered a change the server
    // refuses with a 422.
    const { fixture } = setup(
      makeAcademy({ martial_art: 'judo', martial_art_locked: false }),
      makeAcademy({ martial_art: 'judo', martial_art_locked: true }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-martial-art-picker')).toBeNull();
    expect(
      el.querySelector('[data-cy="academy-form-martial-art-locked"]')?.textContent?.trim(),
    ).toBe('Judo');
  });

  it('points the picker at its hint, which a group has no label to borrow', () => {
    const { fixture } = setup(makeAcademy({ martial_art_locked: false }));
    const el = fixture.nativeElement as HTMLElement;

    const group = el.querySelector('app-martial-art-picker [role="group"]');
    const hint = el.querySelector('#martial-art-hint');
    expect(group?.getAttribute('aria-describedby')).toBe('martial-art-hint');
    expect(hint?.textContent).toContain('It decides the belts and the programme.');
  });

  it('shows the martial art as text once it is locked, and never sends it', () => {
    const { fixture, component, httpMock } = setup(
      makeAcademy({ martial_art: 'taekwondo', martial_art_locked: true }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-martial-art-picker')).toBeNull();
    expect(
      el.querySelector('[data-cy="academy-form-martial-art-locked"]')?.textContent?.trim(),
    ).toBe('Taekwondo');
    expect(el.textContent).toContain(
      'Fixed now: the academy already has athletes, a timetable, lessons or a programme.',
    );

    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    // A locked academy answers any value but its own with a 422, and the
    // form has nothing to add: the key stays off the wire.
    expect('martial_art' in req.request.body).toBe(false);
  });
});
