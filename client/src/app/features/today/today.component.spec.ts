import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { useLadder } from '../../../test-utils/ladder-test';
import { AcademyClass } from '../../core/services/academy-class.service';
import {
  BackupFolderService,
  BackupFolderStateView,
} from '../../core/services/backup-folder.service';
import { DriveLinkStateView, DriveSyncService } from '../../core/services/drive-sync.service';
import { Athlete } from '../../core/services/athlete.service';
import { Lesson } from '../../core/services/lesson.service';
import { LessonSheetComponent } from '../lessons/lesson-sheet/lesson-sheet.component';
import { TodayComponent } from './today.component';

// Thursday 24 September 2026, 18:30 local.
const NOW = new Date(2026, 8, 24, 18, 30);

function cls(overrides: Partial<AcademyClass> = {}): AcademyClass {
  return {
    id: 1,
    name: 'Fondamentali',
    weekday: 4,
    starts_at: '19:00',
    duration_minutes: 90,
    kind: 'gi',
    ...overrides,
  };
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 10,
    academy_class_id: 1,
    held_on: '2026-09-24',
    name: 'Fondamentali',
    starts_at: '19:00',
    kind: 'gi',
    notes: null,
    held: false,
    topics: [],
    ...overrides,
  };
}

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 1,
    first_name: 'Francesca',
    last_name: 'Marino',
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: null,
    belt: 'white',
    stripes: 0,
    status: 'active',
    joined_at: '2026-09-22',
    created_at: '2026-09-22T10:00:00+00:00',
    ...overrides,
  } as Athlete;
}

interface Responses {
  /** `skip` when the test has already answered the timetable itself. */
  classes?: AcademyClass[] | 'error' | 'skip';
  lessons?: Record<number, Lesson | null>;
  suggestions?: unknown[];
  health?: unknown | 'error';
  unpaidTotal?: number;
  unpaidError?: boolean;
  /** Leave the `?paid=no` request unanswered, as if still in flight. */
  unpaidPending?: boolean;
  daily?: { date: string; count: number }[];
  coverage?: unknown | 'error';
  /** The joiners' page (it also counts the roster); `'error'` fails it. */
  recent?: Athlete[] | 'error';
  /** Leave the joiners' page unanswered, as if still in flight. */
  joinedPending?: boolean;
  /** `?birthday=week` (#1754); `'error'` fails it. */
  birthdays?: Athlete[] | 'error';
  /** Everyone on the books; the joiners' page carries it as `meta.total`. */
  roster?: number;
  /** The getting-started checklist's state; dismissed unless a test says otherwise. */
  onboarding?: unknown;
}

function setup(
  academy: Record<string, unknown> = {},
  providers: Provider[] = [],
): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [TodayComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
      // App-level in production (app.config.ts); the lesson sheet toasts through it.
      MessageService,
      ...providers,
    ],
  });
  useLadder('bjj', academy);
  return TestBed.inject(HttpTestingController);
}

const COVERAGE = {
  season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
  kind: null,
  totals: { in_scope: 29, covered: 3, thin: 4, missing: 22, percentage: 10 },
  positions: [],
  missing: [],
  taught: [],
  timeline: [],
};

const NO_COVERAGE = {
  ...COVERAGE,
  totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
};

const ONBOARDING_STEPS = [
  'add_athlete',
  'set_timetable',
  'write_syllabus',
  'log_attendance',
  'mark_payment',
  'upload_document',
  'view_stats',
];
const FRESH_ONBOARDING = {
  dismissed_at: null,
  completed_steps: [],
  available_steps: ONBOARDING_STEPS,
};
const DISMISSED_ONBOARDING = { ...FRESH_ONBOARDING, dismissed_at: '2026-09-01T00:00:00Z' };

const HEALTH = {
  data: [
    { id: 1, type: 'medical_certificate' },
    { id: 2, type: 'medical_certificate' },
    { id: 3, type: 'id_card' },
  ],
  missing_medical_certificate: [{ id: 7, first_name: 'Luca', last_name: 'Conti' }],
};

/** Answers every request the page makes, the way a healthy academy would. */
function flushAll(http: HttpTestingController, r: Responses = {}): void {
  for (const req of http.match((q) => q.url.endsWith('/me/onboarding'))) {
    req.flush({ data: r.onboarding ?? DISMISSED_ONBOARDING });
  }

  const classes = r.classes ?? [cls()];
  if (classes !== 'skip') {
    const classesReq = http.expectOne((req) => req.url.endsWith('/academy/classes'));
    if (classes === 'error') {
      classesReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    } else {
      classesReq.flush({ data: classes });
    }
  }

  const health = r.health ?? HEALTH;
  const healthReq = http.expectOne((req) => req.url.endsWith('/documents/expiring'));
  if (health === 'error') {
    healthReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
  } else {
    healthReq.flush(health);
  }

  for (const req of http.match((q) => q.url.endsWith('/lessons') && q.method === 'GET')) {
    const id = Number(req.request.params.get('academy_class_id'));
    req.flush({ data: r.lessons?.[id] ?? null });
  }
  for (const req of http.match((q) => q.url.endsWith('/lessons/suggestions'))) {
    req.flush({ data: r.suggestions ?? [] });
  }
  if (!r.unpaidPending) {
    for (const req of http.match(
      (q) => q.url.endsWith('/athletes') && q.params.get('paid') === 'no',
    )) {
      if (r.unpaidError) {
        req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
      } else {
        req.flush({
          data: [],
          meta: { total: r.unpaidTotal ?? 0, current_page: 1, per_page: 20, last_page: 1 },
        });
      }
    }
  }
  http
    .expectOne((req) => req.url.includes('/stats/attendance/daily'))
    .flush({ data: r.daily ?? [] });

  const coverage = r.coverage ?? COVERAGE;
  const coverageReq = http.expectOne((req) => req.url.endsWith('/stats/syllabus/coverage'));
  if (coverage === 'error') {
    coverageReq.flush({ message: 'Forbidden.' }, { status: 403, statusText: 'Forbidden' });
  } else {
    coverageReq.flush({ data: coverage });
  }

  if (!r.joinedPending) {
    const joinedReq = http.expectOne(
      (req) => req.url.endsWith('/athletes') && req.params.get('sort_by') === 'joined_at',
    );
    if (r.recent === 'error') {
      joinedReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    } else {
      joinedReq.flush({
        data: r.recent ?? [],
        meta: { total: r.roster ?? 12, current_page: 1, per_page: 20, last_page: 1 },
      });
    }
  }

  const birthdaysReq = http.expectOne(
    (req) => req.url.endsWith('/athletes') && req.params.get('birthday') === 'week',
  );
  if (r.birthdays === 'error') {
    birthdaysReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
  } else {
    birthdaysReq.flush({
      data: r.birthdays ?? [],
      meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 },
    });
  }
}

function text(root: HTMLElement, cy: string): string {
  return (root.querySelector(`[data-cy="${cy}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TodayComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("titles the page with today's date and the season", () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Thursday 24 September');
    expect(root.textContent).toContain('2026/27');
    http.verify();
  });

  it("lists tonight's classes with what each covers, and 'nothing yet' for the untagged", () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      classes: [
        cls({ id: 1, name: 'Fondamentali', starts_at: '19:00' }),
        cls({ id: 2, name: 'Avanzati', starts_at: '20:30', duration_minutes: 75 }),
        cls({ id: 3, name: 'Kids', weekday: 2 }),
      ],
      lessons: {
        1: lesson({
          topics: [
            {
              id: 5,
              name: 'Armbar',
              kind: 'gi',
              parent_id: 4,
              parent_name: 'Closed guard',
              deleted: false,
            },
          ],
        }),
        2: null,
      },
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(text(root, 'today-class-1')).toContain('19:00–20:30');
    expect(text(root, 'today-class-1')).toContain('Armbar');
    expect(text(root, 'today-class-2')).toContain('20:30–21:45');
    expect(text(root, 'today-class-2')).toContain('Nothing yet');
    // Tuesday's class is not tonight's.
    expect(root.querySelector('[data-cy="today-class-3"]')).toBeNull();
    http.verify();
  });

  it('on an evening with no class, names the next one', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { classes: [cls({ id: 1, weekday: 1, name: 'Fondamentali' })] });
    fixture.detectChanges();

    const tonight = text(fixture.nativeElement, 'today-tonight');
    expect(tonight).toContain('No class tonight');
    expect(tonight).toContain('Monday');
    expect(tonight).toContain('Fondamentali');
    http.verify();
  });

  it('with no timetable, draws neither tonight nor what to teach (#1752, #1755)', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { classes: [] });
    fixture.detectChanges();

    // With no class at all there is no evening to answer and nothing to plan
    // for: no card, not an empty one. The checklist asks for a timetable.
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="today-tonight"]')).toBeNull();
    expect(root.querySelector('[data-cy="today-teach"]')).toBeNull();
    http.verify();
  });

  it('lists what needs looking at, each a link, and the unpaid line when the academy charges', () => {
    const http = setup({ monthly_fee_cents: 5000 });
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { unpaidTotal: 4 });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(text(root, 'today-watch-certificates')).toContain('2');
    expect(text(root, 'today-watch-certificates')).toContain('medical certificates to renew');
    expect(text(root, 'today-watch-missing')).toContain('1');
    expect(text(root, 'today-watch-documents')).toContain('1');
    expect(text(root, 'today-watch-unpaid')).toContain('4');
    expect(text(root, 'today-watch-unpaid')).toContain('September');
    expect(root.querySelector('[data-cy="today-watch-unpaid"]')?.getAttribute('href')).toContain(
      '/dashboard/athletes?paid=no',
    );
    http.verify();
  });

  it('asks nothing about payments when the academy charges no fee', () => {
    const http = setup({ monthly_fee_cents: null, fee_tier_count: 0 });
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http);
    fixture.detectChanges();

    expect(http.match((q) => q.params.get('paid') === 'no')).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="today-watch-unpaid"]'),
    ).toBeNull();
    http.verify();
  });

  it('says so, positively, when there is nothing to look at', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { health: { data: [], missing_medical_certificate: [] } });
    fixture.detectChanges();

    expect(text(fixture.nativeElement, 'today-watch')).toContain('Nothing to check');
    http.verify();
  });

  it('never says all clear while the unpaid count failed to load', () => {
    const http = setup({ monthly_fee_cents: 5000 });
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      health: { data: [], missing_medical_certificate: [] },
      unpaidError: true,
    });
    fixture.detectChanges();

    const watch = text(fixture.nativeElement, 'today-watch');
    expect(watch).not.toContain('Nothing to check');
    expect(text(fixture.nativeElement, 'today-watch-unpaid-error')).toContain(
      "Couldn't load who has paid",
    );
    http.verify();
  });

  it('never says all clear while the unpaid count is still loading', () => {
    const http = setup({ monthly_fee_cents: 5000 });
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      health: { data: [], missing_medical_certificate: [] },
      unpaidPending: true,
    });
    fixture.detectChanges();

    expect(text(fixture.nativeElement, 'today-watch')).not.toContain('Nothing to check');
  });

  describe('unpaid fees are news only from the 16th, like the bell (#1753)', () => {
    function renderOn(day: number, unpaidTotal: number, more: Responses = {}): HTMLElement {
      vi.setSystemTime(new Date(2026, 8, day, 18, 30));
      const http = setup({ monthly_fee_cents: 5000 });
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, {
        health: { data: [], missing_medical_certificate: [] },
        unpaidTotal,
        ...more,
      });
      fixture.detectChanges();
      if (!more.unpaidPending) http.verify();
      return fixture.nativeElement as HTMLElement;
    }

    it('on the 3rd, a neutral line in the week, not a row to check', () => {
      const root = renderOn(3, 4);

      expect(root.querySelector('[data-cy="today-watch-unpaid"]')).toBeNull();
      expect(text(root, 'today-week-unpaid')).toContain('4');
      expect(text(root, 'today-week-unpaid')).toContain('September fees not paid yet');
      expect(root.querySelector('[data-cy="today-week-unpaid"]')?.getAttribute('href')).toContain(
        '/dashboard/athletes?paid=no',
      );
      // Nothing else to check, and a not-yet-paid fee is not something to check yet.
      expect(text(root, 'today-watch')).toContain('Nothing to check');
    });

    it('on the 15th, still neutral', () => {
      const root = renderOn(15, 4);

      expect(root.querySelector('[data-cy="today-watch-unpaid"]')).toBeNull();
      expect(root.querySelector('[data-cy="today-week-unpaid"]')).not.toBeNull();
    });

    it('on the 16th, a row to check, and no longer in the week', () => {
      const root = renderOn(16, 4);

      expect(text(root, 'today-watch-unpaid')).toContain('September fees not paid');
      expect(root.querySelector('[data-cy="today-week-unpaid"]')).toBeNull();
    });

    it('on the 17th, still a row to check', () => {
      const root = renderOn(17, 4);

      expect(root.querySelector('[data-cy="today-watch-unpaid"]')).not.toBeNull();
    });

    it('on the 3rd, a count still loading does not hold up "nothing to check"', () => {
      const root = renderOn(3, 4, { unpaidPending: true });

      expect(text(root, 'today-watch')).toContain('Nothing to check');
      expect(root.querySelector('[data-cy="today-watch-unpaid-error"]')).toBeNull();
    });

    it('on the 3rd, a count that failed is not something to check either', () => {
      const root = renderOn(3, 4, { unpaidError: true });

      expect(text(root, 'today-watch')).toContain('Nothing to check');
      expect(root.querySelector('[data-cy="today-watch-unpaid-error"]')).toBeNull();
      // And the week's line, like the week's other lines, fails silently.
      expect(root.querySelector('[data-cy="today-week-unpaid"]')).toBeNull();
    });

    it('with nobody owing, nothing at all — not "0"', () => {
      for (const day of [3, 16]) {
        TestBed.resetTestingModule();
        const root = renderOn(day, 0);
        expect(root.querySelector('[data-cy="today-watch-unpaid"]')).toBeNull();
        expect(root.querySelector('[data-cy="today-week-unpaid"]')).toBeNull();
      }
    });
  });

  it('keeps a loaded unpaid count when the documents check fails', () => {
    const http = setup({ monthly_fee_cents: 5000 });
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { health: 'error', unpaidTotal: 3 });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(text(root, 'today-watch-unpaid')).toContain('3');
    expect(text(root, 'today-watch-documents-error')).toContain("Couldn't load the documents");
    http.verify();
  });

  it('comes back from a night asleep on the new day, and asks for its lessons', () => {
    // Thursday 23:50: the window is left on Today. Thursday's class is over,
    // so the card already plans Friday's — named with its day.
    const THU = cls({ id: 1, weekday: 4, name: 'Giovedi' });
    const FRI = cls({ id: 2, weekday: 5, name: 'Venerdi' });
    vi.setSystemTime(new Date(2026, 8, 24, 23, 50));
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/academy/classes')).flush({ data: [THU, FRI] });
    const before = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
    expect(before.request.params.get('academy_class_id')).toBe('2');
    before.flush({ data: [] });
    flushAll(http, { classes: 'skip' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Thursday 24 September');
    expect(text(root, 'today-teach')).toContain('Friday 25 September');

    // Friday 08:00: the laptop wakes and the window becomes visible again.
    vi.setSystemTime(new Date(2026, 8, 25, 8, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();

    http.expectOne((req) => req.url.endsWith('/academy/classes')).flush({ data: [THU, FRI] });
    const lessonReq = http.expectOne((req) => req.url.endsWith('/lessons') && req.method === 'GET');
    // Tonight's topics belong to Friday's lesson now, not Thursday's.
    expect(lessonReq.request.params.get('held_on')).toBe('2026-09-25');
    expect(lessonReq.request.params.get('academy_class_id')).toBe('2');
    lessonReq.flush({ data: null });
    const after = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
    expect(after.request.params.get('academy_class_id')).toBe('2');
    after.flush({ data: [] });
    for (const req of http.match((q) => q.method === 'GET')) {
      req.flush({ data: [], meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 } });
    }
    fixture.detectChanges();

    expect(root.querySelector('h1')?.textContent).toContain('Friday 25 September');
    expect(root.querySelector('[data-cy="today-class-2"]')).not.toBeNull();
    // The slot is tonight now: the heading drops the day it no longer needs.
    expect(text(root, 'today-teach')).toContain('For Venerdi at 19:00');
    expect(text(root, 'today-teach')).not.toContain('Friday');
    http.verify();
  });

  it("asks once for the week's birthdays of the people training", () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    const birthdaysReq = http
      .match((req) => req.url.endsWith('/athletes') && req.params.get('birthday') !== null)
      .map((req) => req.request);
    // One request, for the people training: an inactive athlete is not
    // someone to message on Today.
    expect(birthdaysReq).toHaveLength(1);
    expect(birthdaysReq[0].params.get('birthday')).toBe('week');
    expect(birthdaysReq[0].params.get('status')).toBe('active');
    // The window starts from the owner's own day, not the server's UTC one.
    expect(birthdaysReq[0].params.get('from')).toBe('2026-09-24');
    http.expectNone((req) => req.url.endsWith('/athletes') && req.params.get('birthday') !== null);
  });

  it("names today's birthdays first with the age turned, and the week's by day", () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      birthdays: [
        athlete({ id: 7, first_name: 'Luca', last_name: 'Conti', date_of_birth: '1995-09-26' }),
        athlete({ id: 8, first_name: 'Sara', last_name: 'Neri', date_of_birth: '1990-09-24' }),
      ],
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const rows = [...root.querySelectorAll('[data-cy^="today-birthday-"]')];
    expect(rows.map((r) => r.getAttribute('data-cy'))).toEqual([
      'today-birthday-8',
      'today-birthday-7',
    ]);
    expect(text(root, 'today-birthday-8')).toContain('Sara Neri');
    expect(text(root, 'today-birthday-8')).toContain('Turns 36 today');
    // Saturday, from the weekday names the timetable already uses.
    expect(text(root, 'today-birthday-7')).toContain('Sat');
    expect(text(root, 'today-birthday-7')).not.toContain('Turns');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/dashboard/athletes/8');
    http.verify();
  });

  it('puts the message and the call on every birthday row, and says why when there is no number', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      birthdays: [
        athlete({
          id: 8,
          first_name: 'Sara',
          last_name: 'Neri',
          date_of_birth: '1990-09-24',
          phone_country_code: '+39',
          phone_national_number: '3331234567',
        }),
        athlete({ id: 7, first_name: 'Luca', last_name: 'Conti', date_of_birth: '1995-09-26' }),
      ],
    });
    fixture.detectChanges();

    // The card answers "who do I message today": the answer carries the way
    // to do it (#1869), as the not-seen-lately rows do.
    const root = fixture.nativeElement as HTMLElement;
    const whatsapp = root.querySelector(
      '[data-cy="today-birthday-8"] [data-cy="birthday-contact-8-whatsapp"]',
    );
    expect(whatsapp?.getAttribute('href')).toBe('https://wa.me/393331234567');
    expect(
      root
        .querySelector('[data-cy="today-birthday-8"] [data-cy="birthday-contact-8-call"]')
        ?.getAttribute('href'),
    ).toBe('tel:+393331234567');
    expect(
      root.querySelector('[data-cy="today-birthday-7"] [data-cy="birthday-contact-7-none"]'),
    ).not.toBeNull();
    http.verify();
  });

  it('shows no birthdays card when nobody has one this week, or the list could not be read', () => {
    for (const birthdays of [[], 'error'] as const) {
      TestBed.resetTestingModule();
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, { birthdays: birthdays === 'error' ? 'error' : [] });
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-cy="today-birthdays"]')).toBeNull();
      http.verify();
    }
  });

  it('does not reload on a return the same day, while the planned class is still ahead', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http);

    // 18:45: the 19:00 class is still the one to plan.
    vi.setSystemTime(new Date(2026, 8, 24, 18, 45));
    document.dispatchEvent(new Event('visibilitychange'));

    http.expectNone((req) => req.url.endsWith('/academy/classes'));
    http.expectNone((req) => req.url.endsWith('/lessons/suggestions'));
    http.verify();
  });

  it('on a return the same evening after the class, plans next week and asks again', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    // 18:30: the only class is Thursday 19:00, so that is the one planned.
    flushAll(http, { classes: [cls({ id: 1 })] });
    fixture.detectChanges();
    expect(text(fixture.nativeElement, 'today-teach')).toContain('For Fondamentali at 19:00');

    // 21:30, same Thursday: the window comes back after the class.
    vi.setSystemTime(new Date(2026, 8, 24, 21, 30));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();

    http.expectNone((req) => req.url.endsWith('/academy/classes'));
    const again = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
    expect(again.request.params.get('academy_class_id')).toBe('1');
    again.flush({ data: [] });
    fixture.detectChanges();

    // Next Thursday's slot, named with its date — not tonight's, already held.
    expect(text(fixture.nativeElement, 'today-teach')).toContain('Thursday 1 October');
    http.verify();
  });

  it('drops a suggestions reply that arrives for a slot no longer planned', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/academy/classes')).flush({ data: [cls({ id: 1 })] });
    // Tonight's request is still in flight when the window comes back at 21:30.
    const stale = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
    vi.setSystemTime(new Date(2026, 8, 24, 21, 30));
    document.dispatchEvent(new Event('visibilitychange'));
    const fresh = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));

    fresh.flush({
      data: [
        {
          id: 31,
          name: 'Kimura',
          parent_name: 'Closed guard',
          kind: 'gi',
          reason: 'never',
          last_taught_on: null,
        },
      ],
    });
    stale.flush({
      data: [
        {
          id: 21,
          name: 'Triangle',
          parent_name: 'Closed guard',
          kind: 'gi',
          reason: 'never',
          last_taught_on: null,
        },
      ],
    });
    flushAll(http, { classes: 'skip' });
    fixture.detectChanges();

    const teach = text(fixture.nativeElement, 'today-teach');
    expect(teach).toContain('Kimura');
    expect(teach).not.toContain('Triangle');
  });

  it("suggests what to teach for the evening's class, with the reason", () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      classes: [
        cls({ id: 1, name: 'Fondamentali', starts_at: '19:00' }),
        cls({ id: 2, name: 'Avanzati', starts_at: '20:30' }),
      ],
      suggestions: [
        {
          id: 21,
          name: 'Triangle',
          parent_name: 'Closed guard',
          kind: 'gi',
          reason: 'never',
          last_taught_on: null,
        },
      ],
    });
    fixture.detectChanges();

    const teach = text(fixture.nativeElement, 'today-teach');
    // 18:30 → the 19:00 class is the nearest, so that is the one it plans.
    expect(teach).toContain('Fondamentali');
    expect(teach).toContain('Triangle');
    expect(teach).toContain('Not taught yet this season');
    http.verify();
  });

  it('asks for suggestions for the nearest class of the evening', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    http
      .expectOne((req) => req.url.endsWith('/academy/classes'))
      .flush({
        data: [cls({ id: 1, starts_at: '19:00' }), cls({ id: 2, starts_at: '20:30' })],
      });

    const req = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
    expect(req.request.params.get('academy_class_id')).toBe('1');
    expect(req.request.params.get('limit')).toBe('3');
  });

  describe('plans for the next class, not only for tonight (#1752)', () => {
    const SUGGESTION = {
      id: 21,
      name: 'Triangle',
      parent_name: 'Closed guard',
      kind: 'gi',
      reason: 'never',
      last_taught_on: null,
    };

    it('on an evening with no class, suggests for the next one, and names its day', () => {
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      http
        .expectOne((req) => req.url.endsWith('/academy/classes'))
        .flush({ data: [cls({ id: 8, weekday: 1, name: 'Fondamentali', starts_at: '19:00' })] });

      const req = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
      expect(req.request.params.get('academy_class_id')).toBe('8');
      req.flush({ data: [SUGGESTION] });
      flushAll(http, { classes: 'skip' });
      fixture.detectChanges();

      const teach = text(fixture.nativeElement, 'today-teach');
      expect(teach).toContain('Fondamentali');
      expect(teach).toContain('Monday 28 September');
      // The reason stays: a suggestion whose reasoning is invisible gets ignored.
      expect(teach).toContain('Not taught yet this season');
      http.verify();
    });

    it('at 19:30, plans the 20:30 class rather than the one already on the mat', () => {
      vi.setSystemTime(new Date(2026, 8, 24, 19, 30));
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      http
        .expectOne((req) => req.url.endsWith('/academy/classes'))
        .flush({
          data: [cls({ id: 1, starts_at: '19:00' }), cls({ id: 2, starts_at: '20:30' })],
        });

      const req = http.expectOne((q) => q.url.endsWith('/lessons/suggestions'));
      expect(req.request.params.get('academy_class_id')).toBe('2');
    });

    it("opens the lesson sheet on the next class's own date", () => {
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, {
        classes: [cls({ id: 8, weekday: 1, name: 'Fondamentali' })],
        suggestions: [SUGGESTION],
      });
      fixture.detectChanges();

      (
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-cy="today-teach-plan"] button',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      const sheet = fixture.debugElement.query(By.directive(LessonSheetComponent))
        .componentInstance as LessonSheetComponent;
      // Monday's lesson, not tonight's: the topics must land on the day they are for.
      expect(sheet.heldOn()).toBe('2026-09-28');
    });

    it("saving next week's plan leaves tonight's line alone", () => {
      // Thursday 21:30: tonight's only class is over, so the next one is next Thursday.
      vi.setSystemTime(new Date(2026, 8, 24, 21, 30));
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, { classes: [cls({ id: 1 })] });
      fixture.detectChanges();

      const component = fixture.componentInstance as unknown as {
        onSaved(saved: Lesson): void;
      };
      component.onSaved(
        lesson({
          held_on: '2026-10-01',
          topics: [
            {
              id: 9,
              name: 'Kimura',
              kind: 'gi',
              parent_id: 4,
              parent_name: 'Closed guard',
              deleted: false,
            },
          ],
        }),
      );
      fixture.detectChanges();

      expect(text(fixture.nativeElement, 'today-class-1')).toContain('Nothing yet');
      expect(text(fixture.nativeElement, 'today-class-1')).not.toContain('Kimura');
    });
  });

  it('counts the presences since Monday, the programme, and who joined this week', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, {
      daily: [
        { date: '2026-09-18', count: 40 },
        { date: '2026-09-21', count: 12 },
        { date: '2026-09-23', count: 11 },
      ],
      recent: [
        athlete({ id: 1, first_name: 'Francesca', joined_at: '2026-09-22' }),
        athlete({ id: 2, first_name: 'Paolo', joined_at: '2026-08-30' }),
      ],
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(text(root, 'today-week-presences')).toContain('23');
    expect(text(root, 'today-week-programme')).toContain('10%');
    expect(text(root, 'today-week-programme')).toContain('3 of 29');
    expect(text(root, 'today-week-joined')).toContain('Francesca Marino');
    expect(text(root, 'today-week-joined')).not.toContain('Paolo');
    // The person is drawn with the belt spine, as everywhere a name is listed.
    expect(root.querySelector('[data-cy="today-week-joined"] app-athlete-identity')).not.toBeNull();
    http.verify();
  });

  it('keeps every other block when one of them fails', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { health: 'error', coverage: 'error' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(text(root, 'today-watch')).toContain("Couldn't load");
    // The programme row is simply absent for a reader who cannot see stats.
    expect(root.querySelector('[data-cy="today-week-programme"]')).toBeNull();
    // Tonight still renders.
    expect(root.querySelector('[data-cy="today-class-1"]')).not.toBeNull();
    http.verify();
  });

  it("updates a class's line when its lesson sheet saves", () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      onSaved(saved: Lesson): void;
    };
    component.onSaved(
      lesson({
        topics: [
          {
            id: 9,
            name: 'Kimura',
            kind: 'gi',
            parent_id: 4,
            parent_name: 'Closed guard',
            deleted: false,
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(text(fixture.nativeElement, 'today-class-1')).toContain('Kimura');
    http.verify();
  });

  describe('is there a copy anywhere but this computer (#1751)', () => {
    const FOLDER: BackupFolderStateView = {
      folder: 'D:\\OneDrive\\Budojo',
      lastCopyAt: '2026-09-24T03:00:00Z',
      lastError: null,
      lastErrorAt: null,
    };
    const NO_DRIVE: DriveLinkStateView = { configured: true, linked: false };

    /**
     * What the services really answer off the desktop: `available` false,
     * and `state()` all-nulls / unconfigured rather than nothing at all. So
     * a component that forgot the `available` gate would read those as "no
     * folder, no Drive" and raise the alert — which the web-build test below
     * must catch.
     */
    const OFF_DESKTOP_FOLDER: BackupFolderStateView = {
      folder: null,
      lastCopyAt: null,
      lastError: null,
      lastErrorAt: null,
    };
    const OFF_DESKTOP_DRIVE: DriveLinkStateView = { configured: false, linked: false };

    function bridges(
      folder: BackupFolderStateView | null,
      drive: DriveLinkStateView | null = NO_DRIVE,
    ): Provider[] {
      return [
        {
          provide: BackupFolderService,
          useValue: {
            available: folder !== null,
            state: () => Promise.resolve(folder ?? OFF_DESKTOP_FOLDER),
          },
        },
        {
          provide: DriveSyncService,
          useValue: {
            available: drive !== null,
            state: () => Promise.resolve(drive ?? OFF_DESKTOP_DRIVE),
          },
        },
      ];
    }

    async function render(providers: Provider[]): Promise<HTMLElement> {
      const http = setup({}, providers);
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, { health: { data: [], missing_medical_certificate: [] } });
      await fixture.whenStable();
      fixture.detectChanges();
      http.verify();
      return fixture.nativeElement as HTMLElement;
    }

    it('a failing folder copy is an alert naming the folder and the reason', async () => {
      const root = await render(
        bridges({ ...FOLDER, lastError: 'ENOENT', lastErrorAt: '2026-09-23T03:00:00Z' }),
      );

      const row = text(root, 'today-watch-backup');
      expect(row).toContain('D:\\OneDrive\\Budojo');
      // The Backup page's own sentence for the errno, not a second copy of it.
      expect(row).toContain('The backup folder no longer exists');
      expect(root.querySelector('[data-cy="today-watch-backup"]')?.getAttribute('href')).toBe(
        '/dashboard/backup',
      );
      expect(root.querySelector('[data-cy="today-system"]')).toBeNull();
    });

    it('a failing Drive sync is an alert naming the account', async () => {
      const root = await render(
        bridges(
          { ...FOLDER, folder: null, lastCopyAt: null },
          {
            configured: true,
            linked: true,
            account: 'dojo@example.com',
            lastError: 'invalid_grant',
          },
        ),
      );

      expect(text(root, 'today-watch-backup')).toContain('dojo@example.com');
    });

    it('no folder and no Drive link is the "only on this computer" alert', async () => {
      const root = await render(bridges({ ...FOLDER, folder: null, lastCopyAt: null }));

      expect(text(root, 'today-watch-backup')).toContain('only on this computer');
      expect(text(root, 'today-watch-backup')).toContain('link Google Drive');
    });

    it('does not suggest Google Drive in a build that cannot link it', async () => {
      const root = await render(
        bridges(
          { ...FOLDER, folder: null, lastCopyAt: null },
          { configured: false, linked: false },
        ),
      );

      const row = text(root, 'today-watch-backup');
      expect(row).toContain('only on this computer');
      expect(row).toContain('Choose a folder');
      expect(row).not.toContain('Google Drive');
    });

    it('a copy that stopped arriving more than a week ago is a warning with its date', async () => {
      // No lastError: the local backup threw, and the copy after it never ran.
      const root = await render(bridges({ ...FOLDER, lastCopyAt: '2026-09-10T03:00:00Z' }));

      const row = text(root, 'today-watch-backup');
      expect(row).toContain('The last copy outside this computer is from 10 September');
      expect(root.querySelector('[data-cy="today-system"]')).toBeNull();
    });

    it('copies landing are one quiet line, and nothing to check', async () => {
      const root = await render(bridges(FOLDER));

      expect(root.querySelector('[data-cy="today-watch-backup"]')).toBeNull();
      expect(text(root, 'today-watch')).toContain('Nothing to check');
      expect(text(root, 'today-system')).toContain('Last copy off this computer');
    });

    it('never says all clear before the backup state has been read', async () => {
      // The bridge answers last: documents and payments are already in.
      let answer: (state: BackupFolderStateView) => void = () => undefined;
      const slowFolder = new Promise<BackupFolderStateView>((resolve) => (answer = resolve));
      const http = setup({}, [
        {
          provide: BackupFolderService,
          useValue: { available: true, state: () => slowFolder },
        },
        {
          provide: DriveSyncService,
          useValue: { available: true, state: () => Promise.resolve(NO_DRIVE) },
        },
      ]);
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, { health: { data: [], missing_medical_certificate: [] } });
      await Promise.resolve();
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      expect(text(root, 'today-watch')).not.toContain('Nothing to check');

      // Then the backup turns out to exist nowhere but here.
      answer({ ...FOLDER, folder: null, lastCopyAt: null });
      // The bridge's promise chain is not a tracked task: let it drain.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(text(root, 'today-watch')).not.toContain('Nothing to check');
      expect(text(root, 'today-watch-backup')).toContain('only on this computer');
      http.verify();
    });

    it('reads the backup again overnight before saying all clear', async () => {
      // Six days old on Thursday evening, eight on Friday morning: the night
      // is what turns this copy into an alert.
      const aging: BackupFolderStateView = { ...FOLDER, lastCopyAt: '2026-09-18T00:00:00Z' };
      let calls = 0;
      let answer: (state: BackupFolderStateView) => void = () => undefined;
      const http = setup({}, [
        {
          provide: BackupFolderService,
          useValue: {
            available: true,
            state: () =>
              ++calls === 1
                ? Promise.resolve(aging)
                : new Promise<BackupFolderStateView>((resolve) => (answer = resolve)),
          },
        },
        {
          provide: DriveSyncService,
          useValue: { available: true, state: () => Promise.resolve(NO_DRIVE) },
        },
      ]);
      const quiet = { health: { data: [], missing_medical_certificate: [] } };
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, quiet);
      await fixture.whenStable();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(text(root, 'today-watch')).toContain('Nothing to check');

      // Friday 08:00: everything else answers before the bridge does.
      vi.setSystemTime(new Date(2026, 8, 25, 8, 0));
      document.dispatchEvent(new Event('visibilitychange'));
      fixture.detectChanges();
      flushAll(http, quiet);
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(text(root, 'today-watch')).not.toContain('Nothing to check');

      answer(aging);
      // The bridge's promise chain is not a tracked task: let it drain.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      expect(text(root, 'today-watch-backup')).toContain('The last copy outside this computer');
      expect(text(root, 'today-watch')).not.toContain('Nothing to check');
      http.verify();
    });

    it('says nothing at all on the web build, where there is no bridge', async () => {
      const root = await render(bridges(null, null));

      expect(root.querySelector('[data-cy="today-watch-backup"]')).toBeNull();
      expect(root.querySelector('[data-cy="today-system"]')).toBeNull();
    });
  });

  describe('the first screen carries the getting-started checklist (#1755)', () => {
    /** An academy the day it was created: no timetable, nobody, no register. */
    const EMPTY: Responses = {
      classes: [],
      health: { data: [], missing_medical_certificate: [] },
      daily: [],
      coverage: NO_COVERAGE,
      recent: [],
      roster: 0,
    };
    const CARDS = ['today-tonight', 'today-watch', 'today-teach', 'today-week'];

    function render(r: Responses): HTMLElement {
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      flushAll(http, r);
      fixture.detectChanges();
      http.verify();
      return fixture.nativeElement as HTMLElement;
    }

    function cardsShown(root: HTMLElement): string[] {
      return CARDS.filter((cy) => root.querySelector(`[data-cy="${cy}"]`) !== null);
    }

    it('shows the checklist above the cards while the tour is on', () => {
      const root = render({ onboarding: FRESH_ONBOARDING });

      expect(root.querySelector('[data-cy="onboarding-checklist"]')).not.toBeNull();
      expect(cardsShown(root)).toEqual(CARDS);
    });

    it('is the checklist and nothing else for an academy with nothing in it yet', () => {
      const root = render({ ...EMPTY, onboarding: FRESH_ONBOARDING });

      expect(root.querySelector('[data-cy="onboarding-checklist"]')).not.toBeNull();
      expect(cardsShown(root)).toEqual([]);
      // No heading over an empty card: the only section titles are the checklist's.
      const titles = Array.from(root.querySelectorAll('h2')).map((h) => h.textContent?.trim());
      expect(titles).toEqual(['Getting started']);
    });

    it('leaves no placeholder behind once the checklist is dismissed', () => {
      const root = render(EMPTY);

      expect(root.querySelector('[data-cy="onboarding-checklist"]')).toBeNull();
      expect(cardsShown(root)).toEqual([]);
      expect(root.querySelector('h1')?.textContent).toContain('Thursday 24 September');
    });

    it('says "nothing to check" only when someone is on the books to check', () => {
      const quiet = render({ health: { data: [], missing_medical_certificate: [] }, roster: 0 });
      expect(quiet.querySelector('[data-cy="today-watch"]')).toBeNull();

      TestBed.resetTestingModule();
      const peopled = render({ health: { data: [], missing_medical_certificate: [] } });
      expect(text(peopled, 'today-watch')).toContain('Nothing to check');
    });

    it("counts the week's presences once registers are being taken, zero included", () => {
      const before = render({ daily: [] });
      expect(before.querySelector('[data-cy="today-week-presences"]')).toBeNull();

      TestBed.resetTestingModule();
      // Last Thursday's class: a register exists, this week's is still empty.
      const taking = render({ daily: [{ date: '2026-09-17', count: 9 }] });
      expect(text(taking, 'today-week-presences')).toContain('0');
    });

    it('holds the watch card on its skeleton until it knows whether anyone is on the books', () => {
      const http = setup();
      const fixture = TestBed.createComponent(TodayComponent);
      fixture.detectChanges();
      // The documents answer first — the desktop's server takes one request
      // at a time — while the joiners' page, which counts the roster, is out.
      flushAll(http, { ...EMPTY, joinedPending: true });
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(text(root, 'today-watch')).not.toContain('Nothing to check');
      expect(root.querySelector('[data-cy="today-watch"] p-skeleton')).not.toBeNull();

      // Nobody on the books: the card goes, without having said the all-clear.
      http
        .expectOne(
          (req) => req.url.endsWith('/athletes') && req.params.get('sort_by') === 'joined_at',
        )
        .flush({ data: [], meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 } });
      fixture.detectChanges();
      expect(root.querySelector('[data-cy="today-watch"]')).toBeNull();
      http.verify();
    });

    it('when the roster cannot be counted, still settles, and draws no week for the error alone', () => {
      const root = render({ ...EMPTY, recent: 'error' });

      // The skeleton always resolves: with the count unknown, the all-clear is said.
      expect(text(root, 'today-watch')).toContain('Nothing to check');
      // "Couldn't load new members" is not a card on its own.
      expect(root.querySelector('[data-cy="today-week"]')).toBeNull();
    });

    it("says the joiners' failure inside a week that has other lines", () => {
      const root = render({ recent: 'error' });

      expect(text(root, 'today-week-joined')).toContain("Couldn't load");
      expect(root.querySelector('[data-cy="today-week-programme"]')).not.toBeNull();
    });

    it('lists who joined this week, and says nothing in a week nobody did', () => {
      const root = render({ recent: [] });

      expect(root.querySelector('[data-cy="today-week-joined"]')).toBeNull();
      // The week still has its other lines.
      expect(root.querySelector('[data-cy="today-week-programme"]')).not.toBeNull();
    });
  });
});
