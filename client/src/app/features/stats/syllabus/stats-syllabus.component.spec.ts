import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, DebugElement, input, model, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AcademyClass } from '../../../core/services/academy-class.service';
import type { Lesson } from '../../../core/services/lesson.service';
import {
  CoveragePosition,
  CoverageTaughtTopic,
  CoverageTopic,
  SyllabusCoverage,
} from '../../../core/services/stats.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { useLadder } from '../../../../test-utils/ladder-test';
import type { MartialArt, TrainingMode } from '../../../core/services/academy.service';
import { LessonSheetComponent } from '../../lessons/lesson-sheet/lesson-sheet.component';
import { SeasonMapComponent } from './season-map/season-map.component';
import { StatsSyllabusComponent } from './stats-syllabus.component';

/**
 * The season map fetches its own weeks and has its own spec; here it only has
 * to receive the report's rows and controls.
 */
@Component({ selector: 'app-season-map', template: '' })
class SeasonMapStub {
  readonly positions = input<readonly CoveragePosition[]>([]);
  readonly seasonsBack = input<number>(0);
  readonly kind = input<TrainingMode | null>(null);
  readonly classes = input<readonly AcademyClass[]>([]);
  readonly missing = input<readonly CoverageTopic[]>([]);
  readonly taught = input<readonly CoverageTaughtTopic[]>([]);
  readonly plannable = input<ReadonlySet<number>>(new Set<number>());
  readonly planTechnique = output<number>();
  readonly openTechnique = output<number>();
  readonly refreshWeeks = vi.fn();
}

function mapOf(fixture: { debugElement: DebugElement }): SeasonMapStub {
  return fixture.debugElement.query(By.directive(SeasonMapStub)).componentInstance as SeasonMapStub;
}

/** The lesson sheet has its own spec; here it only has to be opened on the right lesson. */
@Component({ selector: 'app-lesson-sheet', template: '' })
class LessonSheetStub {
  readonly visible = model<boolean>(false);
  readonly academyClassId = input<number>(0);
  readonly heldOn = input<string>('');
  readonly className = input<string>('');
  readonly steppable = input<boolean>(false);
  readonly focusTopicId = input<number | null>(null);
  readonly chooseTopicId = input<number | null>(null);
  readonly saved = output<Lesson>();
}

const CLASSES_URL = '/api/v1/academy/classes';

/** Monday gi fundamentals, Wednesday no-gi. */
const CLASSES: AcademyClass[] = [
  { id: 7, name: 'Fundamentals', weekday: 1, starts_at: '19:00', duration_minutes: 60, kind: 'gi' },
  { id: 8, name: 'No-gi', weekday: 3, starts_at: '19:00', duration_minutes: 60, kind: 'nogi' },
];

const URL = '/api/v1/stats/syllabus/coverage';

function report(over: Partial<SyllabusCoverage> = {}): SyllabusCoverage {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    totals: { in_scope: 10, covered: 4, thin: 2, missing: 4, percentage: 40 },
    positions: [
      {
        id: 1,
        name: 'Closed guard',
        kind: 'both',
        in_scope: 6,
        covered: 3,
        thin: 1,
        missing: 2,
        worked: 0,
      },
      {
        id: 2,
        name: 'Half guard',
        kind: 'both',
        in_scope: 4,
        covered: 1,
        thin: 1,
        missing: 2,
        worked: 2,
      },
    ],
    missing: [
      { id: 31, name: 'Omoplata', parent_id: 1, parent_name: 'Closed guard', kind: 'both' },
      { id: 32, name: 'Lockdown', parent_id: 2, parent_name: 'Half guard', kind: 'nogi' },
    ],
    taught: [
      {
        id: 11,
        name: 'Armbar',
        parent_id: 1,
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 3,
        reach: 11,
        attendances: 24,
        last_taught_on: '2026-10-05',
        state: 'covered',
      },
      {
        id: 12,
        name: 'Triangle',
        parent_id: 1,
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 1,
        reach: 1,
        attendances: 1,
        last_taught_on: '2026-09-07',
        state: 'thin',
      },
    ],
    ...over,
  };
}

/**
 * `art` loads an academy teaching it first (#1803); none reads as BJJ.
 * `classes` is the timetable a never-taught technique can be planned into (#1656).
 */
function setup(art?: MartialArt, classes: AcademyClass[] = CLASSES) {
  TestBed.configureTestingModule({
    imports: [StatsSyllabusComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      ...provideI18nTesting(),
    ],
  });
  TestBed.overrideComponent(StatsSyllabusComponent, {
    remove: { imports: [SeasonMapComponent, LessonSheetComponent] },
    add: { imports: [SeasonMapStub, LessonSheetStub] },
  });

  if (art) useLadder(art);

  const fixture = TestBed.createComponent(StatsSyllabusComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock.expectOne(CLASSES_URL).flush({ data: classes });
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flush(httpMock: HttpTestingController, data: SyllabusCoverage = report()) {
  const req = httpMock.expectOne((r) => r.url === URL);
  req.flush({ data });
  return req;
}

describe('StatsSyllabusComponent (#1565)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for the current season and everything, before any filter is touched', () => {
    const { httpMock } = setup();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('seasons_back')).toBe('0');
    expect(req.request.params.has('kind')).toBe(false);
    req.flush({ data: report() });
  });

  it('leads with the percentage and the fraction behind it', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-cy="syllabus-coverage-percentage"]')?.textContent?.trim(),
    ).toContain('40');
    // The fraction is what makes the percentage mean something — and it
    // says which rule it counts by, because the athlete tab counts by another
    // (#1748).
    expect(el.textContent).toContain(
      "4 of 10 in the season's programme, each taught at least twice",
    );
  });

  it('names the rule the athlete tab counts by, next to the number (#1748)', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    // An owner reading 100% on an athlete and 34% here would conclude the
    // athlete has seen a third of the programme. The line under the headline
    // is what stops that reading.
    const rule = fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-rule"]');
    expect(rule.textContent).toContain('after one lesson');
  });

  it('keeps the caption in view and folds the other rule behind the number (#1853)', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const method = root.querySelector(
      'details[data-cy="syllabus-coverage-method"]',
    ) as HTMLDetailsElement;
    expect(method.open).toBe(false);
    expect(method.querySelector('[data-cy="syllabus-coverage-rule"]')).not.toBeNull();
    expect(method.contains(root.querySelector('.coverage__caption'))).toBe(false);
  });

  it('splits the tally three ways, because one number would hide the thin half', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const totals = fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-totals"]');
    expect(totals.textContent).toContain('4 covered');
    expect(totals.textContent).toContain('2 taught once');
    expect(totals.textContent).toContain('4 not taught');
    // In words only: the accent's strengths key the map (#1858), not this line.
    expect(totals.querySelector('.tally__dot')).toBeNull();
  });

  it('hands the season map the report positions, its season and its filter (#1858)', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const map = fixture.debugElement.query(By.directive(SeasonMapStub))
      .componentInstance as SeasonMapStub;
    expect(map.positions().map((p) => p.name)).toEqual(['Closed guard', 'Half guard']);
    expect(map.seasonsBack()).toBe(0);
    // "all" is the absence of a filter, not a value the server knows.
    expect(map.kind()).toBeNull();

    component['setKind']('nogi');
    fixture.detectChanges();
    flush(httpMock, report({ kind: 'nogi' }));
    fixture.detectChanges();

    const filtered = fixture.debugElement.query(By.directive(SeasonMapStub))
      .componentInstance as SeasonMapStub;
    expect(filtered.kind()).toBe('nogi');
  });

  it('hands the season map the techniques, as the server sent them (#1911)', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const map = mapOf(fixture);
    expect(map.missing().map((t) => t.id)).toEqual([31, 32]);
    expect(map.taught().map((t) => t.id)).toEqual([11, 12]);
  });

  it('draws no timeline and no flat lists under the map (#1911)', () => {
    // The chart read as a flat line on the floor for months, and the lists
    // reprinted the programme: 264 rows in week three.
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-coverage-timeline"]')).toBeNull();
    expect(el.querySelector('[data-cy="syllabus-coverage-missing"]')).toBeNull();
    expect(el.querySelector('[data-cy="syllabus-coverage-taught"]')).toBeNull();
    expect(el.querySelector('p-chart')).toBeNull();
  });

  it('re-asks with the filter, and narrows both halves of the fraction', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    component['setKind']('nogi');
    fixture.detectChanges(); // the refetch is an effect — flush it

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('kind')).toBe('nogi');
    req.flush({
      data: report({
        kind: 'nogi',
        totals: { in_scope: 3, covered: 1, thin: 0, missing: 2, percentage: 33 },
      }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "1 of 3 in the season's programme, each taught at least twice",
    );
  });

  it('walks back a season and forward again, and will not go past the current one', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    // Forward from the current season is nowhere to go.
    const next = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-coverage-next"]',
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    component['shiftSeason'](1);
    fixture.detectChanges();
    const back = httpMock.expectOne((r) => r.url === URL);
    expect(back.request.params.get('seasons_back')).toBe('1');
    back.flush({
      data: report({ season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' } }),
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-season"]').textContent,
    ).toContain('2025/26');
  });

  it('tells an academy with no programme what to do instead of showing it a 0%', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
        positions: [],
        missing: [],
        taught: [],
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-coverage-no-programme"]')).not.toBeNull();
    // "0%" against nothing is not a score — the headline is gone entirely.
    expect(el.querySelector('[data-cy="syllabus-coverage-percentage"]')).toBeNull();
    // The way out is the same filled button every other empty state has (STSY-2).
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const cta = el.querySelector(
      '[data-cy="syllabus-coverage-no-programme-cta"] button',
    ) as HTMLButtonElement;
    expect(cta.textContent).toContain('Open the programme');
    cta.click();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/academy/syllabus']);
    expect(el.querySelector('[data-cy="syllabus-coverage-programme-link"]')).toBeNull();
    // No map, no lists — there is nothing to measure against.
    expect(el.querySelector('app-season-map')).toBeNull();
  });

  it('tells an academy with a programme and no lessons to go and teach', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report({ taught: [] }));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-coverage-nothing-taught"]')).not.toBeNull();
    // The tally still shows: "0 covered, 10 not taught" is the honest state.
    expect(el.querySelector('[data-cy="syllabus-coverage-totals"]')).not.toBeNull();
    // And the map: a season with only plans on it is when the map matters (#1858).
    expect(el.querySelector('app-season-map')).not.toBeNull();
  });

  it('offers a retry when the read fails', () => {
    const { fixture, httpMock } = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-error"]'),
    ).not.toBeNull();

    fixture.componentInstance['retry']();
    fixture.detectChanges();
    flush(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="syllabus-coverage"]')).not.toBeNull();
  });

  it('will not walk back past the tenth season — the server refuses it', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    for (let i = 0; i < 10; i++) {
      component['shiftSeason'](1);
      fixture.detectChanges();
      flush(httpMock);
      fixture.detectChanges();
    }

    expect(component['seasonsBack']()).toBe(10);
    const prev = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-coverage-prev"]',
    ) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);

    // One more press asks for nothing: eleven is a 422 the retry cannot
    // escape, so the control stops instead.
    component['shiftSeason'](1);
    fixture.detectChanges();
    httpMock.expectNone((r) => r.url === URL);
  });
});

describe('StatsSyllabusComponent — who has seen it (#1745)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('opens who has seen a technique the map asks for, in the season on screen', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    mapOf(fixture).openTechnique.emit(11);
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/stats/syllabus/topics/11');
    expect(req.request.params.get('seasons_back')).toBe('0');
    req.flush({ message: 'not the point' }, { status: 500, statusText: 'Server Error' });
  });

  it('keeps reach out of the headline, number and caption alike', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    // The whole headline block: the percentage, the caption and the rule.
    // Reach is a column on the rows; it must never climb into the fraction.
    const headline: HTMLElement = fixture.nativeElement.querySelector('.coverage__headline');
    expect(headline).not.toBeNull();
    expect(headline.textContent).not.toContain('11');
    expect(headline.textContent).not.toMatch(/people|person/);
  });
});

describe('StatsSyllabusComponent — training modes (#1803)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it("filters by the academy's own two modes, and says so to a screen reader", () => {
    const { fixture, httpMock } = setup('judo');
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const options = Array.from(
      el.querySelectorAll<HTMLElement>('[data-cy="syllabus-coverage-kind"] .p-togglebutton'),
    ).map((b) => b.textContent?.trim());
    expect(options).toEqual(['All', 'Tachi-waza', 'Ne-waza']);
    expect(el.querySelector('#syllabus-coverage-kind-label')?.textContent?.trim()).toBe(
      'Count tachi-waza, ne-waza, or everything',
    );
  });

  it('asks the server for the mode picked', () => {
    const { fixture, component, httpMock } = setup('karate');
    flush(httpMock);
    fixture.detectChanges();

    component['setKind']('kumite');
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('kind')).toBe('kumite');
    req.flush({ data: report({ kind: 'kumite' }) });
  });

  it('keeps the BJJ filter as it was', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#syllabus-coverage-kind-label')?.textContent?.trim()).toBe(
      'Count gi, no-gi, or everything',
    );
  });
});

describe('StatsSyllabusComponent — plan what was never taught (#1656)', () => {
  // Wednesday 14 October 2026: the no-gi class is tonight, the gi one Monday.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
  });

  // The clock first: a failing verify() must not leave the next file on it.
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  const GI_ONLY = report({
    missing: [{ id: 31, name: 'Omoplata', parent_id: 1, parent_name: 'Closed guard', kind: 'gi' }],
  });

  function sheet(fixture: { debugElement: DebugElement }) {
    return fixture.debugElement.query(By.directive(LessonSheetStub))?.componentInstance as
      LessonSheetStub | undefined;
  }

  /** "Pianifica" on a technique in the map's panel (#1911). */
  function planFromMap(fixture: { debugElement: DebugElement; detectChanges(): void }, id: number) {
    mapOf(fixture).planTechnique.emit(id);
    fixture.detectChanges();
  }

  function plannable(fixture: { debugElement: DebugElement }): number[] {
    return [...mapOf(fixture).plannable()].sort();
  }

  it('plans a gi technique onto the next gi class, with the technique chosen', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, GI_ONLY);
    fixture.detectChanges();

    planFromMap(fixture, 31);

    // Tonight's no-gi class is skipped: it may not teach a gi technique.
    const opened = sheet(fixture)!;
    expect(opened.visible()).toBe(true);
    expect(opened.academyClassId()).toBe(7);
    expect(opened.heldOn()).toBe('2026-10-19');
    expect(opened.className()).toBe('Fundamentals');
    expect(opened.steppable()).toBe(true);
    expect(opened.focusTopicId()).toBe(31);
    expect(opened.chooseTopicId()).toBe(31);
  });

  it('takes tonight when tonight’s class may teach it', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    // Lockdown is no-gi: Wednesday's class, today.
    planFromMap(fixture, 32);

    expect(sheet(fixture)!.heldOn()).toBe('2026-10-14');
    expect(sheet(fixture)!.academyClassId()).toBe(8);
  });

  it('shows the plan on the season map once it is saved', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, GI_ONLY);
    fixture.detectChanges();

    planFromMap(fixture, 31);
    // A plan is not coverage: the report has nothing to read again.
    sheet(fixture)!.saved.emit({ held: false } as Lesson);

    expect(mapOf(fixture).refreshWeeks).toHaveBeenCalled();
  });

  it('reads the report again when the lesson planned into was already held', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    // Lockdown, onto tonight's no-gi class — which already has people in it.
    planFromMap(fixture, 32);
    sheet(fixture)!.saved.emit({ held: true } as Lesson);
    fixture.detectChanges();

    // Read quietly: the page stays where the owner scrolled it.
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-coverage"]')).not.toBeNull();

    const again = httpMock.expectOne((r) => r.url === URL);
    expect(again.request.params.get('seasons_back')).toBe('0');
    again.flush({
      data: report({
        missing: [
          { id: 31, name: 'Omoplata', parent_id: 1, parent_name: 'Closed guard', kind: 'both' },
        ],
      }),
    });
    fixture.detectChanges();

    // Taught now: out of what the map lists as still to do.
    expect(
      mapOf(fixture)
        .missing()
        .map((t) => t.id),
    ).toEqual([31]);
  });

  it('offers no plan where no class may teach it', () => {
    // A gi-only timetable: the no-gi Lockdown has nowhere to go.
    const { fixture, httpMock } = setup(undefined, [CLASSES[0]]);
    flush(httpMock);
    fixture.detectChanges();

    expect(plannable(fixture)).toEqual([31]);
  });

  it('offers no plan past the end of the season', () => {
    const { fixture, httpMock } = setup();
    // The season closes on Sunday the 18th: Monday's gi class is the next one's.
    flush(
      httpMock,
      report({
        season: { start: '2025-10-19', end: '2026-10-18', label: '2025/26' },
        missing: [
          { id: 31, name: 'Omoplata', parent_id: 1, parent_name: 'Closed guard', kind: 'gi' },
          { id: 32, name: 'Lockdown', parent_id: 2, parent_name: 'Half guard', kind: 'nogi' },
        ],
      }),
    );
    fixture.detectChanges();

    // Tonight's no-gi class is still inside it.
    expect(plannable(fixture)).toEqual([32]);
  });

  it('offers no plan in a season gone by', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    component['shiftSeason'](1);
    fixture.detectChanges();
    flush(httpMock);
    fixture.detectChanges();

    expect(plannable(fixture)).toEqual([]);
  });
});

describe('StatsSyllabusComponent — one timetable for the page (#1656)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the timetable once, and the season map plans from that same one', () => {
    // The real map this time: the point is that it does not read its own.
    TestBed.configureTestingModule({
      imports: [StatsSyllabusComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        MessageService,
        ...provideI18nTesting(),
      ],
    });
    TestBed.overrideComponent(StatsSyllabusComponent, {
      remove: { imports: [LessonSheetComponent] },
      add: { imports: [LessonSheetStub] },
    });

    const fixture = TestBed.createComponent(StatsSyllabusComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flush(httpMock);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/api/v1/stats/syllabus/calendar')
      .flush({
        data: {
          season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
          kind: null,
          today: '2026-10-14',
          weeks: [],
          positions: [],
          lessons: [],
        },
      });
    fixture.detectChanges();

    // Exactly one read, for the list and the map alike.
    const reads = httpMock.match(CLASSES_URL);
    expect(reads).toHaveLength(1);
    reads[0].flush({ data: CLASSES });
    fixture.detectChanges();

    const map = fixture.debugElement.query(By.directive(SeasonMapComponent))
      .componentInstance as SeasonMapComponent;
    expect(map.classes()).toEqual(CLASSES);
  });
});
