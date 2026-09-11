import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { AcademyClass } from '../../../core/services/academy-class.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { TimetableComponent } from './timetable.component';

const CLASSES_URL = '/api/v1/academy/classes';

function klass(overrides: Partial<AcademyClass> & { id: number }): AcademyClass {
  return {
    name: `Class ${overrides.id}`,
    weekday: 1,
    starts_at: '19:00',
    duration_minutes: 60,
    kind: 'gi',
    ...overrides,
  };
}

const KIDS = klass({ id: 1, name: 'Kids', weekday: 1, starts_at: '17:00' });
const FUNDAMENTALS = klass({ id: 2, name: 'Fundamentals', weekday: 1, starts_at: '19:00' });
const OPEN_MAT = klass({
  id: 3,
  name: 'Open mat',
  weekday: 6,
  starts_at: null,
  duration_minutes: null,
  kind: 'both',
});

function setup() {
  TestBed.configureTestingModule({
    imports: [TimetableComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(TimetableComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flushList(httpMock: HttpTestingController, classes: AcademyClass[]): void {
  httpMock.expectOne(CLASSES_URL).flush({ data: classes });
}

describe('TimetableComponent (#1562)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws all seven days, Monday first, with each class under its day', () => {
    const { fixture, httpMock } = setup();
    flushList(httpMock, [OPEN_MAT, FUNDAMENTALS, KIDS]);
    fixture.detectChanges();

    const days = fixture.nativeElement.querySelectorAll('.day') as NodeListOf<HTMLElement>;
    expect(days.length).toBe(7);
    expect(days[0].getAttribute('data-cy')).toBe('timetable-day-1');
    expect(days[6].getAttribute('data-cy')).toBe('timetable-day-0');

    const monday = days[0];
    const names = Array.from(monday.querySelectorAll('.slot__name')).map((n) =>
      n.textContent?.trim(),
    );
    // The server's order within a day is kept as given — it sorts by time,
    // and the component does not second-guess it.
    expect(names).toEqual(['Fundamentals', 'Kids']);
    expect(monday.querySelectorAll('.slot').length).toBe(2);

    const saturday = days[5];
    expect(saturday.querySelectorAll('.slot').length).toBe(1);
    expect(saturday.querySelector('.slot__time')?.textContent?.trim()).toBe('No fixed time');
  });

  it('marks the days with nothing on them as rest days, and keeps their add button', () => {
    const { fixture, httpMock } = setup();
    flushList(httpMock, [KIDS]);
    fixture.detectChanges();

    const tuesday = fixture.nativeElement.querySelector(
      '[data-cy="timetable-day-2"]',
    ) as HTMLElement;
    expect(tuesday.classList.contains('day--rest')).toBe(true);
    expect(tuesday.querySelector('.day__rest')?.textContent?.trim()).toBe('No class');
    expect(tuesday.querySelector('[data-cy="timetable-add-2"]')).not.toBeNull();
  });

  it('shows an empty state with the one call to action when there are no classes', () => {
    const { fixture, httpMock } = setup();
    flushList(httpMock, []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="timetable-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="timetable-week"]')).toBeNull();
    // Not two loudest buttons for one job: the header CTA yields to the empty state.
    expect(fixture.nativeElement.querySelector('[data-cy="timetable-add"]')).toBeNull();
  });

  it('counts the week in the header', () => {
    const { fixture, httpMock } = setup();
    flushList(httpMock, [KIDS, FUNDAMENTALS, OPEN_MAT]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="page-header-count"]')?.textContent?.trim(),
    ).toBe('3 classes a week');
  });

  it('spells the time range from the start and the duration', () => {
    const { component } = setup();
    TestBed.inject(HttpTestingController).expectOne(CLASSES_URL).flush({ data: [] });

    expect(component['timeRange'](klass({ id: 1, starts_at: '19:00', duration_minutes: 90 }))).toBe(
      '19:00 – 20:30',
    );
    expect(
      component['timeRange'](klass({ id: 2, starts_at: '19:00', duration_minutes: null })),
    ).toBe('19:00');
    expect(component['timeRange'](klass({ id: 3, starts_at: null }))).toBeNull();
  });

  it('opens the form with the day already chosen from a day\'s "+"', () => {
    const { fixture, component, httpMock } = setup();
    flushList(httpMock, [KIDS]);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[data-cy="timetable-add-4"]') as HTMLButtonElement
    ).click();

    expect(component['dialogOpen']()).toBe(true);
    expect(component['editing']()).toBeNull();
    expect(component['form'].controls.weekday.value).toBe(4);
    expect(component['dayValue']()).toEqual([4]);
  });

  it('creates a class, sending an empty time as no time at all', () => {
    const { fixture, component, httpMock } = setup();
    flushList(httpMock, [KIDS]);
    fixture.detectChanges();

    component['startAdding'](3);
    component['form'].patchValue({
      name: '  Advanced ',
      starts_at: '',
      duration_minutes: null,
      kind: 'nogi',
    });
    component['submit']();

    const req = httpMock.expectOne(CLASSES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Advanced',
      weekday: 3,
      starts_at: null,
      duration_minutes: null,
      kind: 'nogi',
    });
    req.flush({
      data: klass({
        id: 9,
        name: 'Advanced',
        weekday: 3,
        starts_at: null,
        duration_minutes: null,
        kind: 'nogi',
      }),
    });

    // Saved → closed → the week is re-read.
    expect(component['dialogOpen']()).toBe(false);
    flushList(httpMock, [KIDS]);
  });

  it('refuses to submit without a name or a day', () => {
    const { fixture, component, httpMock } = setup();
    flushList(httpMock, []);
    fixture.detectChanges();

    component['startAdding']();
    component['submit']();

    httpMock.expectNone(CLASSES_URL);
    // Save stays pressable; the press says what is missing, at the field.
    expect(component['nameError']()).toBe(true);
    expect(component['dayError']()).toBe(true);

    // Starting to fix either one takes its message away.
    component['form'].controls.name.setValue('Kids');
    expect(component['nameError']()).toBe(false);
    component['setDay'](2);
    expect(component['dayError']()).toBe(false);
  });

  it('edits a class in place with a PATCH', () => {
    const { fixture, component, httpMock } = setup();
    flushList(httpMock, [KIDS]);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[data-cy="timetable-class-1"]') as HTMLButtonElement
    ).click();
    expect(component['editing']()).toEqual(KIDS);
    expect(component['form'].getRawValue()).toEqual({
      name: 'Kids',
      weekday: 1,
      starts_at: '17:00',
      duration_minutes: 60,
      kind: 'gi',
    });

    component['form'].patchValue({ starts_at: '17:30' });
    component['submit']();

    const req = httpMock.expectOne(`${CLASSES_URL}/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.starts_at).toBe('17:30');
    req.flush({ data: { ...KIDS, starts_at: '17:30' } });
    flushList(httpMock, [{ ...KIDS, starts_at: '17:30' }]);
  });

  it('removes a class once the confirm is accepted', () => {
    const { fixture, component, httpMock } = setup();
    flushList(httpMock, [KIDS]);
    fixture.detectChanges();

    component['startEditing'](KIDS);

    // Drive the popup's accept directly: the confirmation service is
    // component-scoped, so this is the same instance the template uses.
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const spy = vi.spyOn(confirmation, 'confirm').mockImplementation((c) => {
      c.accept?.();
      return confirmation;
    });
    component['confirmRemove']({
      currentTarget: document.createElement('button'),
    } as unknown as Event);

    expect(spy).toHaveBeenCalled();
    const req = httpMock.expectOne(`${CLASSES_URL}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(component['dialogOpen']()).toBe(false);
    flushList(httpMock, []);
  });

  it('keeps the week on screen when a save fails', () => {
    const { fixture, component, httpMock } = setup();
    flushList(httpMock, [KIDS]);
    fixture.detectChanges();

    component['startAdding'](2);
    component['form'].patchValue({ name: 'Advanced' });
    component['submit']();

    httpMock
      .expectOne(CLASSES_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(component['dialogOpen']()).toBe(true);
    expect(component['classes']()).toEqual([KIDS]);
    expect(component['saving']()).toBe(false);
  });
});
