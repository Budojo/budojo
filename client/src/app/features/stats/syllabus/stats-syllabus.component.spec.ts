import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, DebugElement, input, model, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { AcademyClass } from '../../../core/services/academy-class.service';
import type { Lesson } from '../../../core/services/lesson.service';
import { CoveragePosition, SyllabusCoverage } from '../../../core/services/stats.service';
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
  readonly refreshWeeks = vi.fn();
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
      { id: 31, name: 'Omoplata', parent_name: 'Closed guard', kind: 'both' },
      { id: 32, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' },
    ],
    taught: [
      {
        id: 11,
        name: 'Armbar',
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
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 1,
        reach: 1,
        attendances: 1,
        last_taught_on: '2026-09-07',
        state: 'thin',
      },
    ],
    timeline: [
      { on: '2026-09-06', covered: 0 },
      { on: '2026-09-13', covered: 2 },
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

  it('lists what has not been taught, with the position it belongs to', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const missing = fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-missing"]');
    expect(missing.textContent).toContain('Not taught yet (2)');
    expect(missing.textContent).toContain('Omoplata');
    expect(missing.textContent).toContain('Closed guard');
  });

  it('answers when each topic was last on the mat, and how long ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19)); // 19 October 2026
    try {
      const { fixture, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector(
        '[data-cy="syllabus-taught-11"]',
      ) as HTMLElement;
      // 5 October → two weeks before 19 October.
      expect(row.textContent?.replace(/\s+/g, ' ')).toContain('2 weeks ago');
      // Taught once carries its own mark, so "last taught" does not read as
      // "done".
      const thinRow = fixture.nativeElement.querySelector('[data-cy="syllabus-taught-12"]');
      expect(thinRow.textContent).toContain('Once');
    } finally {
      vi.useRealTimers();
    }
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

  it('says nothing is missing rather than drawing an empty list', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report({ missing: [] }));
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-nothing-missing"]'),
    ).not.toBeNull();
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

  it('scales the timeline against the denominator, not against its own peak', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const options = component['timelineOptions']() as { scales: { y: { suggestedMax: number } } };
    expect(options.scales.y.suggestedMax).toBe(10);
    expect(component['timelineData']().datasets[0].data).toEqual([0, 2]);
  });
});

describe('StatsSyllabusComponent — who has seen it (#1745)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('opens a taught row on who has seen that technique, in the season on screen', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const open: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-taught-11"] button',
    );
    open.click();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/stats/syllabus/topics/11');
    expect(req.request.params.get('seasons_back')).toBe('0');
    req.flush({ message: 'not the point' }, { status: 500, statusText: 'Server Error' });
  });

  it('names the button by what it shows, with a lead-in and the position', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const open: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-taught-11"] button',
    );
    // No aria-label replacing the visible text (WCAG 2.5.3): the name is the
    // content, and it carries the position, because the seed repeats names.
    expect(open.hasAttribute('aria-label')).toBe(false);
    const name = open.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(name).toContain('Who has seen it:');
    expect(name).toContain('Armbar');
    expect(name).toContain('(Closed guard)');
  });

  it('says how many people a taught technique reached, beside its lessons (#1746)', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const reach = (id: number) =>
      el
        .querySelector(`[data-cy="syllabus-taught-${id}"] [data-cy="syllabus-taught-reach"]`)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim();

    // Three evenings of fifteen and three of four read the same without it.
    expect(reach(11)).toBe('3 lessons · 11 people');
    // One and one: both singular.
    expect(reach(12)).toBe('1 lesson · 1 person');
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

  it('keeps both lists in the order the server sent them', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const ids = (panel: string) =>
      Array.from(fixture.nativeElement.querySelectorAll(`[data-cy="${panel}"] li[data-cy]`)).map(
        (li) => (li as HTMLElement).getAttribute('data-cy'),
      );

    expect(ids('syllabus-coverage-missing')).toEqual([
      'syllabus-missing-31',
      'syllabus-missing-32',
    ]);
    expect(ids('syllabus-coverage-taught')).toEqual(['syllabus-taught-11', 'syllabus-taught-12']);
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
    missing: [{ id: 31, name: 'Omoplata', parent_name: 'Closed guard', kind: 'gi' }],
  });

  function sheet(fixture: { debugElement: DebugElement }) {
    return fixture.debugElement.query(By.directive(LessonSheetStub))?.componentInstance as
      LessonSheetStub | undefined;
  }

  function planButton(fixture: { nativeElement: HTMLElement }, id: number) {
    return fixture.nativeElement.querySelector(
      `[data-cy="syllabus-missing-${id}"] button`,
    ) as HTMLButtonElement | null;
  }

  it('plans a gi technique onto the next gi class, with the technique chosen', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, GI_ONLY);
    fixture.detectChanges();

    planButton(fixture, 31)!.click();
    fixture.detectChanges();

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
    planButton(fixture, 32)!.click();
    fixture.detectChanges();

    expect(sheet(fixture)!.heldOn()).toBe('2026-10-14');
    expect(sheet(fixture)!.academyClassId()).toBe(8);
  });

  it('names the row by what it shows, and by what pressing it does', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const button = planButton(fixture, 31)!;
    expect(button.hasAttribute('aria-label')).toBe(false);
    const name = button.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(name).toContain('Omoplata');
    expect(name).toContain('Closed guard');
    expect(name).toContain('Plan');
  });

  it('shows the plan on the season map once it is saved', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, GI_ONLY);
    fixture.detectChanges();

    planButton(fixture, 31)!.click();
    fixture.detectChanges();
    sheet(fixture)!.saved.emit({} as Lesson);

    const map = fixture.debugElement.query(By.directive(SeasonMapStub))
      .componentInstance as SeasonMapStub;
    expect(map.refreshWeeks).toHaveBeenCalled();
  });

  it('offers no plan where no class may teach it', () => {
    // A gi-only timetable: the no-gi Lockdown has nowhere to go.
    const { fixture, httpMock } = setup(undefined, [CLASSES[0]]);
    flush(httpMock);
    fixture.detectChanges();

    expect(planButton(fixture, 31)).not.toBeNull();
    expect(planButton(fixture, 32)).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-missing-32"]').textContent,
    ).toContain('Lockdown');
  });

  it('offers no plan past the end of the season', () => {
    const { fixture, httpMock } = setup();
    // The season closes on Sunday the 18th: Monday's gi class is the next one's.
    flush(
      httpMock,
      report({
        season: { start: '2025-10-19', end: '2026-10-18', label: '2025/26' },
        missing: [
          { id: 31, name: 'Omoplata', parent_name: 'Closed guard', kind: 'gi' },
          { id: 32, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' },
        ],
      }),
    );
    fixture.detectChanges();

    expect(planButton(fixture, 31)).toBeNull();
    // Tonight's no-gi class is still inside it.
    expect(planButton(fixture, 32)).not.toBeNull();
  });

  it('offers no plan in a season gone by', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    component['shiftSeason'](1);
    fixture.detectChanges();
    flush(httpMock);
    fixture.detectChanges();

    expect(planButton(fixture, 31)).toBeNull();
    expect(planButton(fixture, 32)).toBeNull();
  });
});
