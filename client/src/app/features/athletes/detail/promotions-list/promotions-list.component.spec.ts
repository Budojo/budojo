import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { type AthletePromotion, AthleteService } from '../../../../core/services/athlete.service';
import { PromotionsListComponent } from './promotions-list.component';

/**
 * Backfilled vitest coverage (#799). Pre-#799 the component shipped with
 * zero specs — the user-visible Promotions tab was rendered by hand only.
 * This file pins the load/list/error branches + the pager wiring.
 */

class FakeAthleteService {
  readonly promotions = vi.fn(() =>
    of({
      data: [] as AthletePromotion[],
      meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
    }),
  );
}

function setup(opts: { athleteId?: string } = {}): {
  fixture: ReturnType<typeof TestBed.createComponent<PromotionsListComponent>>;
  el: HTMLElement;
  svc: FakeAthleteService;
} {
  TestBed.configureTestingModule({
    imports: [PromotionsListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AthleteService, useClass: FakeAthleteService },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: opts.athleteId ?? '42' }),
          },
        },
      },
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(PromotionsListComponent);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    svc: TestBed.inject(AthleteService) as unknown as FakeAthleteService,
  };
}

function makePromotion(over: Partial<AthletePromotion> = {}): AthletePromotion {
  return {
    id: 1,
    kind: 'belt',
    from_belt: 'white',
    to_belt: 'blue',
    from_stripes: null,
    to_stripes: null,
    belt_at_event: 'white',
    recorded_at: '2026-04-12T10:00:00Z',
    recorded_by: null,
    ...over,
  } as AthletePromotion;
}

describe('PromotionsListComponent (#799)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('fires the load on init with athleteId from the route + page 1', () => {
    const { fixture, svc } = setup({ athleteId: '7' });
    svc.promotions.mockReturnValue(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    expect(svc.promotions).toHaveBeenCalledWith(7, 1);
  });

  it('renders the empty-state body when the response has no promotions', () => {
    const { fixture, el, svc } = setup();
    (svc.promotions as unknown as Mock).mockReturnValue(
      of({
        data: [],
        meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    // i18n test harness resolves keys to EN strings; assert against the
    // resolved text rather than the key (see EN en.json `promotions.emptyBody`).
    expect(el.textContent).toContain('No promotions yet');
  });

  it('renders the error panel when AthleteService.promotions errors out', () => {
    const { fixture, el, svc } = setup();
    (svc.promotions as unknown as Mock).mockReturnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();

    expect(el.textContent).toContain("Couldn't load promotion history");
  });

  it('renders one row per promotion in the response', () => {
    const { fixture, el, svc } = setup();
    (svc.promotions as unknown as Mock).mockReturnValue(
      of({
        data: [
          makePromotion({ id: 1, kind: 'belt' }),
          makePromotion({ id: 2, kind: 'stripe', from_stripes: 1, to_stripes: 2 }),
        ],
        meta: { current_page: 1, per_page: 20, total: 2, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    // The component renders an <li> per row; promotion entries are
    // not pinned by data-cy at the row level, so count list-items
    // inside the timeline ul.
    const items = el.querySelectorAll('li');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the prev/next pager only when lastPage > 1, with the right ariaLabels', () => {
    const { fixture, el, svc } = setup();
    (svc.promotions as unknown as Mock).mockReturnValue(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 25, last_page: 2 },
      }),
    );
    fixture.detectChanges();

    const prev = el.querySelector('[data-cy="promotions-prev"]') as HTMLElement | null;
    const next = el.querySelector('[data-cy="promotions-next"]') as HTMLElement | null;
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
    // Both buttons carry the translated ariaLabel binding.
    expect(prev?.querySelector('button')?.getAttribute('aria-label')).toBe('Previous page');
    expect(next?.querySelector('button')?.getAttribute('aria-label')).toBe('Next page');
  });

  it('omits the pager when lastPage === 1 (everything on one page)', () => {
    const { fixture, el, svc } = setup();
    (svc.promotions as unknown as Mock).mockReturnValue(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 3, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="promotions-pager"]')).toBeNull();
  });

  it('next-button click loads page 2', () => {
    const { fixture, el, svc } = setup();
    (svc.promotions as unknown as Mock).mockReturnValueOnce(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 25, last_page: 2 },
      }),
    );
    fixture.detectChanges();
    svc.promotions.mockClear();
    (svc.promotions as unknown as Mock).mockReturnValueOnce(
      of({
        data: [makePromotion({ id: 99 })],
        meta: { current_page: 2, per_page: 20, total: 25, last_page: 2 },
      }),
    );

    (el.querySelector('[data-cy="promotions-next"] button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(svc.promotions).toHaveBeenCalledWith(42, 2);
  });
});
