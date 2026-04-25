import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AcademyFormComponent } from './academy-form.component';
import { Academy, AcademyService } from '../../../core/services/academy.service';

function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 1,
    name: 'Gracie Barra Torino',
    slug: 'gracie-barra-torino-a1b2c3d4',
    address: 'Via Roma 1, Torino',
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
  // Spy on navigate so we can assert on it without actually routing — a
  // real navigation in tests needs registered routes and adds flakiness.
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
    const { component } = setup(makeAcademy({ name: 'Checkmat Milano', address: 'Via Milano 5' }));
    expect(component.form.value).toEqual({
      name: 'Checkmat Milano',
      address: 'Via Milano 5',
    });
    expect(component.slug()).toBe('gracie-barra-torino-a1b2c3d4');
  });

  it('renders empty-string address when the cached academy has a null address', () => {
    const { component } = setup(makeAcademy({ address: null }));
    // The form control needs a defined value — null would break the
    // nonNullable group contract. The convention is "empty string means
    // cleared" in the UI, with the payload translator writing `null` to
    // the wire on submit.
    expect(component.form.value.address).toBe('');
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

  it('PATCHes with trimmed name + address and redirects to detail on 200', () => {
    const { component, httpMock, router } = setup();
    component.form.patchValue({ name: '  New Name  ', address: '  Via Nuova 10  ' });

    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'New Name', address: 'Via Nuova 10' });
    req.flush({ data: makeAcademy({ name: 'New Name', address: 'Via Nuova 10' }) });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/academy']);
  });

  it('sends address: null on the wire when the user clears the textarea', () => {
    // Server contract: a missing key leaves the value untouched; only an
    // explicit `null` clears. This is the only way the UI can remove an
    // address once set, so exercising it in a test is high-value.
    const { component, httpMock } = setup();
    component.form.patchValue({ name: 'Kept Name', address: '   ' });

    component.submit();
    const req = httpMock.expectOne('/api/v1/academy');
    expect(req.request.body).toEqual({ name: 'Kept Name', address: null });
    req.flush({ data: makeAcademy({ address: null }) });
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
    // Backend contract: PATCH returns 403 when the user no longer has an
    // academy. Sitting on the edit form with a stale cached academy
    // would be a dead-end; the service clear()s and we bounce to
    // /dashboard, where hasAcademyGuard re-fetches, gets 404, and
    // redirects to /setup.
    const { component, router, httpMock } = setup();
    const service = TestBed.inject(AcademyService);
    component.form.patchValue({ name: 'New Name' });
    component.submit();

    httpMock
      .expectOne('/api/v1/academy')
      .flush({ message: 'Forbidden.' }, { status: 403, statusText: 'Forbidden' });

    expect(service.academy()).toBeNull(); // service cleared the cache
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('cancel() navigates back to the detail page without submitting', () => {
    const { component, router, httpMock } = setup();
    component.cancel();
    httpMock.expectNone('/api/v1/academy');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/academy']);
  });
});
