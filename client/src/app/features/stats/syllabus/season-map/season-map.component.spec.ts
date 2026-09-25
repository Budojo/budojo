import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { CoveragePosition, SyllabusCalendar } from '../../../../core/services/stats.service';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { SeasonMapComponent } from './season-map.component';

const URL = '/api/v1/stats/syllabus/calendar';

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

function setup() {
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
    const { fixture, httpMock } = setup();
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
});
