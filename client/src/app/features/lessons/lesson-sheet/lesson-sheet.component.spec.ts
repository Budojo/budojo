import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { Lesson, LessonSuggestion, LessonTopic } from '../../../core/services/lesson.service';
import { SyllabusTopic } from '../../../core/services/syllabus.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LessonSheetComponent } from './lesson-sheet.component';

const LESSON_URL = '/api/v1/lessons';
const SYLLABUS_URL = '/api/v1/academy/syllabus';
const RECENT_URL = '/api/v1/lessons/recent-topics';
const SUGGEST_URL = '/api/v1/lessons/suggestions';

function topic(over: Partial<SyllabusTopic> & { id: number }): SyllabusTopic {
  return {
    parent_id: null,
    name: `Topic ${over.id}`,
    kind: 'both',
    in_season: true,
    sort_order: 0,
    ...over,
  };
}

function lessonTopic(over: Partial<LessonTopic> & { id: number }): LessonTopic {
  return {
    name: `Topic ${over.id}`,
    kind: 'both',
    parent_id: null,
    parent_name: null,
    deleted: false,
    ...over,
  };
}

const ARMBAR = topic({ id: 11, parent_id: 1, name: 'Armbar' });
const TRIANGLE = topic({ id: 12, parent_id: 1, name: 'Triangle' });
const CLOSED_GUARD = topic({ id: 1, name: 'Closed guard', children: [ARMBAR, TRIANGLE] });
const MOUNT = topic({
  id: 2,
  name: 'Mount',
  sort_order: 1,
  children: [topic({ id: 21, parent_id: 2, name: 'Ezekiel' })],
});

function suggestion(over: Partial<LessonSuggestion> & { id: number }): LessonSuggestion {
  return {
    name: `Topic ${over.id}`,
    parent_name: null,
    kind: 'both',
    reason: 'never',
    last_taught_on: null,
    ...over,
  };
}

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 7,
    academy_class_id: 3,
    held_on: '2026-09-14',
    name: 'Fundamentals',
    starts_at: '19:00',
    kind: 'gi',
    notes: null,
    held: false,
    topics: [],
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [LessonSheetComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      MessageService,
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(LessonSheetComponent);
  fixture.componentRef.setInput('academyClassId', 3);
  fixture.componentRef.setInput('heldOn', '2026-09-14');
  fixture.componentRef.setInput('className', 'Fundamentals');
  fixture.componentRef.setInput('visible', true);
  fixture.detectChanges();

  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flushOpen(
  httpMock: HttpTestingController,
  opts: {
    lesson?: Lesson | null;
    positions?: SyllabusTopic[];
    recent?: LessonTopic[];
    suggestions?: LessonSuggestion[];
  } = {},
): void {
  httpMock
    .expectOne((r) => r.url === LESSON_URL && r.method === 'GET')
    .flush({ data: opts.lesson === undefined ? null : opts.lesson });
  httpMock.expectOne(SYLLABUS_URL).flush({ data: opts.positions ?? [CLOSED_GUARD, MOUNT] });
  httpMock.expectOne(RECENT_URL).flush({ data: opts.recent ?? [] });
  httpMock.expectOne((r) => r.url === SUGGEST_URL).flush({ data: opts.suggestions ?? [] });
}

describe('LessonSheetComponent (#1564)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the slot, the programme and what was taught lately, all at once', () => {
    const { fixture, httpMock } = setup();

    const read = httpMock.expectOne((r) => r.url === LESSON_URL && r.method === 'GET');
    expect(read.request.params.get('academy_class_id')).toBe('3');
    expect(read.request.params.get('held_on')).toBe('2026-09-14');
    read.flush({ data: null });
    httpMock.expectOne(SYLLABUS_URL).flush({ data: [CLOSED_GUARD] });
    httpMock.expectOne(RECENT_URL).flush({ data: [] });
    httpMock.expectOne((r) => r.url === SUGGEST_URL).flush({ data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-tree"]')).not.toBeNull();
  });

  it('opens on the positions, not on three hundred technique names', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="lesson-expand-1"]')).not.toBeNull();
    // Hick's law: the techniques are one tap away, not in the way.
    expect(el.querySelector('[data-cy="lesson-topic-11"]')).toBeNull();

    (el.querySelector('[data-cy="lesson-expand-1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="lesson-topic-11"]')).not.toBeNull();
  });

  it('searches across both levels at once', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock);
    fixture.detectChanges();

    // A position's name finds the position and everything under it.
    component['query'].set('closed');
    fixture.detectChanges();
    let names = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-cy="lesson-sheet-results"] .topic__name',
      ) as NodeListOf<HTMLElement>,
    ).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Closed guard', 'Armbar', 'Triangle']);

    // A technique's name finds it wherever it lives.
    component['query'].set('ezek');
    fixture.detectChanges();
    names = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-cy="lesson-sheet-results"] .topic__name',
      ) as NodeListOf<HTMLElement>,
    ).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Ezekiel']);
  });

  it('says so when the search finds nothing', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock);
    component['query'].set('berimbolo');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="lesson-sheet-no-results"]')?.textContent,
    ).toContain('berimbolo');
  });

  it('offers what was taught lately, and drops one from that group once it is chosen', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, {
      recent: [lessonTopic({ id: 11, name: 'Armbar', parent_name: 'Closed guard' })],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="lesson-recent-11"]')).not.toBeNull();

    component['toggle'](11);
    fixture.detectChanges();

    // It moved to the chosen group rather than sitting in both.
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-recent-11"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-chip-11"]')).not.toBeNull();
  });

  it('seeds the ticks from what the lesson already covers', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, {
      lesson: lesson({ topics: [lessonTopic({ id: 11, name: 'Armbar' })], notes: 'Warm gym' }),
    });
    fixture.detectChanges();

    expect(component['isChosen'](11)).toBe(true);
    expect(component['notes']()).toBe('Warm gym');
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-chip-11"]')).not.toBeNull();
  });

  it('sends the whole list on save, and only when it changed', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, { lesson: lesson({ topics: [lessonTopic({ id: 11, name: 'Armbar' })] }) });
    fixture.detectChanges();

    component['toggle'](12);
    component['save']();

    const req = httpMock.expectOne(`${LESSON_URL}/topics`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.academy_class_id).toBe(3);
    expect(req.request.body.held_on).toBe('2026-09-14');
    expect([...req.request.body.topic_ids].sort()).toEqual([11, 12]);
    req.flush({ data: lesson({ topics: [lessonTopic({ id: 11 }), lessonTopic({ id: 12 })] }) });

    // Notes were not touched, so no second call.
    httpMock.expectNone(`${LESSON_URL}/notes`);
    expect(component['visible']()).toBe(false);
  });

  it('saves a note on its own', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock);
    fixture.detectChanges();

    component['notes'].set('  Marco is back  ');
    component['save']();

    httpMock.expectNone(`${LESSON_URL}/topics`);
    const req = httpMock.expectOne(`${LESSON_URL}/notes`);
    expect(req.request.body.notes).toBe('Marco is back');
    req.flush({ data: lesson({ notes: 'Marco is back' }) });
  });

  it('asks for nothing when nothing changed', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, { lesson: lesson({ topics: [lessonTopic({ id: 11 })], notes: 'Kept' }) });
    fixture.detectChanges();

    component['save']();

    httpMock.expectNone(`${LESSON_URL}/topics`);
    httpMock.expectNone(`${LESSON_URL}/notes`);
    // Saving nothing still closes: pressing Save must always mean "done".
    expect(component['visible']()).toBe(false);
  });

  it('reordering the same topics is not a change', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, {
      lesson: lesson({ topics: [lessonTopic({ id: 11 }), lessonTopic({ id: 12 })] }),
    });
    fixture.detectChanges();

    // Off and on again lands the same set in a different insertion order.
    component['toggle'](11);
    component['toggle'](11);
    component['save']();

    httpMock.expectNone(`${LESSON_URL}/topics`);
  });

  it('shows a departed topic, locked, and never sends it back', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, {
      lesson: lesson({
        topics: [
          lessonTopic({ id: 11, name: 'Armbar' }),
          lessonTopic({ id: 99, name: 'Worm guard', deleted: true }),
        ],
      }),
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="lesson-chip-gone-99"]')?.textContent).toContain(
      'Worm guard',
    );
    // Not a button: it cannot be unticked here.
    expect(el.querySelector('[data-cy="lesson-chip-gone-99"]')?.tagName).toBe('SPAN');
    expect(component['isChosen'](99)).toBe(false);

    component['toggle'](12);
    component['save']();

    const req = httpMock.expectOne(`${LESSON_URL}/topics`);
    // The server carries the departed link through the sync; the client
    // never re-sends an id the picker cannot offer.
    expect([...req.request.body.topic_ids].sort()).toEqual([11, 12]);
    req.flush({ data: lesson() });
  });

  it('says whether the lesson is a plan or a thing that happened', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, { lesson: lesson({ held: false }) });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="lesson-sheet-state"]')?.textContent?.trim(),
    ).toBe('Planned');
  });

  it('points at the programme when there is none to pick from', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, { positions: [] });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="lesson-sheet-no-programme"]'),
    ).not.toBeNull();
  });

  it('keeps nothing from the last slot when the open fails', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, {
      lesson: lesson({ topics: [lessonTopic({ id: 11, name: 'Armbar' })], notes: 'Warm gym' }),
    });
    fixture.detectChanges();
    expect(component['isChosen'](11)).toBe(true);

    // Same instance, new slot — the check-in reuses it across class chips.
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('heldOn', '2026-09-21');
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    // The siblings answer first: `forkJoin` cancels them the moment one
    // errors, and a cancelled request cannot be flushed.
    httpMock.expectOne(SYLLABUS_URL).flush({ data: [] });
    httpMock.expectOne(RECENT_URL).flush({ data: [] });
    httpMock.expectOne((r) => r.url === SUGGEST_URL).flush({ data: [] });
    httpMock
      .expectOne((r) => r.url === LESSON_URL && r.method === 'GET')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Nothing of the previous lesson survives — it would otherwise render
    // under the new header and be written into the new slot on Save.
    expect(component['isChosen'](11)).toBe(false);
    expect(component['notes']()).toBe('');
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-error"]')).not.toBeNull();
    // And an empty picker must not read as "this academy has no programme".
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-no-programme"]')).toBeNull();

    component['save']();
    httpMock.expectNone(`${LESSON_URL}/topics`);
    httpMock.expectNone(`${LESSON_URL}/notes`);
  });

  it('writes the topics before the notes, so the last answer is the whole truth', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock);
    fixture.detectChanges();

    component['toggle'](11);
    component['notes'].set('Warm gym');
    component['save']();

    // The notes call has not been made yet: it waits for the topics reply,
    // or it could answer with a pre-sync topic list.
    httpMock.expectNone(`${LESSON_URL}/notes`);
    httpMock
      .expectOne(`${LESSON_URL}/topics`)
      .flush({ data: lesson({ topics: [lessonTopic({ id: 11, name: 'Armbar' })] }) });

    const notesReq = httpMock.expectOne(`${LESSON_URL}/notes`);
    expect(notesReq.request.body.notes).toBe('Warm gym');

    const emitted: unknown[] = [];
    component.saved.subscribe((l) => emitted.push(l));
    notesReq.flush({
      data: lesson({ notes: 'Warm gym', topics: [lessonTopic({ id: 11, name: 'Armbar' })] }),
    });

    // What the host gets is the second answer, which carries both changes.
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { notes: string }).notes).toBe('Warm gym');
  });

  it('re-reads when it is opened again — the slot may have moved', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock);
    fixture.detectChanges();

    // Closed the way the host closes it: through the two-way binding, so the
    // input's own last-written value moves with it.
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();

    fixture.componentRef.setInput('heldOn', '2026-09-21');
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const read = httpMock.expectOne((r) => r.url === LESSON_URL && r.method === 'GET');
    expect(read.request.params.get('held_on')).toBe('2026-09-21');
    read.flush({ data: null });
    httpMock.expectOne(SYLLABUS_URL).flush({ data: [] });
    httpMock.expectOne(RECENT_URL).flush({ data: [] });
    httpMock.expectOne((r) => r.url === SUGGEST_URL).flush({ data: [] });
  });
});

describe('LessonSheetComponent — what to teach tonight (#1566)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for suggestions by class, not by slot', () => {
    const { httpMock } = setup();

    httpMock.expectOne((r) => r.url === LESSON_URL && r.method === 'GET').flush({ data: null });
    httpMock.expectOne(SYLLABUS_URL).flush({ data: [CLOSED_GUARD] });
    httpMock.expectOne(RECENT_URL).flush({ data: [] });

    const ask = httpMock.expectOne((r) => r.url === SUGGEST_URL);
    // The ranking reads the season so far, so the date would imply a
    // precision the rules do not have.
    expect(ask.request.params.get('academy_class_id')).toBe('3');
    expect(ask.request.params.get('held_on')).toBeNull();
    ask.flush({ data: [] });
  });

  it('shows each suggestion with the reason it was suggested', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, {
      suggestions: [
        suggestion({ id: 11, name: 'Armbar', parent_name: 'Closed guard', reason: 'never' }),
        suggestion({
          id: 12,
          name: 'Triangle',
          reason: 'thin',
          last_taught_on: '2026-03-12',
        }),
      ],
    });
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-cy="lesson-sheet-suggestions"]');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Armbar');
    expect(panel.textContent).toContain('Closed guard');
    // A suggestion whose reasoning is invisible gets ignored.
    expect(panel.textContent).toContain('Not taught yet this season');
    expect(panel.textContent).toContain('12 Mar');
  });

  it('never pre-selects a suggestion', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, { suggestions: [suggestion({ id: 11, name: 'Armbar' })] });
    fixture.detectChanges();

    // A suggestion that fills the field becomes wrong data the evening the
    // instructor teaches something else.
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-chosen"]')).toBeNull();
    const button = fixture.nativeElement.querySelector('[data-cy="lesson-suggestion-11"]');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('accepts one in a single tap, and it leaves the suggestions', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, {
      suggestions: [
        suggestion({ id: 11, name: 'Armbar' }),
        suggestion({ id: 12, name: 'Triangle' }),
      ],
    });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-cy="lesson-suggestion-11"]').click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-cy="lesson-sheet-suggestions"]');
    expect(panel.textContent).not.toContain('Armbar');
    expect(panel.textContent).toContain('Triangle');
  });

  it('lets one be waved away without touching the lesson', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, {
      suggestions: [
        suggestion({ id: 11, name: 'Armbar' }),
        suggestion({ id: 12, name: 'Triangle' }),
      ],
    });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-cy="lesson-suggestion-dismiss-11"]').click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-cy="lesson-sheet-suggestions"]');
    expect(panel.textContent).not.toContain('Armbar');
    expect(panel.textContent).toContain('Triangle');
    // Dismissing is not choosing: nothing was added to the lesson.
    expect(component['selected']().size).toBe(0);
  });

  it('hides the panel entirely when every suggestion is gone', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, { suggestions: [suggestion({ id: 11, name: 'Armbar' })] });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-cy="lesson-suggestion-dismiss-11"]').click();
    fixture.detectChanges();

    // An empty group with a heading is worse than no group.
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-suggestions"]')).toBeNull();
  });

  it('renders no panel at all for an academy with no programme', () => {
    const { fixture, httpMock } = setup();
    flushOpen(httpMock, { positions: [], suggestions: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-suggestions"]')).toBeNull();
  });

  it('forgets what was waved away when the sheet is reopened on another slot', () => {
    const { fixture, component, httpMock } = setup();
    flushOpen(httpMock, { suggestions: [suggestion({ id: 11, name: 'Armbar' })] });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-cy="lesson-suggestion-dismiss-11"]').click();
    fixture.detectChanges();
    expect(component['dismissed']().size).toBe(1);

    // "Not tonight" is not "never". An internal set() does not reset the
    // input's memo, so the close has to go through the input.
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    flushOpen(httpMock, { suggestions: [suggestion({ id: 11, name: 'Armbar' })] });
    fixture.detectChanges();

    expect(component['dismissed']().size).toBe(0);
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-suggestion-11"]')).not.toBeNull();
  });
});

describe('LessonSheetComponent — a suggestions hiccup is not a broken sheet', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('still opens and stays editable when the suggestions call fails', () => {
    const { fixture, component, httpMock } = setup();

    httpMock
      .expectOne((r) => r.url === LESSON_URL && r.method === 'GET')
      .flush({ data: lesson({ topics: [] }) });
    httpMock.expectOne(SYLLABUS_URL).flush({ data: [CLOSED_GUARD] });
    httpMock.expectOne(RECENT_URL).flush({ data: [] });
    httpMock
      .expectOne((r) => r.url === SUGGEST_URL)
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Suggestions are the one piece of this dialog nobody needs. Failing the
    // whole open because a dismissable panel did not load would stop an
    // instructor writing down what they just taught.
    expect(component['loadFailed']()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-tree"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="lesson-sheet-suggestions"]')).toBeNull();

    // And the lesson is still editable, which is the whole point.
    fixture.nativeElement.querySelector('[data-cy="lesson-topic-1"]').click();
    fixture.detectChanges();
    expect(component['selected']().has(1)).toBe(true);
  });
});
