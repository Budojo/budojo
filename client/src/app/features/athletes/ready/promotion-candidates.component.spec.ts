import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { useLadder } from '../../../../test-utils/ladder-test';
import { AthleteService, type PromotionCandidate } from '../../../core/services/athlete.service';
import type { Belt } from '../../../core/services/athlete.service';
import { PromotionCandidatesComponent } from './promotion-candidates.component';

function candidate(
  id: number,
  over: Partial<PromotionCandidate> & { belt?: Belt; stripes?: number } = {},
): PromotionCandidate {
  const { belt = 'blue', stripes = 2, ...rest } = over;
  return {
    athlete: {
      id,
      first_name: 'Athlete',
      last_name: `N${id}`,
      belt,
      stripes,
      date_of_birth: null,
    },
    belt_since: '2025-06-10',
    months_at_belt: 11,
    stripe_since: null,
    last_promoted_on: '2025-06-10',
    days_since_last_promotion: 339,
    sessions_since_last_promotion: 72,
    next: { kind: 'stripe', belt, stripes: stripes + 1 },
    ...rest,
  };
}

function render(response: Observable<PromotionCandidate[]>, art: 'bjj' | 'taekwondo' = 'bjj') {
  const athletes = { promotionCandidates: vi.fn(() => response) };
  TestBed.configureTestingModule({
    imports: [PromotionCandidatesComponent],
    providers: [
      provideRouter([]),
      ...provideI18nTesting(),
      { provide: AthleteService, useValue: athletes },
    ],
  });
  useLadder(art);
  const fixture = TestBed.createComponent(PromotionCandidatesComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, athletes };
}

function text(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('PromotionCandidatesComponent (#1841)', () => {
  it('lists the athletes in the order the server sent them', () => {
    const { root } = render(of([candidate(3), candidate(1), candidate(2)]));

    const ids = Array.from(root.querySelectorAll('[data-cy^="ready-row-"]')).map((el) =>
      el.getAttribute('data-cy'),
    );
    expect(ids).toEqual(['ready-row-3', 'ready-row-1', 'ready-row-2']);
  });

  it('reads the time on the belt and the training days since the last promotion', () => {
    const { root } = render(of([candidate(1)]));

    expect(text(root, '[data-cy="ready-months"]')).toBe('11 months on this belt');
    expect(text(root, '[data-cy="ready-since"]')).toMatch(
      /^On this belt since .+ · 72 sessions since$/,
    );
  });

  it('counts from the last stripe when there is one', () => {
    const { root } = render(
      of([candidate(1, { stripe_since: '2026-02-01', sessions_since_last_promotion: 1 })]),
    );

    expect(text(root, '[data-cy="ready-since"]')).toMatch(/^Last stripe on .+ · 1 session since$/);
  });

  it('names a dan as such, both since and next', () => {
    const { root } = render(
      of([
        candidate(1, {
          belt: 'black',
          stripes: 2,
          stripe_since: '2024-09-01',
          next: { kind: 'stripe', belt: 'black', stripes: 3 },
        }),
      ]),
      'taekwondo',
    );

    expect(text(root, '[data-cy="ready-since"]')).toMatch(/^3° dan since /);
    expect(text(root, '[data-cy="ready-next"]')).toBe('Next 4° dan');
  });

  it('names the next stripe, the next belt, and the top of the ladder', () => {
    const { root } = render(
      of([
        candidate(1, { next: { kind: 'stripe', belt: 'blue', stripes: 3 } }),
        candidate(2, { stripes: 4, next: { kind: 'belt', belt: 'purple', stripes: 0 } }),
        candidate(3, { belt: 'red', stripes: 0, next: null }),
      ]),
    );

    const next = Array.from(root.querySelectorAll('[data-cy="ready-next"]')).map((el) =>
      el.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(next).toEqual(['Next stripe 3', 'Next Purple', 'Next Top of the ladder']);
  });

  it('says so when there is no belt row, rather than a zero', () => {
    const { root } = render(
      of([
        candidate(1, {
          belt_since: null,
          months_at_belt: null,
          last_promoted_on: null,
          days_since_last_promotion: null,
          sessions_since_last_promotion: null,
        }),
      ]),
    );

    expect(root.querySelector('[data-cy="ready-months"]')).toBeNull();
    expect(text(root, '[data-cy="ready-since"]')).toBe('No belt recorded yet');
  });

  it('reads under a month rather than zero months', () => {
    const { root } = render(of([candidate(1, { months_at_belt: 0 })]));

    expect(text(root, '[data-cy="ready-months"]')).toBe('Under a month on this belt');
  });

  it('opens each athlete on their promotion timeline', () => {
    const { root } = render(of([candidate(7)]));

    const link = root.querySelector('[data-cy="ready-row-7"] a[href]');
    expect(link?.getAttribute('href')).toBe('/dashboard/athletes/7/promotions');
  });

  it('shows the empty state with a way back when nobody is active', () => {
    const { root } = render(of([]));

    expect(root.querySelector('[data-cy="ready-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="ready-list"]')).toBeNull();
  });

  it('shows an error with a retry that asks again', () => {
    const { fixture, root, athletes } = render(throwError(() => new Error('offline')));
    expect(root.querySelector('[data-cy="ready-error"]')).not.toBeNull();

    athletes.promotionCandidates.mockReturnValue(of([candidate(1)]));
    (root.querySelector('[data-cy="ready-retry"] button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(athletes.promotionCandidates).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-cy="ready-row-1"]')).not.toBeNull();
  });

  it('goes back to the roster', () => {
    const { root } = render(of([candidate(1)]));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (root.querySelector('[data-cy="ready-back"] button') as HTMLButtonElement).click();

    expect(navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
  });
});
