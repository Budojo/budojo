import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { LanguageService } from '../../../../core/services/language.service';
import { type AthletePromotion, AthleteService } from '../../../../core/services/athlete.service';
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
