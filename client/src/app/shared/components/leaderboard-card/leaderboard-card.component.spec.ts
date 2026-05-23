import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LeaderboardResult, LeaderboardService } from '../../../core/services/leaderboard.service';
import { LeaderboardCardComponent } from './leaderboard-card.component';

interface Stub {
  getLeaderboard: ReturnType<typeof vi.fn>;
}

function setup(
  returnValue: unknown = of<LeaderboardResult>({
    status: 'ok',
    page: {
      data: [
        {
          rank: 1,
          athlete_id: 1,
          first_name: 'Mario',
          last_name_initial: 'R',
          sessions: 8,
          hours: 12.0,
          anonymous: false,
          is_self: false,
        },
      ],
      meta: { month: '2026-05' },
    },
  }),
): { fixture: ComponentFixture<LeaderboardCardComponent>; svc: Stub } {
  const svc: Stub = { getLeaderboard: vi.fn().mockReturnValue(returnValue) };
  TestBed.configureTestingModule({
    imports: [LeaderboardCardComponent],
    providers: [...provideI18nTesting(), { provide: LeaderboardService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(LeaderboardCardComponent);
  fixture.detectChanges();
  return { fixture, svc };
}

describe('LeaderboardCardComponent (#962)', () => {
  it('renders the top-5 rows on a successful fetch', async () => {
    const { fixture } = setup(
      of<LeaderboardResult>({
        status: 'ok',
        page: {
          data: [
            {
              rank: 1,
              athlete_id: 1,
              first_name: 'Mario',
              last_name_initial: 'R',
              sessions: 10,
              hours: 15,
              anonymous: false,
              is_self: false,
            },
            {
              rank: 2,
              athlete_id: 2,
              first_name: 'Alice',
              last_name_initial: 'B',
              sessions: 8,
              hours: 12,
              anonymous: false,
              is_self: true,
            },
          ],
          meta: { month: '2026-05' },
        },
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="leaderboard-list"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="leaderboard-row-1"]')).not.toBeNull();
    // Self row carries the highlight class.
    const selfRow = fixture.nativeElement.querySelector('[data-cy="leaderboard-row-2"]');
    expect(selfRow!.classList.contains('leaderboard-card__row--self')).toBe(true);
  });

  it('renders the empty state when the response carries no rows', async () => {
    const { fixture } = setup(
      of<LeaderboardResult>({
        status: 'ok',
        page: { data: [], meta: { month: '2026-05' } },
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="leaderboard-empty"]')).not.toBeNull();
  });

  it('renders the anonymised label for opted-out users', async () => {
    const { fixture } = setup(
      of<LeaderboardResult>({
        status: 'ok',
        page: {
          data: [
            {
              rank: 1,
              athlete_id: 5,
              first_name: '',
              last_name_initial: '',
              sessions: 12,
              hours: 18,
              anonymous: true,
              is_self: false,
            },
          ],
          meta: { month: '2026-05' },
        },
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="leaderboard-row-5"]')!.textContent,
    ).toMatch(/Anonymous|Anonimo/);
  });

  it('flips to error panel on a no-academy response', async () => {
    const { fixture } = setup(of<LeaderboardResult>({ status: 'no-academy' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="leaderboard-error"]')).not.toBeNull();
  });

  it('flips to error panel on a network exception', async () => {
    const { fixture } = setup(throwError(() => new Error('boom')));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="leaderboard-error"]')).not.toBeNull();
  });
});
