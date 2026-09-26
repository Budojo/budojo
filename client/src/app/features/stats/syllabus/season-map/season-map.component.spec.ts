import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { AcademyClass } from '../../../../core/services/academy-class.service';
import { CoveragePosition, SyllabusCalendar } from '../../../../core/services/stats.service';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { SeasonMapComponent } from './season-map.component';

const URL = '/api/v1/stats/syllabus/calendar';
const CLASSES_URL = '/api/v1/academy/classes';

/** Monday gi fundamentals, Wednesday no-gi. */
const CLASSES: AcademyClass[] = [
  { id: 7, name: 'Fundamentals', weekday: 1, starts_at: '19:00', duration_minutes: 60, kind: 'gi' },
  { id: 8, name: 'No-gi', weekday: 3, starts_at: '19:00', duration_minutes: 60, kind: 'nogi' },
];

const POSITIONS: CoveragePosition[] = [
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
];

function calendar(over: Partial<SyllabusCalendar> = {}): SyllabusCalendar {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    today: '2026-10-14',
    weeks: ['2026-10-05', '2026-10-12', '2026-10-19'],
    positions: [
      {
        id: 1,
        name: 'Closed guard',
        kind: 'both',
        cells: [
          { week: '2026-10-05', held: 2, planned: 0, unconfirmed: 0 },
          { week: '2026-10-19', held: 0, planned: 1, unconfirmed: 0 },
        ],
      },
      { id: 2, name: 'Half guard', kind: 'both', cells: [] },
    ],
    lessons: [
      {
        id: 40,
        academy_class_id: 7,
        held_on: '2026-10-05',
        name: 'Fundamentals',
        starts_at: '19:00',
        kind: 'gi',
        state: 'held',
        position_ids: [1],
        topics: [{ id: 11, name: 'Armbar', parent_id: 1 }],
      },
      {
        id: 41,
        academy_class_id: 7,
        held_on: '2026-10-07',
        name: 'Advanced',
        starts_at: '20:30',
        kind: 'gi',
        state: 'held',
        position_ids: [1],
        topics: [{ id: 12, name: 'Triangle', parent_id: 1 }],
      },
      {
        id: 42,
        academy_class_id: 7,
        held_on: '2026-10-19',
        name: 'Fundamentals',
        starts_at: '19:00',
        kind: 'gi',
        state: 'planned',
        position_ids: [1],
        topics: [{ id: 1, name: 'Closed guard', parent_id: null }],
      },
    ],
    ...over,
  };
}

function setup(classes: AcademyClass[] = CLASSES) {
  TestBed.configureTestingModule({
    imports: [SeasonMapComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      MessageService,
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(SeasonMapComponent);
  fixture.componentRef.setInput('positions', POSITIONS);
  // The timetable comes from the host (#1656): the report reads it once for
  // both planning views, so the map never asks for its own.
  fixture.componentRef.setInput('classes', classes);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flush(httpMock: HttpTestingController, data: SyllabusCalendar = calendar()) {
  const req = httpMock.expectOne((r) => r.url === URL);
  req.flush({ data });
  return req;
}

describe('SeasonMapComponent (#1858)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for the same season and filter the report is showing', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);

    fixture.componentRef.setInput('seasonsBack', 1);
    fixture.componentRef.setInput('kind', 'nogi');
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('seasons_back')).toBe('1');
    expect(req.request.params.get('kind')).toBe('nogi');
    req.flush({ data: calendar() });
  });

  it('names each position and keeps its fraction, even before the weeks arrive', () => {
    const { fixture, httpMock } = setup();

    const row = fixture.nativeElement.querySelector('[data-cy="syllabus-position-1"]');
    expect(row.textContent).toContain('Closed guard');
    expect(row.textContent).toContain('3/6');

    flush(httpMock);
  });

  it('draws a column per week, shaded by how much was taught and outlined when planned', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('[data-cy="syllabus-position-1"]');
    const swatches = Array.from(row.querySelectorAll('.swatch')) as HTMLElement[];
    expect(swatches).toHaveLength(3);
    expect(swatches[0].classList).toContain('swatch--more');
    expect(swatches[1].classList).toContain('swatch--none');
    expect(swatches[2].classList).toContain('swatch--planned');
  });

  it('makes a week with something in it a labelled pointer shortcut, and an empty one nothing', () => {
    // No timetable: an empty week ahead has nothing to plan into (#1859).
    const { fixture, httpMock } = setup([]);
    flush(httpMock);
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('[data-cy="syllabus-position-1"]');
    const cells = Array.from(row.querySelectorAll('td button')) as HTMLButtonElement[];
    expect(cells).toHaveLength(2);
    expect(cells[0].getAttribute('aria-label')).toContain('Closed guard');
    expect(cells[0].getAttribute('aria-label')).toContain('2 lessons');
    expect(cells[1].getAttribute('aria-label')).toContain('1 planned');
    // Out of the tab order: the row's name is the control everyone reaches.
    expect(cells.every((c) => c.tabIndex === -1)).toBe(true);
  });

  it("gives each row one tab stop, its name, which opens the position's whole season", () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('[data-cy="syllabus-position-1"]');
    const tabbable = Array.from(row.querySelectorAll('button')).filter((b) => b.tabIndex >= 0);
    expect(tabbable).toHaveLength(1);

    const name = row.querySelector('[data-cy="season-map-position-1"]') as HTMLButtonElement;
    expect(name.getAttribute('aria-label')).toContain('Closed guard');
    name.click();
    fixture.detectChanges();

    const panel = component['panel']();
    expect(panel?.mode).toBe('season');
    // Every week with something on it, oldest first; the empty week is left out.
    expect(panel?.groups.map((g) => g.week)).toEqual(['2026-10-05', '2026-10-19']);
    expect(panel?.groups[0].lessons.map((l) => l.id)).toEqual([40, 41]);
  });

  it('opens a bottom sheet instead of the popover in a narrow window', () => {
    // Defined, writable and deleted afterwards — never assigned. The test
    // environment has no matchMedia at all, and a leftover property (even an
    // `undefined` one) leaks into every spec file that shares the worker
    // (see web-push.service.spec.ts and theme.service.spec.ts).
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
      configurable: true,
      writable: true,
    });
    try {
      const { fixture, component, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-1"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(component['drawerOpen']()).toBe(true);
    } finally {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('keeps a missed plan on the map, and in the words, beside a lesson held that week', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      calendar({
        positions: [
          {
            id: 1,
            name: 'Closed guard',
            kind: 'both',
            cells: [{ week: '2026-10-05', held: 2, planned: 0, unconfirmed: 1 }],
          },
          { id: 2, name: 'Half guard', kind: 'both', cells: [] },
        ],
      }),
    );
    fixture.detectChanges();

    const cell = fixture.nativeElement.querySelector(
      '[data-cy="season-map-cell-1-2026-10-05"]',
    ) as HTMLButtonElement;
    expect(cell.classList).toContain('swatch--more');
    expect(cell.classList).toContain('swatch--also-unconfirmed');
    expect(cell.getAttribute('aria-label')).toContain('2 lessons');
    expect(cell.getAttribute('aria-label')).toContain('1 planned with nobody checked in');
  });

  it('marks the week holding today', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const current = fixture.nativeElement.querySelectorAll('th.is-current');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('aria-label')).toContain('this week');
  });

  it('lists the lessons of a week when its cell is opened', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const cell = fixture.nativeElement.querySelector(
      '[data-cy="season-map-cell-1-2026-10-05"]',
    ) as HTMLButtonElement;
    cell.click();
    fixture.detectChanges();

    const panel = component['panel']();
    expect(panel?.mode).toBe('week');
    expect(panel?.name).toBe('Closed guard');
    expect(panel?.groups[0].lessons.map((l) => l.id)).toEqual([40, 41]);
    expect(panel?.groups[0].lessons[0].topicNames).toEqual(['Armbar']);
  });

  it('says so when the weeks cannot be loaded, and tries again on request', () => {
    const { fixture, httpMock } = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-cy="season-map-error"]');
    expect(error).not.toBeNull();
    // The rows and their fractions stay: only the weeks are missing.
    expect(fixture.nativeElement.textContent).toContain('3/6');

    // A full-size button, the one action in this state.
    (
      fixture.nativeElement.querySelector(
        '[data-cy="season-map-retry"] button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    flush(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="season-map-error"]')).toBeNull();
  });

  it('plans from the timetable its host hands it, and never reads one itself', () => {
    const { httpMock } = setup();
    flush(httpMock);

    httpMock.expectNone(CLASSES_URL);
  });

  describe('planning ahead (#1859)', () => {
    // Wednesday 14 October 2026, midday, as the calendar says: the window a
    // plan opens on also reads the local clock.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
    });

    afterEach(() => vi.useRealTimers());

    it('lets an empty week still to come be planned, and a week gone by not', () => {
      const { fixture, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      // Half guard has nothing on the map; today is Wednesday 14 October.
      const ahead = fixture.nativeElement.querySelector(
        '[data-cy="season-map-cell-2-2026-10-19"]',
      ) as HTMLButtonElement;
      expect(ahead.tabIndex).toBe(-1);
      expect(ahead.getAttribute('aria-label')).toBe('Plan Half guard, week of 19 Oct');
      expect(
        fixture.nativeElement.querySelector('[data-cy="season-map-cell-2-2026-10-05"]'),
      ).toBeNull();
    });

    it('offers the classes of the week that may teach the position, from today on', () => {
      const { fixture, component, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-cell-2-2026-10-12"]',
        ) as HTMLButtonElement
      ).click();

      // Monday the 12th is gone; Wednesday's no-gi class is today.
      expect(component['panel']()?.plan?.map((o) => [o.classId, o.date])).toEqual([
        [8, '2026-10-14'],
      ]);
    });

    it("offers the next two weeks from a position's name", () => {
      const { fixture, component, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();

      // Today, Wednesday 14 October, through Tuesday the 27th.
      expect(component['panel']()?.plan?.map((o) => o.date)).toEqual([
        '2026-10-14',
        '2026-10-19',
        '2026-10-21',
        '2026-10-26',
      ]);
    });

    it('never offers a gi class for a no-gi position', () => {
      const { fixture, component, httpMock } = setup();
      flush(httpMock);
      fixture.componentRef.setInput('positions', [{ ...POSITIONS[1], kind: 'nogi' }]);
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();

      expect(component['panel']()?.plan?.every((o) => o.classId === 8)).toBe(true);
    });

    it('never offers a lesson past the end of the season', () => {
      const { fixture, component, httpMock } = setup();
      // The season closes on Tuesday 20 October; its last week still runs to Sunday.
      flush(
        httpMock,
        calendar({ season: { start: '2026-09-01', end: '2026-10-20', label: '2026/27' } }),
      );
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-cell-2-2026-10-19"]',
        ) as HTMLButtonElement
      ).click();
      expect(component['panel']()?.plan?.map((o) => o.date)).toEqual(['2026-10-19']);

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();
      expect(component['panel']()?.plan?.map((o) => o.date)).toEqual(['2026-10-14', '2026-10-19']);
    });

    it('offers no plan on a row no class of the timetable may teach', () => {
      // A gi-only timetable, and a no-gi position.
      const { fixture, component, httpMock } = setup([CLASSES[0]]);
      flush(httpMock);
      fixture.componentRef.setInput('positions', [{ ...POSITIONS[1], kind: 'nogi' }]);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-cy="season-map-cell-2-2026-10-19"]'),
      ).toBeNull();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();
      expect(component['panel']()?.plan).toBeNull();
    });

    it('starts from the local day when the server’s date is still yesterday', () => {
      // Half past midnight on Thursday in Rome; the server, on UTC, still
      // says Wednesday. Last night's class is not a plan.
      vi.setSystemTime(new Date(2026, 9, 15, 0, 30));
      const { fixture, component, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();
      expect(component['panel']()?.plan?.map((o) => o.date)).toEqual([
        '2026-10-19',
        '2026-10-21',
        '2026-10-26',
        '2026-10-28',
      ]);

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-cell-2-2026-10-12"]',
        ) as HTMLButtonElement
      ).click();
      expect(component['panel']()?.plan).toEqual([]);
    });

    it('opens the lesson sheet on the chosen class and day, on the position', () => {
      const { fixture, component, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();
      const panel = component['panel']()!;
      const monday = panel.plan!.find((o) => o.date === '2026-10-19')!;
      component['plan'](monday, panel);

      expect(component['planning']()).toEqual({
        classId: 7,
        heldOn: '2026-10-19',
        className: 'Fundamentals',
        positionId: 2,
      });
      expect(component['planSheetOpen']()).toBe(true);
    });

    it('offers no planning for a season gone by, nor without a timetable', () => {
      const past = setup();
      flush(past.httpMock);
      past.fixture.componentRef.setInput('seasonsBack', 1);
      past.fixture.detectChanges();
      flush(past.httpMock, calendar({ today: '2027-10-14' }));
      past.fixture.detectChanges();
      (
        past.fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();
      expect(past.component['panel']()?.plan).toBeNull();

      TestBed.resetTestingModule();
      const none = setup([]);
      flush(none.httpMock);
      none.fixture.detectChanges();
      (
        none.fixture.nativeElement.querySelector(
          '[data-cy="season-map-position-2"]',
        ) as HTMLButtonElement
      ).click();
      expect(none.component['panel']()?.plan).toBeNull();
    });
  });
});

describe('SeasonMapComponent — the week plan for the group (#1863)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  // The default calendar's today is Wednesday 14 October, with nothing left
  // planned that week: the plan is next week's, Monday 19.
  const NEXT_WEEK_TEXT = "The week's plan\nMon 19 · Fundamentals · Closed guard";

  function stubClipboard(writeText: () => Promise<void>) {
    const spy = vi.fn(writeText);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: spy },
      configurable: true,
    });
    return spy;
  }

  function share(fixture: { nativeElement: HTMLElement }) {
    const el = fixture.nativeElement;
    return {
      text: el.querySelector('[data-cy="season-map-share-text"]')?.textContent ?? '',
      copy: el.querySelector('[data-cy="season-map-share-copy"] button') as HTMLButtonElement,
      whatsapp: el.querySelector('[data-cy="season-map-share-whatsapp"]') as HTMLElement,
    };
  }

  it('offers the plan of the week ahead, and a WhatsApp link that carries it', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const { text, copy, whatsapp } = share(fixture);
    expect(text).toContain('19 Oct');
    expect(copy.disabled).toBe(false);
    expect(whatsapp.tagName).toBe('A');
    expect(whatsapp.getAttribute('href')).toBe(
      `https://wa.me/?text=${encodeURIComponent(NEXT_WEEK_TEXT)}`,
    );
    // The desktop shell opens target=_blank in the system browser.
    expect(whatsapp.getAttribute('target')).toBe('_blank');
    expect(whatsapp.getAttribute('rel')).toContain('noopener');
  });

  it('copies the plan and says so', async () => {
    const { fixture, httpMock } = setup();
    const messages = TestBed.inject(MessageService);
    const toast = vi.spyOn(messages, 'add');
    const writeText = stubClipboard(() => Promise.resolve());
    flush(httpMock);
    fixture.detectChanges();

    share(fixture).copy.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(NEXT_WEEK_TEXT);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        summary: 'Plan copied — paste it into the group.',
      }),
    );
  });

  it('points at WhatsApp when the clipboard refuses', async () => {
    const { fixture, httpMock } = setup();
    const toast = vi.spyOn(TestBed.inject(MessageService), 'add');
    stubClipboard(() => Promise.reject(new Error('denied')));
    flush(httpMock);
    fixture.detectChanges();

    share(fixture).copy.click();
    await fixture.whenStable();

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', summary: expect.stringContaining('WhatsApp') }),
    );
  });

  it('says in words why there is nothing to send, with both actions off', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      calendar({
        lessons: calendar().lessons.filter((lesson) => lesson.state === 'held'),
      }),
    );
    fixture.detectChanges();

    const { text, copy, whatsapp } = share(fixture);
    expect(text).toContain('Nothing is planned for this week or the next');
    expect(copy.disabled).toBe(true);
    // No link to follow: a disabled button, not an anchor.
    expect(whatsapp.tagName).not.toBe('A');
    expect(whatsapp.querySelector('button')?.disabled).toBe(true);
  });

  it('shows nothing to share until the weeks arrive', () => {
    const { fixture, httpMock } = setup();

    expect(fixture.nativeElement.querySelector('[data-cy="season-map-share"]')).toBeNull();
    flush(httpMock);
  });

  it('offers nothing to share on a season gone by', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.componentRef.setInput('seasonsBack', 1);
    fixture.detectChanges();
    flush(httpMock, calendar({ lessons: [], today: '2026-10-14' }));
    fixture.detectChanges();

    // A past season has no week ahead: no row, rather than "nothing planned".
    expect(fixture.nativeElement.querySelector('[data-cy="season-map-share"]')).toBeNull();
  });

  it('says the week ahead opens the new season rather than that nothing is planned', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      calendar({
        season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' },
        today: '2026-08-30',
        lessons: [],
      }),
    );
    fixture.detectChanges();

    const { text, copy } = share(fixture);
    expect(text).toContain('the new season');
    expect(text).not.toContain('Nothing is planned');
    expect(copy.disabled).toBe(true);
  });
});

// #1911 — a position's techniques open under its name, where the report's two
// flat lists used to reprint the whole programme.
describe("SeasonMapComponent — a position's techniques", () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const MISSING = [
    { id: 31, name: 'Omoplata', parent_id: 1, parent_name: 'Closed guard', kind: 'both' as const },
    { id: 32, name: 'Lockdown', parent_id: 2, parent_name: 'Half guard', kind: 'nogi' as const },
  ];
  const taughtRow = (id: number, name: string, parentId: number, state: 'covered' | 'thin') => ({
    id,
    name,
    parent_id: parentId,
    parent_name: parentId === 1 ? 'Closed guard' : 'Half guard',
    kind: 'both' as const,
    lessons: state === 'covered' ? 3 : 1,
    reach: 4,
    attendances: 6,
    last_taught_on: '2026-10-05',
    state,
  });
  const TAUGHT = [
    taughtRow(11, 'Armbar', 1, 'covered'),
    taughtRow(12, 'Triangle', 1, 'thin'),
    // The seed repeats names across positions: grouping is by id.
    taughtRow(13, 'Armbar', 2, 'covered'),
  ];

  function withTechniques() {
    const ctx = setup();
    flush(ctx.httpMock);
    ctx.fixture.componentRef.setInput('missing', MISSING);
    ctx.fixture.componentRef.setInput('taught', TAUGHT);
    ctx.fixture.detectChanges();
    return ctx;
  }

  it('groups them under their position, by id: to do, done once, done', () => {
    const { component } = withTechniques();

    const closedGuard = component['techniquesOf'](1);
    expect(closedGuard.todo.map((t) => t.id)).toEqual([31]);
    expect(closedGuard.once.map((t) => t.id)).toEqual([12]);
    expect(closedGuard.done.map((t) => t.id)).toEqual([11]);

    const halfGuard = component['techniquesOf'](2);
    expect(halfGuard.todo.map((t) => t.id)).toEqual([32]);
    expect(halfGuard.done.map((t) => t.id)).toEqual([13]);
  });

  it('closes the panel and asks the host to plan a technique', () => {
    const { component } = withTechniques();
    const asked: number[] = [];
    component.planTechnique.subscribe((id) => asked.push(id));
    component['drawerOpen'].set(true);

    component['planTopic'](31);

    expect(asked).toEqual([31]);
    // A sheet on top of the panel would be one dialog too many.
    expect(component['drawerOpen']()).toBe(false);
  });

  it('closes the panel and asks the host who has seen a technique', () => {
    const { component } = withTechniques();
    const asked: number[] = [];
    component.openTechnique.subscribe((id) => asked.push(id));
    component['drawerOpen'].set(true);

    component['openTopic'](11);

    expect(asked).toEqual([11]);
    expect(component['drawerOpen']()).toBe(false);
  });
});
