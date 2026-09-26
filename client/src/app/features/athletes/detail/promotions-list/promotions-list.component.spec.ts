import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { LanguageService } from '../../../../core/services/language.service';
import {
  type AthletePromotion,
  AthleteService,
  type PromotionGap,
} from '../../../../core/services/athlete.service';
import { PromotionsListComponent } from './promotions-list.component';
import { useLadder } from '../../../../../test-utils/ladder-test';

class FakeAthleteService {
  readonly promotions = vi.fn(() =>
    of({
      data: [] as AthletePromotion[],
      meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
    }),
  );
  readonly updatePromotionRecordedAt = vi.fn(() =>
    of({
      id: 1,
      kind: 'stripe',
      from_belt: null,
      to_belt: null,
      from_stripes: 1,
      to_stripes: 2,
      belt_at_event: 'blue',
      recorded_at: '2026-03-15T00:00:00Z',
      recorded_by: null,
    } as AthletePromotion),
  );
  readonly createPromotion = vi.fn(() =>
    of({
      id: 99,
      kind: 'belt',
      from_belt: 'white',
      to_belt: 'blue',
      from_stripes: null,
      to_stripes: null,
      belt_at_event: 'blue',
      recorded_at: '2019-03-15T00:00:00Z',
      recorded_by: null,
    } as AthletePromotion),
  );
  readonly deletePromotion = vi.fn(() => of(undefined));
  readonly completeOpeningPromotion = vi.fn(() => of({} as AthletePromotion));
  readonly skipPromotionStep = vi.fn(() => of(undefined));
  readonly unskipPromotionStep = vi.fn(() => of(undefined));
}

function setup(opts: { athleteId?: string } = {}): {
  fixture: ReturnType<typeof TestBed.createComponent<PromotionsListComponent>>;
  component: PromotionsListComponent;
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
    component: fixture.componentInstance,
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

  it('reads a stripe row the way its grade counts — dan, not stripes (#1801)', () => {
    const { fixture, el, svc } = setup();
    useLadder('judo');
    svc.promotions.mockReturnValue(
      of({
        data: [
          makePromotion({
            kind: 'stripe',
            from_belt: null,
            to_belt: null,
            from_stripes: 1,
            to_stripes: 2,
            belt_at_event: 'black',
          }),
        ],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    const count = el
      .querySelector('.promotions__stripe-count')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
    expect(count).toBe('2° dan 3° dan');
    // No "stripes" noun after a dan count, and the context badge says no count of its own.
    expect(el.querySelector('.promotions__stripe-label')).toBeNull();
    expect(el.querySelector('[data-cy="belt-count"]')).toBeNull();
  });

  it('labels a row with no previous belt as the starting belt (#1771)', () => {
    const { fixture, el, svc } = setup();
    svc.promotions.mockReturnValue(
      of({
        data: [makePromotion({ kind: 'belt', from_belt: null, to_belt: 'blue' })],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    // Every timeline now opens with this row, dated the day the record began.
    // "First belt" said something false about a blue belt of nine years.
    const transition = el.querySelector('[data-cy="promotion-belt"]')?.textContent ?? '';
    expect(transition).toContain('Starting belt');
    expect(transition).not.toContain('First belt');
  });

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
    svc.promotions.mockReturnValue(
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

  it('writes the promotion date in the active language (#1624)', () => {
    // "Jun 15, 2026" under an Italian UI: `| date: 'mediumDate'` formats
    // against LOCALE_ID, which this app never sets.
    const { fixture, el, svc } = setup();
    svc.promotions.mockReturnValue(
      of({
        data: [makePromotion({ recorded_at: '2026-03-15T00:00:00Z' })],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      }),
    );
    TestBed.inject(LanguageService).setLanguage('it');
    fixture.detectChanges();

    // The whole date, not just the month: `recorded_at` is a calendar day
    // stored at UTC midnight, so reading it as an instant shows the 14th to
    // every reader west of Greenwich — while the edit dialog beside it opens
    // on the 15th (`utcCalendarDayAsLocalMidnight`). Run the suite under
    // `TZ=America/New_York` and this is the assertion that fails.
    expect(el.querySelector('.promotions__date')?.textContent).toContain('15 marzo 2026');
  });

  it('renders the error panel when AthleteService.promotions errors out', () => {
    const { fixture, el, svc } = setup();
    svc.promotions.mockReturnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();

    expect(el.textContent).toContain("Couldn't load promotion history");
  });

  it('renders one row per promotion in the response', () => {
    const { fixture, el, svc } = setup();
    svc.promotions.mockReturnValue(
      of({
        data: [
          makePromotion({ id: 1, kind: 'belt' }),
          makePromotion({ id: 2, kind: 'stripe', from_stripes: 1, to_stripes: 2 }),
        ],
        meta: { current_page: 1, per_page: 20, total: 2, last_page: 1 },
      }),
    );
    fixture.detectChanges();

    const items = el.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  it('renders the prev/next pager only when lastPage > 1, with the right ariaLabels', () => {
    const { fixture, el, svc } = setup();
    svc.promotions.mockReturnValue(
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
    svc.promotions.mockReturnValue(
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
    svc.promotions.mockReturnValueOnce(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 25, last_page: 2 },
      }),
    );
    fixture.detectChanges();
    svc.promotions.mockClear();
    svc.promotions.mockReturnValueOnce(
      of({
        data: [makePromotion({ id: 99 })],
        meta: { current_page: 2, per_page: 20, total: 25, last_page: 2 },
      }),
    );

    (el.querySelector('[data-cy="promotions-next"] button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(svc.promotions).toHaveBeenCalledWith(42, 2);
  });

  describe('editing recorded_at (#1431 PR 1 of 2)', () => {
    it('opens the edit dialog seeded with the row date on pencil click', () => {
      const { fixture, component, el, svc } = setup();
      svc.promotions.mockReturnValue(
        of({
          data: [makePromotion({ id: 5, recorded_at: '2026-03-15T00:00:00Z' })],
          meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        }),
      );
      fixture.detectChanges();
      const dialogOpen = component as unknown as { editDialogOpen: () => boolean };

      expect(dialogOpen.editDialogOpen()).toBe(false);
      (el.querySelector('[data-cy="promotion-edit-5"] button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(dialogOpen.editDialogOpen()).toBe(true);
    });

    it('confirming calls the service with the athlete/promotion ids and reloads the current page', () => {
      const { fixture, component, el, svc } = setup({ athleteId: '7' });
      svc.promotions.mockReturnValue(
        of({
          data: [makePromotion({ id: 5, recorded_at: '2026-03-15T00:00:00Z' })],
          meta: { current_page: 2, per_page: 20, total: 25, last_page: 2 },
        }),
      );
      fixture.detectChanges();
      svc.promotions.mockClear();

      (el.querySelector('[data-cy="promotion-edit-5"] button') as HTMLButtonElement).click();
      fixture.detectChanges();
      (component as unknown as { confirmEdit: () => void }).confirmEdit();

      expect(svc.updatePromotionRecordedAt).toHaveBeenCalledWith(7, 5, '2026-03-15');
      // Reloads the SAME page it was on, not page 1 — the row may have been
      // reached via next/prev and the correction shouldn't reset the reader.
      expect(svc.promotions).toHaveBeenCalledWith(7, 2);
    });

    it('cancel closes the dialog without calling the service', () => {
      const { fixture, component, el, svc } = setup();
      svc.promotions.mockReturnValue(
        of({
          data: [makePromotion({ id: 5 })],
          meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        }),
      );
      fixture.detectChanges();
      const dialogOpen = component as unknown as { editDialogOpen: () => boolean };

      (el.querySelector('[data-cy="promotion-edit-5"] button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialogOpen.editDialogOpen()).toBe(true);

      (el.querySelector('[data-cy="promotion-edit-cancel"] button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(dialogOpen.editDialogOpen()).toBe(false);
      expect(svc.updatePromotionRecordedAt).not.toHaveBeenCalled();
    });

    it('toasts an error and leaves the dialog open when the update fails', () => {
      const { fixture, component, svc } = setup();
      svc.promotions.mockReturnValue(
        of({
          data: [makePromotion({ id: 5 })],
          meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        }),
      );
      svc.updatePromotionRecordedAt.mockReturnValue(throwError(() => new Error('boom')));
      fixture.detectChanges();
      // MessageService is component-level (own `<p-toast>` per top-level tab,
      // same convention as athletes-list / payments-list) — resolve it off
      // the component's own injector, not TestBed's root.
      const add = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

      (component as unknown as { openEditDialog: (p: AthletePromotion) => void }).openEditDialog(
        makePromotion({ id: 5 }),
      );
      (component as unknown as { confirmEdit: () => void }).confirmEdit();

      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: "Couldn't update the date. Try again.",
        }),
      );
    });
  });

  describe('backfilling a historical promotion (#1431 PR 2 of 2)', () => {
    it('opens the create dialog defaulting to kind=belt on "add a past promotion"', () => {
      const { fixture, component, el, svc } = setup();
      svc.promotions.mockReturnValue(
        of({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 } }),
      );
      fixture.detectChanges();
      const dialogOpen = component as unknown as { createDialogOpen: () => boolean };

      expect(dialogOpen.createDialogOpen()).toBe(false);
      (el.querySelector('[data-cy="promotions-add"] button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(dialogOpen.createDialogOpen()).toBe(true);
      expect(
        (component as unknown as { createForm: { controls: { kind: { value: string } } } })
          .createForm.controls.kind.value,
      ).toBe('belt');
    });

    it('submits a belt payload with the composed from/to fields', () => {
      const { fixture, component, svc } = setup({ athleteId: '7' });
      svc.promotions.mockReturnValue(
        of({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 } }),
      );
      fixture.detectChanges();
      svc.promotions.mockClear();

      const c = component as unknown as {
        openCreateDialog: () => void;
        confirmCreate: () => void;
        createForm: { patchValue: (v: Record<string, unknown>) => void };
      };
      c.openCreateDialog();
      c.createForm.patchValue({
        kind: 'belt',
        recorded_at: new Date(2019, 2, 15),
        from_belt: 'white',
        to_belt: 'blue',
      });
      c.confirmCreate();

      expect(svc.createPromotion).toHaveBeenCalledWith(7, {
        kind: 'belt',
        recorded_at: '2019-03-15',
        from_belt: 'white',
        to_belt: 'blue',
      });
      // Stays on the page it was on rather than jumping to page 1 — a
      // backfill usually lands far from whatever the owner was reading.
      expect(svc.promotions).toHaveBeenCalledWith(7, 1);
    });

    it('submits a stripe payload with the composed belt_at_event + from/to stripes', () => {
      const { fixture, component, svc } = setup({ athleteId: '7' });
      svc.promotions.mockReturnValue(
        of({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 } }),
      );
      fixture.detectChanges();

      const c = component as unknown as {
        openCreateDialog: () => void;
        confirmCreate: () => void;
        createForm: { patchValue: (v: Record<string, unknown>) => void };
      };
      c.openCreateDialog();
      c.createForm.patchValue({
        kind: 'stripe',
        recorded_at: new Date(2020, 5, 1),
        belt_at_event: 'blue',
        from_stripes: '1',
        to_stripes: '2',
      });
      c.confirmCreate();

      expect(svc.createPromotion).toHaveBeenCalledWith(7, {
        kind: 'stripe',
        recorded_at: '2020-06-01',
        belt_at_event: 'blue',
        from_stripes: 1,
        to_stripes: 2,
      });
    });

    it('surfaces a chain-consistency 422 inline rather than a generic toast', () => {
      const { fixture, component, svc } = setup();
      svc.promotions.mockReturnValue(
        of({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 } }),
      );
      svc.createPromotion.mockReturnValue(
        throwError(() => ({
          status: 422,
          error: {
            errors: { from_belt: ["Doesn't match the belt after the previous promotion."] },
          },
        })),
      );
      fixture.detectChanges();

      const c = component as unknown as {
        openCreateDialog: () => void;
        confirmCreate: () => void;
        createForm: { patchValue: (v: Record<string, unknown>) => void };
        createError: () => string | null;
      };
      c.openCreateDialog();
      c.createForm.patchValue({
        kind: 'belt',
        recorded_at: new Date(2019, 2, 15),
        from_belt: 'white',
        to_belt: 'blue',
      });
      c.confirmCreate();

      expect(c.createError()).toBe("Doesn't match the belt after the previous promotion.");
    });

    it('cancel closes the create dialog without calling the service', () => {
      const { fixture, component, el, svc } = setup();
      svc.promotions.mockReturnValue(
        of({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 } }),
      );
      fixture.detectChanges();
      const dialogOpen = component as unknown as { createDialogOpen: () => boolean };

      (el.querySelector('[data-cy="promotions-add"] button') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-cy="promotion-create-cancel"] button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(dialogOpen.createDialogOpen()).toBe(false);
      expect(svc.createPromotion).not.toHaveBeenCalled();
    });
  });

  describe('deleting a promotion (#1431 PR 2 of 2)', () => {
    it('deletes on confirm, reloads the current page, and toasts', () => {
      const { fixture, el, svc } = setup({ athleteId: '7' });
      svc.promotions.mockReturnValue(
        of({
          data: [makePromotion({ id: 5 })],
          meta: { current_page: 2, per_page: 20, total: 25, last_page: 2 },
        }),
      );
      fixture.detectChanges();
      svc.promotions.mockClear();
      const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
      const confirmSpy = vi.spyOn(confirmationService, 'confirm');
      const add = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

      (el.querySelector('[data-cy="promotion-delete-5"] button') as HTMLButtonElement).click();
      const config = confirmSpy.mock.calls[0]![0] as { accept?: () => void };
      config.accept?.();

      expect(svc.deletePromotion).toHaveBeenCalledWith(7, 5);
      expect(svc.promotions).toHaveBeenCalledWith(7, 2);
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });

    it('toasts an error when the delete fails', () => {
      const { fixture, el, svc } = setup();
      svc.promotions.mockReturnValue(
        of({
          data: [makePromotion({ id: 5 })],
          meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        }),
      );
      svc.deletePromotion.mockReturnValue(throwError(() => new Error('boom')));
      fixture.detectChanges();
      const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
      const confirmSpy = vi.spyOn(confirmationService, 'confirm');
      const add = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

      (el.querySelector('[data-cy="promotion-delete-5"] button') as HTMLButtonElement).click();
      const config = confirmSpy.mock.calls[0]![0] as { accept?: () => void };
      config.accept?.();

      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: "Couldn't delete this promotion. Try again.",
        }),
      );
    });
  });
});

describe('PromotionsListComponent — time at the belt (#1772)', () => {
  function withProgression(progression: Record<string, unknown>) {
    const ctx = setup();
    ctx.svc.promotions.mockReturnValue(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        progression,
      }) as unknown as ReturnType<typeof ctx.svc.promotions>,
    );
    ctx.fixture.detectChanges();
    return ctx;
  }

  const FULL = {
    belt: 'blue',
    stripes: 2,
    belt_since: '2025-03-01',
    days_at_belt: 440,
    months_at_belt: 14,
    sessions_at_belt: 148,
    stripe_since: '2026-01-10',
    days_since_stripe: 125,
    sessions_since_stripe: 41,
  };

  it('says how long on this belt, and since the last stripe', () => {
    const { el } = withProgression(FULL);
    const strip = el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('On this belt since');
    expect(strip).toContain('14 months');
    expect(strip).toContain('148 sessions');
    expect(strip).toContain('Last stripe on');
    expect(strip).toContain('41 sessions since');
  });

  it('says there is no stripe on this belt yet', () => {
    const { el } = withProgression({
      ...FULL,
      stripes: 0,
      stripe_since: null,
      days_since_stripe: null,
      sessions_since_stripe: null,
    });
    const strip = el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('No stripe on this belt yet');
    expect(strip).not.toContain('Last stripe on');
  });

  it('says under a month, in singular and plural', () => {
    const { el } = withProgression({
      ...FULL,
      months_at_belt: 0,
      sessions_at_belt: 1,
      sessions_since_stripe: 1,
    });
    const strip = el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('under a month');
    expect(strip).toContain('1 session');
    expect(strip).not.toContain('1 sessions');
  });

  it('names stripes that exist with no dated row, rather than saying there are none', () => {
    const { el } = withProgression({
      ...FULL,
      stripes: 2,
      stripe_since: null,
      days_since_stripe: null,
      sessions_since_stripe: null,
    });
    const strip = el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('2 stripes, dates not recorded');
    expect(strip).not.toContain('No stripe on this belt yet');
  });

  it('shows no stripe line on a grade that carries none (a judo kyu)', () => {
    const ctx = setup();
    useLadder('judo');
    ctx.svc.promotions.mockReturnValue(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        progression: {
          ...FULL,
          belt: 'yellow',
          stripes: 0,
          stripe_since: null,
          days_since_stripe: null,
          sessions_since_stripe: null,
        },
      }) as unknown as ReturnType<typeof ctx.svc.promotions>,
    );
    ctx.fixture.detectChanges();
    const strip = ctx.el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('On this belt since');
    expect(strip).not.toContain('stripe');
  });

  it('words a dan as a dan, not as a stripe', () => {
    const ctx = setup();
    useLadder('judo');
    ctx.svc.promotions.mockReturnValue(
      of({
        data: [makePromotion()],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        progression: { ...FULL, belt: 'black', stripes: 2 },
      }) as unknown as ReturnType<typeof ctx.svc.promotions>,
    );
    ctx.fixture.detectChanges();
    const strip = ctx.el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('3° dan since');
    expect(strip).not.toContain('Last stripe');
  });

  it('leaves the empty timeline to its own message', () => {
    const ctx = setup();
    ctx.svc.promotions.mockReturnValue(
      of({
        data: [],
        meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
        progression: { ...FULL, belt_since: null },
      }) as unknown as ReturnType<typeof ctx.svc.promotions>,
    );
    ctx.fixture.detectChanges();

    expect(ctx.el.querySelector('[data-cy="promotions-progression"]')).toBeNull();
    expect(ctx.el.querySelector('[data-cy="promotions-empty"]')).not.toBeNull();
  });

  it('says no belt is recorded rather than measuring from the joining date', () => {
    const { el } = withProgression({
      belt_since: null,
      days_at_belt: null,
      months_at_belt: null,
      sessions_at_belt: null,
      stripe_since: null,
      days_since_stripe: null,
      sessions_since_stripe: null,
    });
    const strip = el.querySelector('[data-cy="promotions-progression"]')?.textContent ?? '';

    expect(strip).toContain('No belt recorded yet');
    expect(strip).not.toContain('On this belt since');
  });
});

describe('PromotionsListComponent — missing steps (#1966)', () => {
  afterEach(() => TestBed.resetTestingModule());

  /*
   * Every payload below is the server's own output for GET /promotions
   * (#1970, `PromotionGaps`), captured from the endpoint with the rows of
   * `AthletePromotionGapsTest`. Only the row ids are renamed — 15 for
   * Jacopo's opening row, 12 for his "white 2 → 3" — so a spec never
   * describes a shape the server does not send.
   */

  /** The opening row "→ blue", dated the day Jacopo was entered. */
  const opening = makePromotion({
    id: 15,
    kind: 'belt',
    from_belt: null,
    to_belt: 'blue',
    from_stripes: null,
    to_stripes: null,
    belt_at_event: 'blue',
    is_opening: true,
    recorded_at: '2026-09-20T10:00:00+00:00',
  });
  const whiteThree = makePromotion({
    id: 12,
    kind: 'stripe',
    from_belt: null,
    to_belt: null,
    from_stripes: 2,
    to_stripes: 3,
    belt_at_event: 'white',
    is_opening: false,
    recorded_at: '2024-03-12T00:00:00+00:00',
  });
  const fourthStripe: PromotionGap = {
    key: 'stripe:white:4',
    kind: 'stripe',
    belt: 'white',
    from_belt: null,
    from_stripes: 3,
    to_stripes: 4,
    after: { promotion_id: 12, recorded_at: '2024-03-12' },
    before: { promotion_id: 15, recorded_at: '2026-09-20' },
    completes_promotion_id: null,
  };
  const blueBelt: PromotionGap = {
    key: 'belt:blue:0',
    kind: 'belt',
    belt: 'blue',
    from_belt: 'white',
    from_stripes: null,
    to_stripes: null,
    after: { promotion_id: 12, recorded_at: '2024-03-12' },
    before: null,
    completes_promotion_id: 15,
  };
  const jacopoProgression = {
    belt: 'blue' as const,
    stripes: 2,
    belt_since: '2026-09-20',
    days_at_belt: 6,
    months_at_belt: 0,
    sessions_at_belt: 0,
    stripe_since: null,
    days_since_stripe: null,
    sessions_since_stripe: null,
  };

  function page(data: AthletePromotion[], gaps: PromotionGap[]) {
    return of({
      data,
      meta: { current_page: 1, per_page: 20, total: data.length, last_page: 1 },
      progression: jacopoProgression,
      gaps,
      history_starts_at: '2024-03-12',
    });
  }

  function jacopo(gaps: PromotionGap[] = [fourthStripe, blueBelt]) {
    const ctx = setup({ athleteId: '7' });
    useLadder('bjj');
    ctx.svc.promotions.mockReturnValue(page([opening, whiteThree], gaps));
    ctx.fixture.detectChanges();
    return ctx;
  }

  interface Internals {
    confirmCreate: () => void;
    createForm: { patchValue: (v: Record<string, unknown>) => void };
    createDialogTitle: () => string;
    fillWindow: () => { min: Date | null; max: Date } | null;
  }

  function click(el: HTMLElement, cy: string): void {
    (el.querySelector(`[data-cy="${cy}"] button`) as HTMLButtonElement).click();
  }

  it('draws the missing stripe in place, between the rows it sits between', () => {
    const { el } = jacopo();
    const cys = Array.from(el.querySelectorAll('[data-cy="promotions-list"] > li')).map((li) =>
      li.getAttribute('data-cy'),
    );

    expect(cys).toEqual(['promotion-15', 'promotion-gap-stripe:white:4', 'promotion-12']);
    const ghost = el.querySelector('[data-cy="promotion-gap-stripe:white:4"]');
    expect(ghost?.textContent).toContain('When?');
    expect(ghost?.querySelector('[data-cy="belt-stripe-missing"]')).not.toBeNull();
  });

  it('asks the opening row for its real date instead of drawing a second blue row', () => {
    const { el } = jacopo();
    const row = el.querySelector('[data-cy="promotion-15"]');

    expect(row?.textContent).toContain('When?');
    expect(row?.textContent).toContain('In Budojo since');
    // The belt before it comes from the history: white, not "first belt".
    expect(row?.textContent).toContain('White');
    expect(el.querySelector('[data-cy="promotion-gap-belt:blue:0"]')).toBeNull();
  });

  it('says "on this belt since" is the day of entry while the opening row stands', () => {
    const { el } = jacopo();
    expect(el.querySelector('[data-cy="promotions-entry-day"]')).not.toBeNull();
  });

  it('says the history before the first known point is not recorded, in one line', () => {
    const { el } = jacopo();
    expect(el.querySelector('[data-cy="promotions-history-before"]')?.textContent).toContain(
      "the history isn't recorded",
    );
  });

  it('fills a missing stripe with the date alone, bounded to the days between its neighbours', () => {
    const { el, fixture, component, svc } = jacopo();
    click(el, 'gap-add-date-stripe:white:4');
    fixture.detectChanges();
    const c = component as unknown as Internals;

    expect(c.createDialogTitle()).toBe('When did they get stripe 4?');
    const window = c.fillWindow();
    // `(after, before]`: the day after the white-three row, up to the
    // opening row it sits under.
    expect(window?.min).toEqual(new Date(2024, 2, 13));
    expect(window?.max).toEqual(new Date(2026, 8, 20));

    c.createForm.patchValue({ recorded_at: new Date(2024, 8, 20) });
    c.confirmCreate();

    expect(svc.createPromotion).toHaveBeenCalledWith(7, {
      kind: 'stripe',
      recorded_at: '2024-09-20',
      from_stripes: 3,
      to_stripes: 4,
      belt_at_event: 'white',
    });
    expect(svc.completeOpeningPromotion).not.toHaveBeenCalled();
  });

  it('completes the opening row — a PATCH with the belt before — never a second row', () => {
    const { el, fixture, component, svc } = jacopo();
    click(el, 'gap-add-date-belt:blue:0');
    fixture.detectChanges();
    const c = component as unknown as Internals;

    expect(c.createDialogTitle()).toBe('When did they get the Blue belt?');

    c.createForm.patchValue({ recorded_at: new Date(2025, 0, 10) });
    c.confirmCreate();

    expect(svc.completeOpeningPromotion).toHaveBeenCalledWith(7, 15, {
      recorded_at: '2025-01-10',
      from_belt: 'white',
    });
    expect(svc.createPromotion).not.toHaveBeenCalled();
  });

  it("bounds the opening row's step as the server does: after its older row, up to today", () => {
    // `before: null` on a completing step runs to today — not to the opening
    // row's own date, which is only the day of entry (`PromotionGaps::inWindow`).
    const { el, fixture, component } = jacopo();
    click(el, 'gap-add-date-belt:blue:0');
    fixture.detectChanges();
    const c = component as unknown as Internals & { maxDate: Date };

    expect(c.fillWindow()?.min).toEqual(new Date(2024, 2, 13));
    expect(c.fillWindow()?.max).toEqual(c.maxDate);
  });

  it('never offers "Saltato" on the step an opening row stands for', () => {
    // The server ignores a skip there: the belt is one they hold.
    const { el, component, svc } = jacopo();

    expect(el.querySelector('[data-cy="gap-skip-belt:blue:0"]')).toBeNull();
    (component as unknown as { skip: (gap: PromotionGap) => void }).skip(blueBelt);
    expect(svc.skipPromotionStep).not.toHaveBeenCalled();
  });

  it('draws the blue stripes above the completed row, once the blue belt is dated', () => {
    // The server's reply after PATCH 15 → white → blue on 10 Jan 2025.
    const completed = makePromotion({
      ...opening,
      from_belt: 'white',
      is_opening: false,
      recorded_at: '2025-01-10T00:00:00+00:00',
    });
    const blueStripe = (n: number): PromotionGap => ({
      key: `stripe:blue:${n}`,
      kind: 'stripe',
      belt: 'blue',
      from_belt: null,
      from_stripes: n - 1,
      to_stripes: n,
      after: { promotion_id: 15, recorded_at: '2025-01-10' },
      before: null,
      completes_promotion_id: null,
    });
    const ctx = setup({ athleteId: '7' });
    useLadder('bjj');
    ctx.svc.promotions.mockReturnValue(
      page(
        [completed, whiteThree],
        [
          { ...fourthStripe, before: { promotion_id: 15, recorded_at: '2025-01-10' } },
          blueStripe(1),
          blueStripe(2),
        ],
      ),
    );
    ctx.fixture.detectChanges();

    const cys = Array.from(ctx.el.querySelectorAll('[data-cy="promotions-list"] > li')).map((li) =>
      li.getAttribute('data-cy'),
    );
    expect(cys).toEqual([
      'promotion-gap-stripe:blue:2',
      'promotion-gap-stripe:blue:1',
      'promotion-15',
      'promotion-gap-stripe:white:4',
      'promotion-12',
    ]);
    // A dated belt row: no "Quando?" on it any more.
    expect(ctx.el.querySelector('[data-cy="promotion-15"]')?.textContent).not.toContain('When?');
  });

  it('skips a step, and brings it back from the toast', () => {
    const { el, fixture, svc } = jacopo();
    const add = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

    click(el, 'gap-skip-stripe:white:4');

    expect(svc.skipPromotionStep).toHaveBeenCalledWith(7, 'white', 4);
    const toast = add.mock.calls.at(-1)?.[0] as { summary: string; data: { undo: () => void } };
    expect(toast.summary).toBe('White, stripe 4: marked as skipped');

    toast.data.undo();
    expect(svc.unskipPromotionStep).toHaveBeenCalledWith(7, 'white', 4);
  });

  it('keys a poom → dan skip by the degree it carries, not by 0', () => {
    // Taekwondo, the server's reply: a 2nd poom on record, black with the
    // 2nd dan today (stored 1) — the poom → dan step never written down.
    const secondPoom = makePromotion({
      id: 7,
      kind: 'stripe',
      from_belt: null,
      to_belt: null,
      from_stripes: 0,
      to_stripes: 1,
      belt_at_event: 'black-and-red',
      is_opening: false,
      recorded_at: '2022-05-01T10:00:00+00:00',
    });
    const poomToDan: PromotionGap = {
      key: 'belt:black:1',
      kind: 'belt',
      belt: 'black',
      from_belt: 'black-and-red',
      from_stripes: null,
      to_stripes: null,
      after: { promotion_id: 7, recorded_at: '2022-05-01' },
      before: null,
      completes_promotion_id: null,
    };
    const { el, fixture, svc } = setup({ athleteId: '7' });
    useLadder('taekwondo');
    svc.promotions.mockReturnValue(
      of({
        data: [secondPoom],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        gaps: [poomToDan],
        history_starts_at: '2022-05-01',
      }),
    );
    fixture.detectChanges();
    const add = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

    click(el, 'gap-skip-belt:black:1');
    expect(svc.skipPromotionStep).toHaveBeenCalledWith(7, 'black', 1);

    (add.mock.calls.at(-1)?.[0] as { data: { undo: () => void } }).data.undo();
    expect(svc.unskipPromotionStep).toHaveBeenCalledWith(7, 'black', 1);
  });

  it('keeps the keyboard in the list after a skip, on the row that took its place', async () => {
    const { el, fixture, svc } = jacopo();
    // The server's reply once white's fourth stripe is skipped.
    svc.promotions.mockReturnValue(page([opening, whiteThree], [blueBelt]));

    const skipButton = el.querySelector<HTMLButtonElement>(
      '[data-cy="gap-skip-stripe:white:4"] button',
    )!;
    skipButton.focus();
    skipButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Not the toast's undo: the toast leaves after five seconds, and focus
    // would fall to <body> with it.
    expect(document.activeElement).toBe(el.querySelector('[data-cy="promotion-edit-12"] button'));
  });

  it('puts the keyboard on the row a fill wrote, not on <body> after the reload', async () => {
    const { el, fixture, component, svc } = jacopo();
    click(el, 'gap-add-date-stripe:white:4');
    fixture.detectChanges();
    // The server's replies: the POST's row, then the timeline, where the blue
    // step now starts after the stripe just written, not after row 12.
    const written = makePromotion({
      id: 20,
      kind: 'stripe',
      from_belt: null,
      to_belt: null,
      from_stripes: 3,
      to_stripes: 4,
      belt_at_event: 'white',
      is_opening: false,
      recorded_at: '2024-09-20T00:00:00+00:00',
    });
    svc.createPromotion.mockReturnValue(of(written));
    svc.promotions.mockReturnValue(
      page(
        [opening, written, whiteThree],
        [{ ...blueBelt, after: { promotion_id: 20, recorded_at: '2024-09-20' } }],
      ),
    );

    const c = component as unknown as Internals;
    c.createForm.patchValue({ recorded_at: new Date(2024, 8, 20) });
    c.confirmCreate();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(el.querySelector('[data-cy="promotion-edit-20"] button'));
  });

  it('folds more than two missing steps in a row, and opens them on "show"', () => {
    // The server's reply for a blue belt with four stripes, a white → blue
    // and a blue 3 → 4 on record: three stripes missing between them.
    const blue = makePromotion({
      id: 8,
      kind: 'belt',
      from_belt: 'white',
      to_belt: 'blue',
      from_stripes: null,
      to_stripes: null,
      belt_at_event: 'blue',
      is_opening: false,
      recorded_at: '2024-01-10T00:00:00+00:00',
    });
    const fourth = makePromotion({
      id: 9,
      kind: 'stripe',
      from_belt: null,
      to_belt: null,
      from_stripes: 3,
      to_stripes: 4,
      belt_at_event: 'blue',
      is_opening: false,
      recorded_at: '2025-06-01T00:00:00+00:00',
    });
    const stripe = (n: number): PromotionGap => ({
      key: `stripe:blue:${n}`,
      kind: 'stripe',
      belt: 'blue',
      from_belt: null,
      from_stripes: n - 1,
      to_stripes: n,
      after: { promotion_id: 8, recorded_at: '2024-01-10' },
      before: { promotion_id: 9, recorded_at: '2025-06-01' },
      completes_promotion_id: null,
    });
    const { el, fixture, svc } = setup({ athleteId: '7' });
    useLadder('bjj');
    svc.promotions.mockReturnValue(
      of({
        data: [fourth, blue],
        meta: { current_page: 1, per_page: 20, total: 2, last_page: 1 },
        gaps: [stripe(1), stripe(2), stripe(3)],
        history_starts_at: '2024-01-10',
      }),
    );
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-cy^="promotion-gap-stripe"]').length).toBe(0);
    expect(el.querySelector('[data-cy="promotion-gap-run"]')?.textContent).toContain(
      '3 steps with no date',
    );

    click(el, 'gap-run-show');
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-cy^="promotion-gap-stripe"]').length).toBe(3);
  });

  it('draws the tab exactly as before when nothing is missing', () => {
    const ctx = setup();
    useLadder('bjj');
    ctx.svc.promotions.mockReturnValue(
      of({
        data: [
          makePromotion({ id: 2, kind: 'belt', from_belt: 'white', to_belt: 'blue' }),
          makePromotion({
            id: 1,
            kind: 'belt',
            from_belt: null,
            to_belt: 'white',
            is_opening: true,
            recorded_at: '2023-01-10T00:00:00Z',
          }),
        ],
        meta: { current_page: 1, per_page: 20, total: 2, last_page: 1 },
        gaps: [],
        history_starts_at: '2023-01-10',
      }),
    );
    ctx.fixture.detectChanges();

    expect(ctx.el.querySelectorAll('[data-cy="promotions-list"] > li').length).toBe(2);
    expect(ctx.el.querySelector('[data-cy^="promotion-gap"]')).toBeNull();
    // Opening on the ladder's first belt: the history starts where the athlete did.
    expect(ctx.el.querySelector('[data-cy="promotions-history-before"]')).toBeNull();
    expect(ctx.el.querySelector('[data-cy="promotions-entry-day"]')).toBeNull();
  });
});
