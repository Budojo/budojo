import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademyClass, AcademyClassService } from '../services/academy-class.service';
import { AcademyService } from '../services/academy.service';
import { RuntimeProfile, RuntimeService } from '../services/runtime.service';
import { homeByTheClockGuard } from './home-by-the-clock.guard';

/** Home by the clock (#2035): the phone opens on the check-in of the class on the mat. */
describe('homeByTheClockGuard', () => {
  // Thursday 1 October 2026; the Gi class at 19:00 for an hour.
  const GI: AcademyClass = { id: 7, name: 'Gi', weekday: 4, starts_at: '19:00', duration_minutes: 60, kind: 'gi' };

  function setUp(options: { profile?: RuntimeProfile; classes?: AcademyClass[] | 'fails'; closed?: boolean } = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: RuntimeService,
          useValue: { load: async () => undefined, profile: () => options.profile ?? 'mobile' },
        },
        {
          provide: AcademyClassService,
          useValue: {
            list: () => (options.classes === 'fails' ? throwError(() => new Error('offline')) : of(options.classes ?? [GI])),
          },
        },
        {
          provide: AcademyService,
          useValue: {
            academy: () => ({
              closures: options.closed ? [{ id: 1, starts_on: '2026-10-01', ends_on: '2026-10-01', label: null }] : [],
            }),
          },
        },
      ],
    });
  }
  async function opensOn(at: string): Promise<string> {
    vi.setSystemTime(new Date(at));
    const result = await TestBed.runInInjectionContext(() =>
      homeByTheClockGuard({} as never, {} as never),
    );
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : 'oggi';
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('opens on the check-in from 15 minutes before the class', async () => {
    setUp();
    expect(await opensOn('2026-10-01T18:45:00')).toBe('/dashboard/attendance');
  });

  it('opens on Oggi a minute earlier', async () => {
    setUp();
    expect(await opensOn('2026-10-01T18:44:00')).toBe('oggi');
  });

  it('stays on the check-in until 30 minutes after it ends, then Oggi', async () => {
    setUp();
    expect(await opensOn('2026-10-01T20:29:00')).toBe('/dashboard/attendance');
    sessionStorage.clear();
    expect(await opensOn('2026-10-01T20:30:00')).toBe('oggi');
  });

  it('opens on Oggi on a day with no class, or the academy closed', async () => {
    setUp();
    expect(await opensOn('2026-10-02T19:10:00')).toBe('oggi');
    TestBed.resetTestingModule();
    sessionStorage.clear();
    setUp({ closed: true });
    expect(await opensOn('2026-10-01T19:10:00')).toBe('oggi');
  });

  it('chooses once a session: a page loading again after a sync keeps the owner on Oggi', async () => {
    setUp();
    expect(await opensOn('2026-10-01T19:10:00')).toBe('/dashboard/attendance');
    expect(await opensOn('2026-10-01T19:11:00')).toBe('oggi');
  });

  it('never moves the PC, nor a phone whose classes do not read', async () => {
    setUp({ profile: 'desktop' });
    expect(await opensOn('2026-10-01T19:10:00')).toBe('oggi');
    TestBed.resetTestingModule();
    sessionStorage.clear();
    setUp({ classes: 'fails' });
    expect(await opensOn('2026-10-01T19:10:00')).toBe('oggi');
  });
});
