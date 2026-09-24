import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
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
  classes?: AcademyClass[] | 'error';
  lessons?: Record<number, Lesson | null>;
  suggestions?: unknown[];
  health?: unknown | 'error';
  unpaidTotal?: number;
  daily?: { date: string; count: number }[];
  coverage?: unknown | 'error';
  recent?: Athlete[];
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
  const classes = r.classes ?? [cls()];
  const classesReq = http.expectOne((req) => req.url.endsWith('/academy/classes'));
  if (classes === 'error') {
    classesReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
  } else {
    classesReq.flush({ data: classes });
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
  for (const req of http.match(
    (q) => q.url.endsWith('/athletes') && q.params.get('paid') === 'no',
  )) {
    req.flush({
      data: [],
      meta: { total: r.unpaidTotal ?? 0, current_page: 1, per_page: 20, last_page: 1 },
    });
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

  http
    .expectOne((req) => req.url.endsWith('/athletes') && req.params.get('sort_by') === 'joined_at')
    .flush({
      data: r.recent ?? [],
      meta: { total: 0, current_page: 1, per_page: 20, last_page: 1 },
    });
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

  it('with no timetable, points at the timetable instead', () => {
    const http = setup();
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    flushAll(http, { classes: [] });
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="today-timetable-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/dashboard/academy/timetable');
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
      onSaved(classId: number, saved: Lesson): void;
    };
    component.onSaved(
      1,
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

    function bridges(
      folder: BackupFolderStateView | null,
      drive: DriveLinkStateView | null = NO_DRIVE,
    ): Provider[] {
      return [
        {
          provide: BackupFolderService,
          useValue: { available: folder !== null, state: () => Promise.resolve(folder) },
        },
        {
          provide: DriveSyncService,
          useValue: { available: drive !== null, state: () => Promise.resolve(drive) },
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
    });

    it('copies landing are one quiet line, and nothing to check', async () => {
      const root = await render(bridges(FOLDER));

      expect(root.querySelector('[data-cy="today-watch-backup"]')).toBeNull();
      expect(text(root, 'today-watch')).toContain('Nothing to check');
      expect(text(root, 'today-system')).toContain('Last copy off this computer');
    });

    it('says nothing at all on the web build, where there is no bridge', async () => {
      const root = await render(bridges(null, null));

      expect(root.querySelector('[data-cy="today-watch-backup"]')).toBeNull();
      expect(root.querySelector('[data-cy="today-system"]')).toBeNull();
    });
  });
});
