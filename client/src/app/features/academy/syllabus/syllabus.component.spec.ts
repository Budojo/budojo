import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { AcademyService } from '../../../core/services/academy.service';
import { SyllabusTopic } from '../../../core/services/syllabus.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { SyllabusComponent } from './syllabus.component';

const SYLLABUS_URL = '/api/v1/academy/syllabus';

function topic(overrides: Partial<SyllabusTopic> & { id: number }): SyllabusTopic {
  return {
    parent_id: null,
    name: `Topic ${overrides.id}`,
    kind: 'both',
    in_season: true,
    sort_order: 0,
    ...overrides,
  };
}

const ARMBAR = topic({ id: 11, parent_id: 1, name: 'Armbar' });
const CROSS_COLLAR = topic({ id: 12, parent_id: 1, name: 'Cross collar choke', kind: 'gi' });
const CLOSED_GUARD = topic({ id: 1, name: 'Closed guard', children: [ARMBAR, CROSS_COLLAR] });
const K_GUARD = topic({ id: 2, name: 'K guard', kind: 'nogi', sort_order: 1, children: [] });

function setup() {
  TestBed.configureTestingModule({
    imports: [SyllabusComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(SyllabusComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flushTree(httpMock: HttpTestingController, positions: SyllabusTopic[]): void {
  httpMock.expectOne(SYLLABUS_URL).flush({ data: positions });
}

function flushAcademy(httpMock: HttpTestingController, count: number): void {
  httpMock.expectOne('/api/v1/academy').flush({
    data: {
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      syllabus_topics_count: count,
    },
  });
}

describe('SyllabusComponent (#1563)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the positions collapsed, each saying how many techniques it holds', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const positions = el.querySelectorAll('.position');
    expect(positions.length).toBe(2);
    expect(positions[0].querySelector('.position__name')?.textContent?.trim()).toBe('Closed guard');
    expect(positions[0].querySelector('.position__count')?.textContent?.trim()).toBe('2');
    // Three hundred techniques are a wall; sixty headings are a programme.
    expect(el.querySelectorAll('.technique').length).toBe(0);
  });

  it('opens a position onto its techniques, and closes it again', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-toggle-1"]',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const names = Array.from(
      fixture.nativeElement.querySelectorAll('.technique__name') as NodeListOf<HTMLElement>,
    ).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Armbar', 'Cross collar choke']);

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.technique').length).toBe(0);
  });

  it('names the kind only when it narrows something — "both" is the default and would be noise', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // Closed guard is both; K guard is no-gi.
    expect(el.querySelector('[data-cy="syllabus-position-1"] .chip')).toBeNull();
    expect(el.querySelector('[data-cy="syllabus-position-2"] .chip')?.textContent?.trim()).toBe(
      'No-gi',
    );

    (fixture.nativeElement.querySelector('[data-cy="syllabus-toggle-1"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="syllabus-topic-11"] .chip')).toBeNull();
    expect(el.querySelector('[data-cy="syllabus-topic-12"] .chip')?.textContent?.trim()).toBe('Gi');
  });

  it('counts the techniques in the header, positions excluded', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="page-header-count"]')?.textContent?.trim(),
    ).toBe('2 techniques');
  });

  it('offers the shipped programme and a blank start when there is nothing yet', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, []);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="syllabus-empty-scratch"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="syllabus-tree"]')).toBeNull();
    // Not two loudest buttons for one job: the header CTA yields to the empty state.
    expect(el.querySelector('[data-cy="syllabus-add"]')).toBeNull();
  });

  it('seeds the shipped programme, then re-reads the tree and the academy', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, []);
    fixture.detectChanges();

    component['seedFromStarter']();

    const req = httpMock.expectOne(`${SYLLABUS_URL}/seed`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ data: { written: 348 } });

    flushTree(httpMock, [CLOSED_GUARD]);
    flushAcademy(httpMock, 2);
    expect(TestBed.inject(AcademyService).academy()?.syllabus_topics_count).toBe(2);
  });

  it('adds a position with no parent', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['startAddingPosition']();
    component['form'].patchValue({ name: '  Mount  ', kind: 'both' });
    component['submit']();

    const req = httpMock.expectOne(SYLLABUS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Mount', kind: 'both', parent_id: null });
    req.flush({ data: topic({ id: 3, name: 'Mount' }) });

    expect(component['dialogOpen']()).toBe(false);
    flushTree(httpMock, [CLOSED_GUARD, topic({ id: 3, name: 'Mount', children: [] })]);
    flushAcademy(httpMock, 2);
  });

  it("adds a technique under a position, starting from that position's kind", () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[data-cy="syllabus-add-under-2"]') as HTMLElement
    ).click();

    // A submission under a no-gi position is a no-gi technique until someone
    // says otherwise — and the position opens, or the result would be hidden.
    expect(component['form'].getRawValue().kind).toBe('nogi');
    expect(component['isExpanded'](K_GUARD)).toBe(true);

    component['form'].patchValue({ name: 'Saddle entry' });
    component['submit']();

    const req = httpMock.expectOne(SYLLABUS_URL);
    expect(req.request.body).toEqual({ name: 'Saddle entry', kind: 'nogi', parent_id: 2 });
    req.flush({ data: topic({ id: 21, parent_id: 2, name: 'Saddle entry', kind: 'nogi' }) });

    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    flushAcademy(httpMock, 2);
  });

  it('suggests a position name under a position field and a technique name under a technique one', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    const placeholder = () =>
      (
        fixture.nativeElement.querySelector('[data-cy="syllabus-form-name"]') as HTMLInputElement
      ).getAttribute('placeholder');

    component['startAddingPosition']();
    fixture.detectChanges();
    expect(placeholder()).toBe('Closed guard');

    // Under a position, the position's own name would read like a value
    // already typed — so the suggestion is what goes inside it.
    component['startAddingTechnique'](CLOSED_GUARD);
    fixture.detectChanges();
    expect(placeholder()).toBe('Armbar');

    component['startEditing'](ARMBAR);
    fixture.detectChanges();
    expect(placeholder()).toBe('Armbar');
  });

  it('edits a topic in place with a PATCH', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-cy="syllabus-edit-1"]') as HTMLElement).click();
    expect(component['editing']()).toEqual(CLOSED_GUARD);
    expect(component['form'].getRawValue()).toEqual({ name: 'Closed guard', kind: 'both' });

    component['form'].patchValue({ name: 'Guardia chiusa' });
    component['submit']();

    const req = httpMock.expectOne(`${SYLLABUS_URL}/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Guardia chiusa', kind: 'both' });
    req.flush({ data: { ...CLOSED_GUARD, name: 'Guardia chiusa' } });

    flushTree(httpMock, [{ ...CLOSED_GUARD, name: 'Guardia chiusa' }]);
    flushAcademy(httpMock, 2);
  });

  it('refuses to submit without a name, and says so at the field', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['startAddingPosition']();
    component['submit']();

    httpMock.expectNone(SYLLABUS_URL);
    expect(component['nameError']()).toBe(true);

    // Starting to fix it takes the message away.
    component['form'].controls.name.setValue('Mount');
    expect(component['nameError']()).toBe(false);
  });

  it('marks the name when the server says it is already taken here', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['startAddingTechnique'](CLOSED_GUARD);
    component['form'].patchValue({ name: 'Armbar' });
    component['submit']();

    httpMock
      .expectOne(SYLLABUS_URL)
      .flush({ message: 'The given data was invalid.' }, { status: 422, statusText: 'Unedited' });

    // A duplicate is the one failure the owner can act on, and the likeliest
    // one on a list this long — so it lands at the field, not in a toast.
    expect(component['nameError']()).toBe(true);
    expect(component['dialogOpen']()).toBe(true);
  });

  it('takes a position out of season with every technique under it', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    component['setSeason'](CLOSED_GUARD, false);

    const req = httpMock.expectOne(`${SYLLABUS_URL}/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ in_season: false });
    req.flush({ data: { ...CLOSED_GUARD, in_season: false } });

    // The server cascades; the same rule is applied here rather than
    // re-reading three hundred rows for one tick.
    const positions = component['positions']();
    expect(positions[0].in_season).toBe(false);
    expect(positions[0].children?.every((c) => !c.in_season)).toBe(true);
    expect(positions[1].in_season).toBe(true);
  });

  it('takes one technique out of season without touching its position or its siblings', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['setSeason'](ARMBAR, false);
    httpMock.expectOne(`${SYLLABUS_URL}/11`).flush({ data: { ...ARMBAR, in_season: false } });

    const position = component['positions']()[0];
    expect(position.in_season).toBe(true);
    expect(position.children?.find((c) => c.id === 11)?.in_season).toBe(false);
    expect(position.children?.find((c) => c.id === 12)?.in_season).toBe(true);
  });

  it('resyncs from the server when a season tick fails', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['setSeason'](ARMBAR, false);
    httpMock
      .expectOne(`${SYLLABUS_URL}/11`)
      .flush({ message: 'Server error' }, { status: 500, statusText: 'Server Error' });

    flushTree(httpMock, [CLOSED_GUARD]);
    expect(component['positions']()[0].children?.find((c) => c.id === 11)?.in_season).toBe(true);
  });

  it('removes a topic once the confirm is accepted', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['startEditing'](CLOSED_GUARD);

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

    // What goes with it is said before it goes, not after.
    expect(spy.mock.calls[0][0].message).toContain('2 techniques');

    const req = httpMock.expectOne(`${SYLLABUS_URL}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    flushTree(httpMock, []);
    flushAcademy(httpMock, 0);
  });
});
