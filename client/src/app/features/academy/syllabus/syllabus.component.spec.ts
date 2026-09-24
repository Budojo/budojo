import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AcademyService, MartialArt } from '../../../core/services/academy.service';
import { SyllabusTopic } from '../../../core/services/syllabus.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { TRAINING_MODE_FIXTURES, useLadder } from '../../../../test-utils/ladder-test';
import { SyllabusComponent } from './syllabus.component';

const SYLLABUS_URL = '/api/v1/academy/syllabus';

function topic(overrides: Partial<SyllabusTopic> & { id: number }): SyllabusTopic {
  return {
    parent_id: null,
    name: `Topic ${overrides.id}`,
    kind: 'both',
    in_season: true,
    from_belt: null,
    sort_order: 0,
    ...overrides,
  };
}

const ARMBAR = topic({ id: 11, parent_id: 1, name: 'Armbar' });
const CROSS_COLLAR = topic({ id: 12, parent_id: 1, name: 'Cross collar choke', kind: 'gi' });
const CLOSED_GUARD = topic({ id: 1, name: 'Closed guard', children: [ARMBAR, CROSS_COLLAR] });
const K_GUARD = topic({ id: 2, name: 'K guard', kind: 'nogi', sort_order: 1, children: [] });

/** The martial art's starter programmes, as `Academy.syllabus_programmes` sends them (#1802). */
function setup(starterProgrammes: string[] = ['bjj'], art: MartialArt = 'bjj') {
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

  TestBed.inject(AcademyService).academy.set({
    id: 1,
    name: 'Test',
    slug: 'test',
    address: null,
    logo_url: null,
    martial_art: art,
    training_modes: TRAINING_MODE_FIXTURES[art],
    syllabus_programmes: starterProgrammes,
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

  it("does not repeat a position's kind on each of its techniques (#1804)", () => {
    const LEG_LOCKS = topic({
      id: 3,
      name: 'Leg locks',
      kind: 'nogi',
      sort_order: 2,
      children: [
        topic({ id: 31, parent_id: 3, name: 'Heel hook', kind: 'nogi' }),
        topic({ id: 32, parent_id: 3, name: 'Kneebar', kind: 'both' }),
        topic({ id: 33, parent_id: 3, name: 'Ezekiel from the leg', kind: 'gi' }),
      ],
    });
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [LEG_LOCKS]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-cy="syllabus-toggle-3"]') as HTMLElement).click();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-position-3"] .chip')?.textContent?.trim()).toBe(
      'No-gi',
    );
    expect(el.querySelector('[data-cy="syllabus-topic-31"] .chip')).toBeNull();
    // Different from its position: that is worth saying, "both" included —
    // otherwise it would read as no-gi like its siblings.
    expect(el.querySelector('[data-cy="syllabus-topic-32"] .chip')?.textContent?.trim()).toBe(
      'Gi and no-gi',
    );
    expect(el.querySelector('[data-cy="syllabus-topic-33"] .chip')?.textContent?.trim()).toBe('Gi');
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
    // Beside the primary since #1630, from the shared empty state's own
    // secondary slot rather than a block 80 px below it.
    expect(el.querySelector('[data-cy="syllabus-empty-secondary"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="syllabus-tree"]')).toBeNull();
    // Not two loudest buttons for one job: the header CTA yields to the empty state.
    expect(el.querySelector('[data-cy="syllabus-add"]')).toBeNull();
  });

  it('offers only a blank start while the martial art has no starter programme (#1802)', () => {
    const { fixture, component, httpMock } = setup([]);
    flushTree(httpMock, []);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-empty"]')?.textContent).toContain(
      'The starter programme for this martial art is not ready yet.',
    );
    // The seed would meet a 404, so nothing offers it, not even as a secondary.
    expect(el.querySelector('[data-cy="syllabus-empty-secondary"]')).toBeNull();

    const cta = el.querySelector<HTMLButtonElement>('[data-cy="syllabus-empty-cta"] button');
    expect(cta?.textContent?.trim()).toBe('Write my programme');
    cta!.click();
    fixture.detectChanges();

    // The new-position dialog, not a seed.
    expect(component['dialogOpen']()).toBe(true);
    expect(component['addingUnder']()).toBeNull();
    httpMock.expectNone(`${SYLLABUS_URL}/seed`);
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

  it('holds the starter button while the seed runs — it writes three hundred rows', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, []);
    fixture.detectChanges();

    const cta = () =>
      fixture.nativeElement.querySelector(
        '[data-cy="syllabus-empty-cta"] button',
      ) as HTMLButtonElement | null;
    expect(cta()?.disabled).toBe(false);

    cta()!.click();
    fixture.detectChanges();
    expect(cta()?.disabled).toBe(true);

    httpMock.expectOne(`${SYLLABUS_URL}/seed`).flush({ data: { written: 348 } });
    flushTree(httpMock, [CLOSED_GUARD]);
    flushAcademy(httpMock, 2);
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
    expect(req.request.body).toEqual({
      name: 'Mount',
      kind: 'both',
      parent_id: null,
      from_belt: null,
    });
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
    expect(req.request.body).toEqual({
      name: 'Saddle entry',
      kind: 'nogi',
      parent_id: 2,
      from_belt: null,
    });
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
    expect(component['form'].getRawValue()).toEqual({
      name: 'Closed guard',
      kind: 'both',
      fromBelt: null,
    });

    component['form'].patchValue({ name: 'Guardia chiusa' });
    component['submit']();

    const req = httpMock.expectOne(`${SYLLABUS_URL}/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Guardia chiusa', kind: 'both', from_belt: null });
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
    component['confirmRemove']();

    // What goes with it is said before it goes, not after.
    expect(spy.mock.calls[0][0].message).toContain('2 techniques');
    expect(spy.mock.calls[0][0].message).toContain('Closed guard');

    const req = httpMock.expectOne(`${SYLLABUS_URL}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    flushTree(httpMock, []);
    flushAcademy(httpMock, 0);
  });

  it('counts in words a reader would use — one technique, not "1 techniques"', () => {
    const onlyArmbar = { ...CLOSED_GUARD, children: [ARMBAR] };
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [onlyArmbar]);
    fixture.detectChanges();

    component['startEditing'](onlyArmbar);
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const spy = vi.spyOn(confirmation, 'confirm').mockImplementation(() => confirmation);
    component['confirmRemove']();

    expect(spy.mock.calls[0][0].message).toBe(
      'Remove Closed guard and the one technique under it?',
    );
  });

  it('says nothing about what goes with a technique — nothing does', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['startEditing'](ARMBAR);
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const spy = vi.spyOn(confirmation, 'confirm').mockImplementation(() => confirmation);
    component['confirmRemove']();

    expect(spy.mock.calls[0][0].message).toBe('Remove Armbar from the programme?');
  });

  // ─── The technique row (#1630) ──────────────────────────────────────────

  function expandedRow(): { fixture: ReturnType<typeof setup>['fixture']; row: HTMLElement } {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('[data-cy="syllabus-toggle-1"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    return {
      fixture,
      row: fixture.nativeElement.querySelector('[data-cy="syllabus-topic-11"]') as HTMLElement,
    };
  }

  it('puts the season tick beside the name it belongs to, and the name toggles it', () => {
    const { fixture, row } = expandedRow();
    const httpMock = TestBed.inject(HttpTestingController);

    const tick = row.querySelector('[data-cy="syllabus-season-11"]');
    const name = row.querySelector('.technique__name') as HTMLLabelElement;

    // Tick first, then the name — it used to sit at the far right of the row.
    expect(tick!.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The `for` has to land on a real input, or the label toggles nothing —
    // asserting the attribute against the same literal the template builds
    // would pass either way.
    const input = row.querySelector(`#${name.getAttribute('for')}`);
    expect(input?.tagName).toBe('INPUT');

    // And pressing the name is what a reader will actually do.
    name.click();
    fixture.detectChanges();
    const patch = httpMock.expectOne(
      (r) => r.method === 'PATCH' && r.url.endsWith('/api/v1/academy/syllabus/11'),
    );
    // ARMBAR starts out of season in this fixture, so the press turns it on.
    expect(patch.request.body).toEqual({ in_season: true });
    patch.flush({ data: { ...ARMBAR, in_season: true } });
  });

  it('shows a pencil on the row, where renaming used to be a secret', () => {
    const { fixture, row } = expandedRow();

    const edit = row.querySelector('[data-cy="syllabus-topic-edit-11"]') as HTMLButtonElement;
    expect(edit).not.toBeNull();
    edit.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['dialogOpen']()).toBe(true);
  });

  // ─── Search on the page that maintains the programme (#1629, SYL-1) ──────

  it('keeps a match grouped under its own position, not in a flat list', () => {
    // The shipped programme holds a Kimura under three different positions.
    // Flattened, three identical names answer nothing — which position is
    // the one you were looking for.
    const kimuraClosed = topic({ id: 21, parent_id: 1, name: 'Kimura' });
    const kimuraSide = topic({ id: 22, parent_id: 3, name: 'Kimura trap' });
    const sideControl = topic({
      id: 3,
      name: 'Side control',
      sort_order: 2,
      children: [kimuraSide],
    });
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [
      topic({ id: 1, name: 'Closed guard', children: [ARMBAR, kimuraClosed] }),
      K_GUARD,
      sideControl,
    ]);
    fixture.detectChanges();

    component['query'].set('kim');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const positions = [...el.querySelectorAll('.position__name')].map((n) => n.textContent?.trim());
    // K guard holds no match and is gone; the other two stay, each carrying
    // the technique that matched.
    expect(positions).toEqual(['Closed guard', 'Side control']);
    const techniques = [...el.querySelectorAll('.technique__name')].map((n) =>
      n.textContent?.trim(),
    );
    expect(techniques).toEqual(['Kimura', 'Kimura trap']);
    httpMock.verify();
  });

  it('opens what the search kept, without a press', () => {
    // The page starts collapsed by design. If a search left it that way the
    // field would appear to find nothing, which is what it exists to fix.
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.technique').length).toBe(0);

    component['query'].set('armbar');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.technique').length).toBe(1);
    expect(el.querySelector('.technique__name')?.textContent?.trim()).toBe('Armbar');
    httpMock.verify();
  });

  it('gives the tree back, still collapsed, when the field is cleared', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    component['query'].set('armbar');
    fixture.detectChanges();
    component['query'].set('');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.position').length).toBe(2);
    // Searching must not have written to `expanded` behind the reader's back.
    expect(el.querySelectorAll('.technique').length).toBe(0);
    httpMock.verify();
  });

  it('says so when nothing matches, instead of showing an empty programme', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    component['query'].set('berimbolo');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-no-results"]')?.textContent).toContain('berimbolo');
    expect(el.querySelectorAll('.position').length).toBe(0);
    httpMock.verify();
  });

  it('splits the header count only once in-season and total disagree', () => {
    const { fixture, httpMock } = setup();
    // Both techniques in season: one number is the honest answer.
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="page-header-count"]')
        ?.textContent,
    ).toContain('2 techniques');
    httpMock.verify();
  });

  it('names both numbers when a technique goes out of season', () => {
    const { fixture, httpMock } = setup();
    flushTree(httpMock, [
      topic({
        id: 1,
        name: 'Closed guard',
        children: [ARMBAR, topic({ id: 12, parent_id: 1, name: 'Cross collar', in_season: false })],
      }),
    ]);
    fixture.detectChanges();

    // They diverge the moment something is unticked, and the coverage report
    // counts the in-season half — so the page has to say which is which.
    const count = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="page-header-count"]',
    )?.textContent;
    expect(count).toContain('1 in season');
    expect(count).toContain('2 in total');
    httpMock.verify();
  });

  it('keeps the position badge on its real size while the list is filtered', () => {
    const kimura = topic({ id: 21, parent_id: 1, name: 'Kimura' });
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [
      topic({ id: 1, name: 'Closed guard', children: [ARMBAR, CROSS_COLLAR, kimura] }),
    ]);
    fixture.detectChanges();

    component['query'].set('kim');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.technique').length).toBe(1);
    // One match listed, but the position still holds three — the badge means
    // the position's size, and a search must not change what it means.
    expect(el.querySelector('.position__count')?.textContent?.trim()).toBe('3');
    httpMock.verify();
  });

  it('filters from the field itself, and the ✕ gives the tree back', () => {
    // Through the DOM, not the signal. Every other search test pokes
    // `query` directly, so deleting the whole field from the template left
    // them all green — the binding, the clear button and the gate that
    // decides whether the field exists were covered by nothing.
    const kimura = topic({ id: 21, parent_id: 1, name: 'Kimura' });
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [
      topic({ id: 1, name: 'Closed guard', children: [ARMBAR, kimura] }),
      K_GUARD,
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('[data-cy="syllabus-search"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    input.value = 'kim';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component['query']()).toBe('kim');
    expect(el.querySelectorAll('.position').length).toBe(1);

    (el.querySelector('[data-cy="syllabus-search-clear"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component['query']()).toBe('');
    expect(el.querySelectorAll('.position').length).toBe(2);
    httpMock.verify();
  });

  it('counts what it found, in the singular when there is one of a thing', () => {
    const kimura = topic({ id: 21, parent_id: 1, name: 'Kimura' });
    const kimuraTrap = topic({ id: 22, parent_id: 2, name: 'Kimura trap' });
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [
      topic({ id: 1, name: 'Closed guard', children: [ARMBAR, kimura] }),
      topic({ id: 2, name: 'Half guard', sort_order: 1, children: [kimuraTrap] }),
    ]);
    fixture.detectChanges();

    const summary = (): string =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-cy="syllabus-search-summary"]')
        ?.textContent?.trim() ?? '';

    component['setQuery']('kim');
    fixture.detectChanges();
    // Distinguishable numbers, so swapping the two interpolations shows.
    expect(summary()).toContain('2 techniques');
    expect(summary()).toContain('2 positions');

    // The commonest search there is returns one hit in one position, and a
    // hardcoded plural renders "1 techniques across 1 positions".
    component['setQuery']('kimura trap');
    fixture.detectChanges();
    expect(summary()).toContain('1 technique');
    expect(summary()).not.toContain('1 techniques');
    expect(summary()).toContain('1 position');
    expect(summary()).not.toContain('1 positions');
    httpMock.verify();
  });

  it('lets the reader fold a position away mid-search, and forgets it after', () => {
    // "guard" matches the position by name, so it keeps every technique — the
    // wall the collapsed tree exists to prevent. The toggle has to work.
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    component['setQuery']('guard');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // `.technique__name`, not `.technique`: an open position with no children
    // renders an "ancora niente" row that carries the same block class, and
    // K guard is empty.
    expect(el.querySelectorAll('.technique__name').length).toBe(2);

    (el.querySelector('[data-cy="syllabus-toggle-1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.technique__name').length).toBe(0);

    // And the fold does not leak: clearing gives back the tree as it was,
    // not one the reader never touched.
    component['setQuery']('');
    fixture.detectChanges();
    expect(el.querySelectorAll('.position').length).toBe(2);
    expect(el.querySelectorAll('.technique__name').length).toBe(0);
    httpMock.verify();
  });

  it('leaves a technique added mid-search visible once the search is cleared', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    component['setQuery']('armbar');
    fixture.detectChanges();
    component['startAddingTechnique'](CLOSED_GUARD);
    fixture.detectChanges();

    // The guard used to read `isExpanded`, which is true for everything a
    // search kept — so the id never reached `expanded` and the new row was
    // gone the moment the field was cleared.
    component['setQuery']('');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.technique__name').length).toBe(2);
    httpMock.verify();
  });

  it('confirms in a dialog rather than a popup anchored inside one', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();
    component['startEditing'](CLOSED_GUARD);

    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const spy = vi.spyOn(confirmation, 'confirm').mockImplementation(() => confirmation);

    component['confirmRemove']();

    // The trigger sits in the topic dialog's footer; a popup anchored to it
    // hung below that dialog's bottom edge (#1644, the same shape as TT-5).
    // A `target` here would put the anchoring back.
    expect(spy.mock.calls[0][0].target).toBeUndefined();
    // ConfirmDialog has no `showHeader` — with no header passed the bar still
    // renders, empty, and `aria-labelledby` points at an empty span.
    expect(spy.mock.calls[0][0].header).toBe('Remove from the syllabus');
    expect(spy.mock.calls[0][0].rejectLabel).toBe('Cancel');
  });
});

describe('SyllabusComponent — training modes (#1803)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const SANCHIN = topic({ id: 5, name: 'Sanchin', kind: 'kata', children: [] });
  const KAKIE = topic({ id: 6, name: 'Kakie', kind: 'both', sort_order: 1, children: [] });

  it("offers a karate topic the art's modes, with the art's own example under them", () => {
    const { fixture, component, httpMock } = setup([], 'karate');
    flushTree(httpMock, [SANCHIN]);
    fixture.detectChanges();

    component['startAddingPosition']();
    fixture.detectChanges();

    const options = Array.from(
      document.querySelectorAll<HTMLElement>('[data-cy="syllabus-form-kind"] button'),
    ).map((b) => b.textContent?.trim());
    expect(options).toEqual(['Kata', 'Kumite', 'Kata and kumite']);
    expect(document.body.textContent).toContain('Saifa is kata, sanbon kumite is kumite.');
    expect(document.body.textContent).not.toContain('Heel hooks');
  });

  it('says a mode on the row only when it narrows something, in the art own words', () => {
    const { fixture, httpMock } = setup([], 'karate');
    flushTree(httpMock, [SANCHIN, KAKIE]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Kata');
    expect(el.textContent).not.toContain('Kata and kumite');
  });

  it('keeps the BJJ example word for word', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [CLOSED_GUARD]);
    fixture.detectChanges();

    component['startAddingPosition']();
    fixture.detectChanges();

    expect(document.body.textContent).toContain(
      'Heel hooks are no-gi, lapel guards are gi. Leave it on both when it makes sense either way.',
    );
  });
});

describe('SyllabusComponent — the starter it offers (#1804)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function cta(fixture: { nativeElement: HTMLElement }): string | undefined {
    return fixture.nativeElement
      .querySelector('[data-cy="syllabus-empty-cta"] button')
      ?.textContent?.trim();
  }

  it("suggests the academy's own art in the name field (#1808)", () => {
    const { fixture, component, httpMock } = setup(['judo'], 'judo');
    flushTree(httpMock, []);
    fixture.detectChanges();

    component['startAddingPosition']();
    fixture.detectChanges();

    expect(
      (
        fixture.nativeElement.querySelector('[data-cy="syllabus-form-name"]') as HTMLInputElement
      ).getAttribute('placeholder'),
    ).toBe('Ashi-waza');
  });

  it('names the programme a judo academy will get', () => {
    const { fixture, httpMock } = setup(['judo'], 'judo');
    flushTree(httpMock, []);
    fixture.detectChanges();

    expect(cta(fixture)).toBe('Start from the judo programme');
    expect(fixture.nativeElement.textContent).toContain('the Kodokan throws');
  });

  it('keeps the BJJ button word for word', () => {
    const { fixture, httpMock } = setup(['bjj'], 'bjj');
    flushTree(httpMock, []);
    fixture.detectChanges();

    expect(cta(fixture)).toBe('Start from the BJJ programme');
  });

  it('says which programme became the academy own, once it has', () => {
    const { fixture, component, httpMock } = setup(['judo'], 'judo');
    flushTree(httpMock, []);
    fixture.detectChanges();
    const toast = vi.spyOn(fixture.debugElement.injector.get(MessageService), 'add');

    component['seedFromStarter']();
    httpMock.expectOne(`${SYLLABUS_URL}/seed`).flush({ data: { written: 151 } });
    flushTree(httpMock, []);
    flushAcademy(httpMock, 137);

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'The judo programme is yours to edit' }),
    );
  });

  it('names the karate style the programme is, so another style is never surprised', () => {
    const { fixture, httpMock } = setup(['karate-goju-ryu'], 'karate');
    flushTree(httpMock, []);
    fixture.detectChanges();

    expect(cta(fixture)).toBe('Start from the Goju-ryu programme');
  });

  it('says WT on the taekwondo button, as karate names its style', () => {
    const { fixture, httpMock } = setup(['taekwondo'], 'taekwondo');
    flushTree(httpMock, []);
    fixture.detectChanges();

    expect(cta(fixture)).toBe('Start from the taekwondo programme (WT)');
  });

  it('says something true for a programme that ships before its own words do', () => {
    const { fixture, httpMock } = setup(['karate-shorin-ryu'], 'karate');
    flushTree(httpMock, []);
    fixture.detectChanges();

    expect(cta(fixture)).toBe('Start from the shipped programme');
  });
});

describe('SyllabusComponent — reordering (#1661)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const TRIANGLE = topic({ id: 13, parent_id: 1, name: 'Triangle', sort_order: 2 });
  const GUARD = topic({ id: 1, name: 'Closed guard', children: [ARMBAR, CROSS_COLLAR, TRIANGLE] });

  function childNames(component: SyllabusComponent): string[] {
    return (component['positions']()[0].children ?? []).map((c: SyllabusTopic) => c.name);
  }

  it('says where the technique stands, and moves it one place without leaving the dialog', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [GUARD]);
    fixture.detectChanges();

    component['startEditing'](TRIANGLE);
    fixture.detectChanges();
    expect(component['place']()).toEqual({ index: 2, total: 3 });

    // Through the button, so a template wired the wrong way round fails here.
    (
      document.querySelector('[data-cy="syllabus-form-move-up"] button') as HTMLButtonElement
    ).click();
    const req = httpMock.expectOne(`${SYLLABUS_URL}/13/move`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ direction: 'up' });
    req.flush({ data: [ARMBAR, TRIANGLE, CROSS_COLLAR] });
    fixture.detectChanges();

    // Applied from the answer, not by re-reading the whole tree, and the
    // dialog stays open for the next step.
    expect(childNames(component)).toEqual(['Armbar', 'Triangle', 'Cross collar choke']);
    expect(component['place']()).toEqual({ index: 1, total: 3 });
    expect(component['dialogOpen']()).toBe(true);
    // The move is saved already, so the footer no longer offers to cancel it.
    expect(
      (document.querySelector('[data-cy="syllabus-form-cancel"]') as HTMLElement).textContent,
    ).toContain('Close');
  });

  it('hands focus to the other step when the pressed one runs out of room', async () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [GUARD]);
    fixture.detectChanges();

    component['startEditing'](CROSS_COLLAR);
    fixture.detectChanges();
    const up = document.querySelector(
      '[data-cy="syllabus-form-move-up"] button',
    ) as HTMLButtonElement;
    up.focus();
    up.click();
    httpMock.expectOne(`${SYLLABUS_URL}/12/move`).flush({ data: [CROSS_COLLAR, ARMBAR, TRIANGLE] });
    fixture.detectChanges();
    await fixture.whenStable();

    // First place now: Move up disables itself, and a disabled button drops
    // focus to the page. The keyboard lands on Move down instead.
    expect(document.activeElement).toBe(
      document.querySelector('[data-cy="syllabus-form-move-down"] button'),
    );
  });

  it('greys out the step there is no room for', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [GUARD]);
    fixture.detectChanges();

    component['startEditing'](ARMBAR);
    fixture.detectChanges();

    const up = document.querySelector(
      '[data-cy="syllabus-form-move-up"] button',
    ) as HTMLButtonElement;
    const down = document.querySelector(
      '[data-cy="syllabus-form-move-down"] button',
    ) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(false);
  });

  it('moves a position among the positions, keeping its techniques', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [GUARD, K_GUARD]);
    fixture.detectChanges();

    component['startEditing'](GUARD);
    fixture.detectChanges();
    (
      document.querySelector('[data-cy="syllabus-form-move-down"] button') as HTMLButtonElement
    ).click();
    const req = httpMock.expectOne(`${SYLLABUS_URL}/1/move`);
    expect(req.request.body).toEqual({ direction: 'down' });
    req.flush({
      data: [
        { ...K_GUARD, children: undefined },
        { ...GUARD, children: undefined },
      ],
    });

    const positions = component['positions']();
    expect(positions.map((p: SyllabusTopic) => p.name)).toEqual(['K guard', 'Closed guard']);
    // The answer carries no children; the tree keeps its own.
    expect(positions[1].children).toHaveLength(3);
  });

  it('offers no order while adding — a new topic goes at the end', () => {
    const { fixture, component, httpMock } = setup();
    flushTree(httpMock, [GUARD]);
    fixture.detectChanges();

    component['startAddingTechnique'](GUARD);
    fixture.detectChanges();

    expect(component['place']()).toBeNull();
    expect(document.querySelector('[data-cy="syllabus-form-order"]')).toBeNull();
  });
});

describe('SyllabusComponent — the programme by grade (#1861)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  // Everyone, white and blue under one position; purple on its own.
  const SHRIMP = topic({ id: 21, parent_id: 2, name: 'Shrimp' });
  const SCISSOR = topic({ id: 22, parent_id: 2, name: 'Scissor sweep', from_belt: 'white' });
  const TRIANGLE = topic({ id: 23, parent_id: 2, name: 'Triangle', from_belt: 'blue' });
  const GUARD = topic({
    id: 2,
    name: 'Guard',
    from_belt: 'blue',
    children: [SHRIMP, SCISSOR, TRIANGLE],
  });
  const HEEL_HOOK = topic({ id: 31, parent_id: 3, name: 'Heel hook', from_belt: 'purple' });
  const LEG_LOCKS = topic({
    id: 3,
    name: 'Leg locks',
    from_belt: 'purple',
    sort_order: 1,
    children: [HEEL_HOOK],
  });

  function graded() {
    const ctx = setup();
    useLadder('bjj', { syllabus_programmes: ['bjj'] });
    flushTree(ctx.httpMock, [GUARD, LEG_LOCKS]);
    ctx.fixture.detectChanges();
    return ctx;
  }

  function techniqueNames(fixture: { nativeElement: HTMLElement }): (string | undefined)[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.technique__name') as NodeListOf<HTMLElement>,
    ).map((n) => n.textContent?.trim());
  }

  it("starts a new technique on its position's belt, and sends it", () => {
    const { fixture, component, httpMock } = graded();

    (
      fixture.nativeElement.querySelector('[data-cy="syllabus-add-under-3"]') as HTMLElement
    ).click();
    expect(component['form'].getRawValue().fromBelt).toBe('purple');

    component['form'].patchValue({ name: 'Kneebar' });
    component['submit']();

    const req = httpMock.expectOne(SYLLABUS_URL);
    expect(req.request.body).toEqual({
      name: 'Kneebar',
      kind: 'both',
      parent_id: 3,
      from_belt: 'purple',
    });
    req.flush({ data: topic({ id: 32, parent_id: 3, name: 'Kneebar', from_belt: 'purple' }) });
    flushTree(httpMock, [GUARD, LEG_LOCKS]);
    flushAcademy(httpMock, 5);
  });

  it('edits the belt with the rest of the topic — clearing it is "for everyone"', () => {
    const { component, httpMock } = graded();

    component['startEditing'](TRIANGLE);
    expect(component['form'].getRawValue().fromBelt).toBe('blue');

    component['form'].patchValue({ fromBelt: null });
    component['submit']();

    const req = httpMock.expectOne(`${SYLLABUS_URL}/23`);
    expect(req.request.body).toEqual({ name: 'Triangle', kind: 'both', from_belt: null });
    req.flush({ data: { ...TRIANGLE, from_belt: null } });
    flushTree(httpMock, [GUARD, LEG_LOCKS]);
    flushAcademy(httpMock, 4);
  });

  it('offers the grades of the academy ladder in the dialog, without the kids ones it does not train', () => {
    const { component, httpMock } = setup();
    useLadder('bjj', { trains_kids: false });
    flushTree(httpMock, [GUARD]);

    const values = component['beltOptions']().map((o) => o.value);
    expect(values[0]).toBe('white');
    expect(values).not.toContain('grey');
  });

  it('says the belt on a row only where it tells the reader something', () => {
    const { fixture } = graded();
    const el: HTMLElement = fixture.nativeElement;

    // On a position whenever it has one.
    expect(
      el.querySelector('[data-cy="syllabus-position-2"] [data-cy="syllabus-belt"]'),
    ).not.toBeNull();

    (el.querySelector('[data-cy="syllabus-toggle-2"]') as HTMLElement).click();
    fixture.detectChanges();

    // Same as its position: said once, above. Different: said on the row —
    // "for everyone" included, since a position's belt is a default for what
    // is added under it and not a rule over what was already there.
    expect(el.querySelector('[data-cy="syllabus-topic-23"] [data-cy="syllabus-belt"]')).toBeNull();
    expect(
      el.querySelector('[data-cy="syllabus-topic-22"] [data-cy="syllabus-belt"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-cy="syllabus-topic-21"] [data-cy="syllabus-belt"]')?.textContent,
    ).toContain('For everyone');
  });

  it('narrows the programme to what a belt is expected to know, the grades below included', () => {
    const { fixture, component } = graded();

    component['setBeltFilter']('blue');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    // Leg locks start at purple: nothing in them is a blue belt's yet.
    expect(el.querySelector('[data-cy="syllabus-position-3"]')).toBeNull();
    (el.querySelector('[data-cy="syllabus-toggle-2"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(techniqueNames(fixture)).toEqual(['Shrimp', 'Scissor sweep', 'Triangle']);
    expect(el.querySelector('[data-cy="syllabus-belt-summary"]')?.textContent?.trim()).toBe(
      '3 techniques expected up to the Blue belt',
    );

    component['setBeltFilter']('white');
    fixture.detectChanges();
    expect(techniqueNames(fixture)).toEqual(['Shrimp', 'Scissor sweep']);
    expect(el.querySelector('[data-cy="syllabus-belt-summary"]')?.textContent?.trim()).toBe(
      '2 techniques expected up to the White belt',
    );

    component['setBeltFilter'](null);
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="syllabus-position-3"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="syllabus-belt-summary"]')).toBeNull();
  });

  it('lets go of the belt filter once the last graded topic goes back to everyone', () => {
    const { fixture, component, httpMock } = graded();
    const el: HTMLElement = fixture.nativeElement;

    component['setBeltFilter']('white');
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="syllabus-position-3"]')).toBeNull();

    // Every belt cleared, one save at a time — here the reload after the last.
    const everyone = (t: SyllabusTopic): SyllabusTopic => ({ ...t, from_belt: null });
    component['startEditing'](TRIANGLE);
    component['form'].patchValue({ fromBelt: null });
    component['submit']();
    httpMock.expectOne(`${SYLLABUS_URL}/23`).flush({ data: everyone(TRIANGLE) });
    flushTree(httpMock, [
      { ...everyone(GUARD), children: GUARD.children?.map(everyone) },
      { ...everyone(LEG_LOCKS), children: LEG_LOCKS.children?.map(everyone) },
    ]);
    flushAcademy(httpMock, 4);
    fixture.detectChanges();

    // The select is gone, and so is what it was narrowing: the whole tree,
    // no summary line promising a filter nobody can see.
    expect(el.querySelector('[data-cy="syllabus-belt-filter"]')).toBeNull();
    expect(el.querySelector('[data-cy="syllabus-position-3"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="syllabus-belt-summary"]')).toBeNull();
    expect(component['beltFilter']()).toBeNull();
  });

  it("keeps a position's hidden kids' belt in the new technique's options", () => {
    const KIDS = topic({ id: 4, name: 'Kids games', from_belt: 'grey', children: [] });
    const { component, httpMock } = setup();
    useLadder('bjj', { trains_kids: false });
    flushTree(httpMock, [KIDS]);

    // Graded while the academy trained kids: the new technique starts on
    // grey, so grey must be there to show — not "for everyone" over a grey
    // that Save would send anyway.
    component['startAddingTechnique'](KIDS);
    expect(component['form'].getRawValue().fromBelt).toBe('grey');
    expect(component['beltOptions']().map((o) => o.value)).toContain('grey');
  });

  it('says which filter emptied the tree, and how to get it back', () => {
    const { fixture, component } = graded();
    const el: HTMLElement = fixture.nativeElement;
    const line = () => el.querySelector('[role="status"]')?.textContent?.trim();

    // Both on, both keeping something: the way back names both.
    component['setQuery']('triangle');
    component['setBeltFilter']('blue');
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="syllabus-search-summary"]')).not.toBeNull();
    expect(line()).toBe(
      '1 technique across 1 position, up to the Blue belt. Clear the search and the belt to get the whole tree back.',
    );

    // The search matched, the belt emptied it: not "nothing matches".
    component['setQuery']('heel');
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="syllabus-no-results"]')).not.toBeNull();
    expect(line()).toBe('"heel" matches, but none of it is expected up to the Blue belt.');

    // The search matched nothing at all: the belt is beside the point.
    component['setQuery']('berimbolo');
    fixture.detectChanges();
    expect(line()).toBe('Nothing in the programme matches "berimbolo".');

    // The belt on its own, with nothing at or below it.
    component['setQuery']('');
    component['positions'].set([LEG_LOCKS]);
    component['setBeltFilter']('white');
    fixture.detectChanges();
    expect(line()).toBe('Nothing in the programme is expected up to the White belt yet.');
  });

  it('offers no belt filter while nothing in the programme names a belt', () => {
    const { fixture, httpMock } = setup();
    useLadder('bjj');
    flushTree(httpMock, [CLOSED_GUARD, K_GUARD]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="syllabus-belt-filter"]')).toBeNull();
  });

  it('shows the belt filter once a belt is named', () => {
    const { fixture } = graded();

    expect(fixture.nativeElement.querySelector('[data-cy="syllabus-belt-filter"]')).not.toBeNull();
  });
});
