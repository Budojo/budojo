import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AcademyClosure } from '../../../../core/services/academy.service';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { useLadder } from '../../../../../test-utils/ladder-test';
import { AcademyClosuresComponent } from './academy-closures.component';

const CLOSURES_URL = '/api/v1/academy/closures';

const SUMMER: AcademyClosure = {
  id: 1,
  starts_on: '2026-08-10',
  ends_on: '2026-08-25',
  label: 'Chiusura estiva',
};
const FERRAGOSTO: AcademyClosure = {
  id: 2,
  starts_on: '2026-08-15',
  ends_on: '2026-08-15',
  label: null,
};

function setup(closures: AcademyClosure[] = []) {
  TestBed.configureTestingModule({
    imports: [AcademyClosuresComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      MessageService,
      ...provideI18nTesting(),
    ],
  });
  useLadder('bjj', { closures });

  const fixture = TestBed.createComponent(AcademyClosuresComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock,
    root: fixture.nativeElement as HTMLElement,
  };
}

/** Every write re-reads the academy, which carries the list. */
function flushAcademy(httpMock: HttpTestingController, closures: AcademyClosure[]): void {
  httpMock.expectOne('/api/v1/academy').flush({
    data: {
      id: 1,
      name: 'Test Academy',
      slug: 'test-academy',
      address: null,
      logo_url: null,
      closures,
    },
  });
}

function text(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('AcademyClosuresComponent (#1766)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('says how to start when there are none', () => {
    const { root } = setup();

    expect(root.querySelector('[data-cy="closures-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="closures-list"]')).toBeNull();
  });

  it('lists each closure with its dates, its name and the days it takes out', () => {
    const { root } = setup([SUMMER, FERRAGOSTO]);

    expect(text(root, '[data-cy="closures-row-1"]')).toMatch(/Chiusura estiva.*16 days/);
    expect(text(root, '[data-cy="closures-row-2"]')).toMatch(/15 August.*1 day$/);
  });

  it('adds a closure as calendar days, the name trimmed', () => {
    const { component, httpMock } = setup();
    component['startAdding']();
    component['form'].setValue({
      starts_on: new Date(2026, 7, 10),
      ends_on: new Date(2026, 7, 25),
      label: '  Chiusura estiva ',
    });

    component['submit']();

    const req = httpMock.expectOne(CLOSURES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      starts_on: '2026-08-10',
      ends_on: '2026-08-25',
      label: 'Chiusura estiva',
    });
    req.flush({ data: SUMMER });
    flushAcademy(httpMock, [SUMMER]);
    expect(component['dialogOpen']()).toBe(false);
  });

  it('sends no name as null', () => {
    const { component, httpMock } = setup();
    component['startAdding']();
    component['form'].setValue({
      starts_on: new Date(2026, 7, 15),
      ends_on: new Date(2026, 7, 15),
      label: '   ',
    });

    component['submit']();

    const req = httpMock.expectOne(CLOSURES_URL);
    expect(req.request.body.label).toBeNull();
    req.flush({ data: FERRAGOSTO });
    flushAcademy(httpMock, [FERRAGOSTO]);
  });

  it('explains a missing date or an end before the start, and sends nothing', () => {
    const { component, fixture, root } = setup();
    component['startAdding']();

    component['submit']();
    fixture.detectChanges();
    expect(component['datesError']()).toBe('missing');

    component['form'].setValue({
      starts_on: new Date(2026, 7, 25),
      ends_on: new Date(2026, 7, 10),
      label: '',
    });
    component['submit']();
    fixture.detectChanges();
    expect(component['datesError']()).toBe('order');
    expect(
      root.ownerDocument.querySelector('[data-cy="closures-form-dates-error"]'),
    ).not.toBeNull();
  });

  it('edits the closure it opened', () => {
    const { component, httpMock } = setup([SUMMER]);
    component['startEditing'](SUMMER);
    expect(component['form'].getRawValue().starts_on).toEqual(new Date(2026, 7, 10));

    component['form'].controls.ends_on.setValue(new Date(2026, 7, 30));
    component['submit']();

    const req = httpMock.expectOne(`${CLOSURES_URL}/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      starts_on: '2026-08-10',
      ends_on: '2026-08-30',
      label: 'Chiusura estiva',
    });
    req.flush({ data: { ...SUMMER, ends_on: '2026-08-30' } });
    flushAcademy(httpMock, [{ ...SUMMER, ends_on: '2026-08-30' }]);
  });

  it('removes a closure once the confirm is accepted', () => {
    const { component, fixture, httpMock } = setup([SUMMER]);
    component['startEditing'](SUMMER);
    // Drive the dialog's accept directly: the confirmation service is the
    // component's own.
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((c) => {
      c.accept?.();
      return confirmation;
    });

    component['confirmRemove']();

    const req = httpMock.expectOne(`${CLOSURES_URL}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    flushAcademy(httpMock, []);
    expect(component['dialogOpen']()).toBe(false);
  });
});
