import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import {
  type AthletePromotion,
  type AthleteProgression,
  type AthletePromotionCreatePayload,
  AthleteService,
  Belt,
  type PromotionGap,
} from '../../../../core/services/athlete.service';
import { BeltLadderService } from '../../../../core/services/belt-ladder.service';
import { LanguageService } from '../../../../core/services/language.service';
import { datePickerFormatFor } from '../../../../shared/utils/locale';
import { BeltBadgeComponent } from '../../../../shared/components/belt-badge/belt-badge.component';
import { ConfirmDestructiveButtonComponent } from '../../../../shared/components/confirm-destructive-button/confirm-destructive-button.component';
import { LocaleDatePipe } from '../../../../shared/pipes/locale-date.pipe';
import { composeTimeline, type TimelineEntry } from './promotion-timeline';

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

/** The toast that carries the "Saltato" undo, kept apart from the plain ones (#1966). */
const SKIP_TOAST_KEY = 'promotion-skip';

/** The dates a missing step can be given and still sit where it belongs (#1966). */
interface GapWindow {
  /** The first day that fits, or null when nothing recorded comes before it. */
  readonly min: Date | null;
  readonly max: Date;
}

/**
 * Owner-facing timeline of an athlete's belt + stripe promotion
 * history (post-v2.9.0). Reads `/api/v1/athletes/{id}/promotions`
 * — server writes the rows in lock-step with the
 * AthleteObserver's CommunityPost emission so the timeline stays
 * in sync with the community feed.
 *
 * Two row shapes, discriminated by `kind`:
 * - `belt`: shows the transition `<old belt> → <new belt>` (old
 *   may be null on first assignment).
 * - `stripe`: shows the transition `<n> → <m> stripes` next to a
 *   small belt badge so the visual context is preserved.
 *
 * Pagination: 20/page, prev / next buttons. Mobile-first card
 * list — date primary, transition secondary, recorder tertiary.
 *
 * **Editing (#1431 PR 1 of 2).** Each row's date can be corrected —
 * the common case where a promotion was entered after the fact and
 * carries the date it was typed, not the date it happened.
 *
 * **Backfilling + deleting (#1431 PR 2 of 2).** "Add a past
 * promotion" opens a dialog handling both kinds — the piece that
 * lets an owner transcribe a paper register. A row that contradicts
 * its same-kind neighbours in the timeline is refused by the server;
 * the specific reason is surfaced inline rather than a generic
 * failure. Each row also carries a delete, for one entered by
 * mistake.
 *
 * **Missing steps (#1966).** Where the history must have a step no row
 * records, the timeline draws it in place as a ghost row that asks one
 * thing — when — and fills the backfill dialog with everything else.
 */
/** The time-at-belt strip's second line (#1772). */
interface StripeLine {
  readonly kind: 'dated' | 'undated' | 'none';
  /** "3° dan" on a grade that counts dan or poom; null where it counts stripes. */
  readonly grade: string | null;
}

@Component({
  selector: 'app-promotions-list',
  standalone: true,
  imports: [
    LocaleDatePipe,
    NgTemplateOutlet,
    TranslatePipe,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmPopupModule,
    DatePickerModule,
    DialogModule,
    MessageModule,
    SelectButtonModule,
    SelectModule,
    SkeletonModule,
    ToastModule,
    TooltipModule,
    BeltBadgeComponent,
    ConfirmDestructiveButtonComponent,
  ],
  providers: [MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promotions-list.component.html',
  styleUrl: './promotions-list.component.scss',
})
export class PromotionsListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly athleteService = inject(AthleteService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly beltLadder = inject(BeltLadderService);
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The date format for every picker on this component (#1498).
   *
   * A signal, not a constant, so switching the sidebar language re-renders
   * the dates with it — before this the format was hardcoded in the template
   * and the app shipped two different ones.
   */
  protected readonly datePickerFormat = computed(() =>
    datePickerFormatFor(this.languageService.currentLang()),
  );

  protected readonly promotions = signal<readonly AthletePromotion[]>([]);
  /** How long on this belt and since the last stripe, above the timeline (#1772). */
  protected readonly progression = signal<AthleteProgression | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);

  /** The steps no row records, across the whole history (#1966). */
  protected readonly gaps = signal<readonly PromotionGap[]>([]);
  protected readonly historyStartsAt = signal<string | null>(null);
  /** Folded runs of missing steps the owner has opened. */
  private readonly openRuns = signal<ReadonlySet<string>>(new Set());
  /** The step whose "Saltato" is on its way to the server. */
  protected readonly skippingKey = signal<string | null>(null);
  protected readonly skipToastKey = SKIP_TOAST_KEY;

  /** The page's rows with the missing steps between them (#1966). */
  protected readonly entries = computed<TimelineEntry[]>(() =>
    composeTimeline(this.promotions(), this.gaps(), this.openRuns()),
  );

  /**
   * The step the create dialog is filling in, when it was opened from a
   * missing step rather than from "add a past promotion" (#1966). The dialog
   * then asks one thing, the date, and knows everything else.
   */
  protected readonly filling = signal<PromotionGap | null>(null);

  protected readonly editDialogOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<AthletePromotion | null>(null);
  /**
   * A promotion can't be recorded ahead of today — same rule the server
   * enforces (`before_or_equal:today`, evaluated in the app's UTC
   * timezone). Built via `utcCalendarDayAsLocalMidnight` rather than a
   * bare `new Date()` so the picker's upper bound matches what the
   * server will actually accept: a bare `new Date()` reads the
   * BROWSER's local calendar day, which runs up to a day ahead of
   * UTC's for any timezone east of Greenwich (Italy included) during
   * the first hours of the local day — the picker would let the owner
   * choose a date the server then rejects as "in the future".
   */
  protected readonly maxDate = utcCalendarDayAsLocalMidnight(new Date());
  protected readonly editForm = this.fb.group({
    recorded_at: this.fb.control<Date | null>(null),
  });

  protected readonly deletingId = signal<number | null>(null);

  protected readonly createDialogOpen = signal(false);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly createForm = this.fb.group({
    kind: this.fb.control<'belt' | 'stripe'>('belt', { nonNullable: true }),
    recorded_at: this.fb.control<Date | null>(null),
    from_belt: this.fb.control<Belt | null>(null),
    to_belt: this.fb.control<Belt | null>(null),
    belt_at_event: this.fb.control<Belt | null>(null),
    from_stripes: this.fb.control<string | null>(null),
    to_stripes: this.fb.control<string | null>(null),
  });

  /**
   * Computed against `languageService.currentLang()` so the labels
   * recompute on a runtime locale toggle — same pattern as the athlete
   * form's own `beltOptions`.
   */
  protected readonly kindOptions = computed<SelectOption<'belt' | 'stripe'>[]>(() => {
    this.languageService.currentLang();
    return [
      {
        label: this.translate.instant('athletes.detail.promotions.createDialog.kindBelt'),
        value: 'belt',
      },
      {
        label: this.translate.instant('athletes.detail.promotions.createDialog.kindStripe'),
        value: 'stripe',
      },
    ];
  });

  /**
   * A stripe count on a timeline row, read the way its grade counts (#1801):
   * a plain number for stripes and *tacche*, "2° dan" for a dan.
   */
  protected stripeCount(promotion: AthletePromotion, stripes: number | null): string {
    this.languageService.currentLang();
    if (stripes === null) return '';
    return promotion.belt_at_event === null
      ? String(stripes)
      : this.beltLadder.stripesLabel(promotion.belt_at_event, stripes);
  }

  /**
   * The strip's second line, read the way this grade counts (#1772):
   * nothing on a grade that carries no stripes (a judo or taekwondo kyu);
   * a dan or a poom named as such; and stripes that exist with no dated row
   * (an athlete created on two stripes, #1771) kept apart from none at all.
   */
  protected stripeLine(pr: AthleteProgression): StripeLine | null {
    const countsStripes = this.beltLadder.countsStripes(pr.belt);
    if (countsStripes && this.beltLadder.stripeCap(pr.belt) === 0) return null;

    const grade = countsStripes ? null : this.beltLadder.stripesLabel(pr.belt, pr.stripes);
    if (pr.stripe_since !== null) return { kind: 'dated', grade };
    if (pr.stripes > 0) return { kind: 'undated', grade };

    // A black belt's first dan is the belt row itself: nothing to add.
    return countsStripes ? { kind: 'none', grade: null } : null;
  }

  /** Whether the row's count is stripes (and so needs the "stripes" noun). */
  protected countsStripes(promotion: AthletePromotion): boolean {
    return (
      promotion.belt_at_event === null || this.beltLadder.countsStripes(promotion.belt_at_event)
    );
  }

  /**
   * The academy's whole ladder, in rank order — for `to_belt` /
   * `belt_at_event` (#1801). The whole of it even where the academy does not
   * train kids (#1651): this dialog transcribes history, and an adult's can
   * start on a youth belt.
   */
  protected readonly beltOptions = computed<SelectOption<Belt>[]>(() => {
    this.languageService.currentLang();
    return this.beltLadder.allBeltOptions();
  });

  /** Same list plus a leading "first belt" option — `from_belt` alone can be empty. */
  protected readonly fromBeltOptions = computed<SelectOption<Belt | null>[]>(() => [
    {
      label: this.translate.instant('athletes.detail.promotions.createDialog.firstBelt'),
      value: null,
    },
    ...this.beltOptions(),
  ]);

  private readonly beltAtEventValue = toSignal(
    this.createForm.controls.belt_at_event.valueChanges,
    {
      initialValue: null,
    },
  );

  /**
   * Stripe options are bounded by the selected `belt_at_event`, same
   * constraint-over-correction pattern as the athlete form's own
   * belt/stripes pair — picking an out-of-range count is prevented
   * rather than merely rejected after the fact.
   */
  protected readonly createStripesOptions = computed<SelectOption<string>[]>(() => {
    this.languageService.currentLang();
    const belt = this.beltAtEventValue();
    if (belt === null) return [];
    return this.beltLadder.stripeOptions(belt);
  });

  private athleteId = 0;

  constructor() {
    // Whichever belt the owner picks, any previously-chosen stripe count
    // may no longer be in range — reset rather than silently clamp, so
    // the field visibly needs a fresh choice instead of quietly holding
    // a value the owner didn't pick for this belt.
    this.createForm.controls.belt_at_event.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.createForm.patchValue({ from_stripes: null, to_stripes: null });
      });
  }

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    this.athleteId = raw !== null ? Number.parseInt(raw, 10) : 0;
    if (this.athleteId > 0) {
      this.load(1);
    }
  }

  protected load(page: number, afterLoad?: () => void): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.athleteService
      .promotions(this.athleteId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.promotions.set(resp.data);
          this.progression.set(resp.progression ?? null);
          this.gaps.set(resp.gaps ?? []);
          this.historyStartsAt.set(resp.history_starts_at ?? null);
          this.currentPage.set(resp.meta.current_page);
          this.lastPage.set(resp.meta.last_page);
          this.loading.set(false);
          afterLoad?.();
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  protected nextPage(): void {
    if (this.currentPage() < this.lastPage()) this.load(this.currentPage() + 1);
  }

  protected previousPage(): void {
    if (this.currentPage() > 1) this.load(this.currentPage() - 1);
  }

  /**
   * Seeded from the row's current date so the picker opens where the
   * owner is correcting, not on today. `promotion.recorded_at` is a
   * UTC instant (the server stores date-only edits at UTC midnight);
   * converting it through `utcCalendarDayAsLocalMidnight` before
   * handing it to the picker keeps the calendar day the owner SEES,
   * and the day `toIsoDate` reads back on confirm, aligned with the
   * day the server actually stored — a raw `new Date(iso)` would
   * render (and silently re-save) the previous calendar day for any
   * browser timezone west of Greenwich.
   */
  protected openEditDialog(promotion: AthletePromotion): void {
    this.editing.set(promotion);
    this.editForm.reset({
      recorded_at: utcCalendarDayAsLocalMidnight(new Date(promotion.recorded_at)),
    });
    this.editDialogOpen.set(true);
  }

  protected confirmEdit(): void {
    const target = this.editing();
    const recordedAt = this.editForm.controls.recorded_at.value;
    if (target === null || recordedAt === null || this.saving()) return;

    this.saving.set(true);
    this.athleteService
      .updatePromotionRecordedAt(this.athleteId, target.id, toIsoDate(recordedAt))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.editDialogOpen.set(false);
          // Reload rather than patch the row in place: the edit can move a
          // row across the `recorded_at DESC` ordering, possibly off this
          // page entirely — the server's fresh sort is the source of truth.
          this.load(this.currentPage());
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.promotions.toast.updatedSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.updatedDetail'),
            life: 3000,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.promotions.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.errorGeneric'),
            life: 4000,
          });
        },
      });
  }

  protected openCreateDialog(): void {
    this.filling.set(null);
    this.createForm.reset({
      kind: 'belt',
      recorded_at: null,
      from_belt: null,
      to_belt: null,
      belt_at_event: null,
      from_stripes: null,
      to_stripes: null,
    });
    this.createError.set(null);
    this.createDialogOpen.set(true);
  }

  protected confirmCreate(): void {
    if (this.creating()) return;
    const v = this.createForm.getRawValue();
    if (v.recorded_at === null) return;

    const recordedAt = toIsoDate(v.recorded_at);
    const gap = this.filling();
    if (gap !== null) {
      this.saveFilled(gap, recordedAt);
      return;
    }

    let payload: AthletePromotionCreatePayload;
    if (v.kind === 'belt') {
      if (v.to_belt === null) return;
      payload = {
        kind: 'belt',
        recorded_at: recordedAt,
        from_belt: v.from_belt,
        to_belt: v.to_belt,
      };
    } else {
      if (v.belt_at_event === null || v.from_stripes === null || v.to_stripes === null) return;
      payload = {
        kind: 'stripe',
        recorded_at: recordedAt,
        from_stripes: Number(v.from_stripes),
        to_stripes: Number(v.to_stripes),
        belt_at_event: v.belt_at_event,
      };
    }

    this.creating.set(true);
    this.createError.set(null);
    this.athleteService
      .createPromotion(this.athleteId, payload)
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: () => {
          this.createDialogOpen.set(false);
          // Stay on the page the owner was reading — a backfill often
          // lands years away from it, and jumping to page 1 would hide
          // the row the owner was just looking at without warning.
          this.load(this.currentPage());
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.promotions.toast.createdSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.createdDetail'),
            life: 3000,
          });
        },
        error: (err: { status?: number; error?: { errors?: Record<string, string[]> } }) => {
          // A chain-consistency conflict (422) names the exact row it
          // disagrees with — surfacing that beats a generic failure for
          // the one flow where the owner needs to know precisely what
          // to fix (docs/entities/athlete-promotion.md).
          const firstError =
            err.status === 422 && err.error?.errors
              ? Object.values(err.error.errors)[0]?.[0]
              : undefined;
          this.createError.set(
            firstError ?? this.translate.instant('athletes.detail.promotions.createDialog.error'),
          );
        },
      });
  }

  /**
   * "Aggiungi la data" on a missing step (#1966): the create dialog, with
   * everything but the date already known and the date bounded to the days
   * that fit between the step's neighbours — so the chain validator has
   * nothing left to refuse.
   */
  protected openFillDialog(gap: PromotionGap): void {
    this.filling.set(gap);
    this.createForm.reset({
      kind: gap.kind,
      recorded_at: null,
      from_belt: null,
      to_belt: null,
      belt_at_event: null,
      from_stripes: null,
      to_stripes: null,
    });
    this.createError.set(null);
    this.createDialogOpen.set(true);
  }

  /** The bounds of the date picker while filling a step. */
  protected readonly fillWindow = computed<GapWindow | null>(() => {
    const gap = this.filling();
    return gap === null ? null : this.windowOf(gap);
  });

  /** The window as the hint writes it: ISO days, for the locale date pipe. */
  protected readonly fillWindowIso = computed<{ from: string | null; to: string } | null>(() => {
    const window = this.fillWindow();
    return window === null
      ? null
      : {
          from: window.min === null ? null : toIsoDate(window.min),
          to: toIsoDate(window.max),
        };
  });

  /**
   * The server's window, `(after, before]`, and up to today with no `before`
   * (`PromotionGaps::inWindow`) — for a step an opening row stands for too:
   * that row's own date is only the day of entry, and the server already
   * passes over it when it works out `before`.
   */
  private windowOf(gap: PromotionGap): GapWindow {
    const before = gap.before === null ? null : dayOf(gap.before.recorded_at);
    return {
      min: gap.after === null ? null : nextDay(dayOf(gap.after.recorded_at)),
      max: before === null || before > this.maxDate ? this.maxDate : before,
    };
  }

  /**
   * Writes the step. A step an opening row stands for completes that row —
   * the belt before it and its real date — instead of adding a second one.
   */
  private saveFilled(gap: PromotionGap, recordedAt: string): void {
    const request =
      gap.completes_promotion_id !== null && gap.from_belt !== null
        ? this.athleteService.completeOpeningPromotion(this.athleteId, gap.completes_promotion_id, {
            recorded_at: recordedAt,
            from_belt: gap.from_belt,
          })
        : this.athleteService.createPromotion(this.athleteId, payloadFor(gap, recordedAt));

    // Where the step sat, for when the row it became is not on this page.
    const index = this.entryIndexOf(gap);
    this.creating.set(true);
    this.createError.set(null);
    request.pipe(finalize(() => this.creating.set(false))).subscribe({
      next: (row) => {
        this.createDialogOpen.set(false);
        this.filling.set(null);
        // The reload's skeleton takes the trigger away: put the keyboard on
        // the row the fill wrote, so it does not fall to <body>.
        this.load(this.currentPage(), () => this.focusEntry(row?.id ?? null, index));
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('athletes.detail.promotions.toast.createdSummary'),
          detail: this.translate.instant('athletes.detail.promotions.toast.createdDetail'),
          life: 3000,
        });
      },
      error: (err: { status?: number; error?: { errors?: Record<string, string[]> } }) => {
        const firstError =
          err.status === 422 && err.error?.errors
            ? Object.values(err.error.errors)[0]?.[0]
            : undefined;
        this.createError.set(
          firstError ?? this.translate.instant('athletes.detail.promotions.createDialog.error'),
        );
      },
    });
  }

  /**
   * "Saltato" (#1966): the step never happened — a BJJ white belt can go from
   * three stripes to blue. Remembered on the server so it stops asking, with
   * an undo in the toast. The keyboard stays in the list, on the row that
   * took the step's place: the toast leaves on its own after five seconds,
   * and focus parked on its button would fall to <body> with it. The toast
   * speaks for itself — PrimeNG gives each message `aria-live`.
   */
  protected skip(gap: PromotionGap): void {
    // A step an opening row stands for is a belt they hold: it is completed,
    // never skipped, and the server ignores a skip there.
    if (this.skippingKey() !== null || !canSkip(gap)) return;
    const index = this.entryIndexOf(gap);
    this.skippingKey.set(gap.key);
    this.athleteService
      .skipPromotionStep(this.athleteId, gap.belt, stepStripes(gap))
      .pipe(finalize(() => this.skippingKey.set(null)))
      .subscribe({
        next: () => {
          this.load(this.currentPage(), () => this.focusEntry(null, index));
          this.messageService.add({
            key: SKIP_TOAST_KEY,
            severity: 'success',
            summary: this.translate.instant('athletes.detail.promotions.gap.skipped', {
              step: this.stepLabel(gap),
            }),
            data: { undo: () => this.unskip(gap) },
            life: 5000,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.promotions.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.promotions.gap.skipError'),
            life: 4000,
          });
        },
      });
  }

  private unskip(gap: PromotionGap): void {
    this.messageService.clear(SKIP_TOAST_KEY);
    this.athleteService.unskipPromotionStep(this.athleteId, gap.belt, stepStripes(gap)).subscribe({
      next: () => this.load(this.currentPage(), () => this.focusAfterRender(addDateSelector(gap))),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.detail.promotions.toast.errorSummary'),
          detail: this.translate.instant('athletes.detail.promotions.gap.undoError'),
          life: 4000,
        });
      },
    });
  }

  /** Focus an element in this tab once the reload has drawn it. */
  private focusAfterRender(selector: string): void {
    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
      }),
    );
  }

  /**
   * After a reload that took the focused control away: the row `rowId` when
   * it is on the page, otherwise the entry now at `index` (the one that took
   * the old one's place, or the last), otherwise the list itself.
   */
  private focusEntry(rowId: number | null, index: number): void {
    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        const list = this.host.nativeElement.querySelector<HTMLElement>(
          '[data-cy="promotions-list"]',
        );
        if (list === null) return;
        const byId =
          rowId === null ? null : list.querySelector<HTMLElement>(`[data-cy="promotion-${rowId}"]`);
        const entries = Array.from(list.children) as HTMLElement[];
        const entry = byId ?? entries[Math.min(Math.max(index, 0), entries.length - 1)];
        (entry?.querySelector<HTMLElement>('button') ?? list).focus();
      }),
    );
  }

  /** Where a step sits in the list as drawn now. */
  private entryIndexOf(gap: PromotionGap): number {
    return this.entries().findIndex(
      (e) =>
        (e.kind === 'gap' && e.gap.key === gap.key) ||
        (e.kind === 'row' && e.completing?.key === gap.key),
    );
  }

  protected openRun(runKey: string): void {
    this.openRuns.update((open) => new Set([...open, runKey]));
  }

  /** "Bianca, 4° grado" / "Nera, 3° dan" / "cintura Blu" — a step named in words. */
  protected stepLabel(gap: PromotionGap): string {
    this.languageService.currentLang();
    const belt = this.beltLadder.label(gap.belt);
    if (gap.kind === 'belt') {
      return this.translate.instant('athletes.detail.promotions.gap.stepBelt', { belt });
    }
    const to = gap.to_stripes ?? 0;
    return this.beltLadder.countsStripes(gap.belt)
      ? this.translate.instant('athletes.detail.promotions.gap.stepStripe', { belt, n: to })
      : this.translate.instant('athletes.detail.promotions.gap.stepGrade', {
          belt,
          grade: this.beltLadder.stripesLabel(gap.belt, to),
        });
  }

  /** The fill dialog's question: "Quando ha preso il 4° grado?". */
  protected fillTitle(gap: PromotionGap): string {
    this.languageService.currentLang();
    if (gap.kind === 'belt') {
      return this.translate.instant('athletes.detail.promotions.gap.titleBelt', {
        belt: this.beltLadder.label(gap.belt),
      });
    }
    const to = gap.to_stripes ?? 0;
    return this.beltLadder.countsStripes(gap.belt)
      ? this.translate.instant('athletes.detail.promotions.gap.titleStripe', { n: to })
      : this.translate.instant('athletes.detail.promotions.gap.titleGrade', {
          grade: this.beltLadder.stripesLabel(gap.belt, to),
        });
  }

  /** A count on a belt, as its grade reads it: "3", or "3° dan". */
  protected countOn(belt: Belt, stripes: number | null): string {
    this.languageService.currentLang();
    if (stripes === null) return '';
    return this.beltLadder.countsStripes(belt)
      ? String(stripes)
      : this.beltLadder.stripesLabel(belt, stripes);
  }

  /** Whether a belt's count is stripes (tiles on the badge, and the "gradi" noun). */
  protected countsStripesOn(belt: Belt): boolean {
    return this.beltLadder.countsStripes(belt);
  }

  /** The create dialog asks the step's question when it is filling one. */
  protected readonly createDialogTitle = computed<string>(() => {
    this.languageService.currentLang();
    const gap = this.filling();
    return gap === null
      ? this.translate.instant('athletes.detail.promotions.createDialog.title')
      : this.fillTitle(gap);
  });

  protected trackEntry(entry: TimelineEntry): string {
    switch (entry.kind) {
      case 'row':
        return `row-${entry.row.id}`;
      case 'gap':
        return `gap-${entry.gap.key}`;
      case 'collapsed':
        return `run-${entry.runKey}`;
    }
  }

  protected canSkip(gap: PromotionGap): boolean {
    return canSkip(gap);
  }

  /** "Saltato" agrees with what was skipped: a grade, or a belt. */
  protected skipLabelKey(gap: PromotionGap): string {
    return gap.kind === 'belt'
      ? 'athletes.detail.promotions.gap.skipBelt'
      : 'athletes.detail.promotions.gap.skip';
  }

  /**
   * A folded run's one line: "Viola 1 → 4" when every step is a stripe on the
   * same belt, otherwise just the count.
   */
  protected runSummary(
    gaps: readonly PromotionGap[],
  ): { belt: Belt; from: number | null; to: number | null } | null {
    const newest = gaps[0];
    const oldest = gaps[gaps.length - 1];
    const sameBelt = gaps.every((g) => g.kind === 'stripe' && g.belt === newest.belt);
    return sameBelt
      ? { belt: newest.belt, from: oldest.from_stripes, to: newest.to_stripes }
      : null;
  }

  /**
   * "Su questa cintura dal…" counts from the opening row's date — the day
   * the athlete was entered — when that row is the latest belt row (#1966).
   * Said, so the number is not taken for the promotion's. Only on the first
   * page, where the latest belt row is; and not for someone entered on the
   * ladder's first belt, whose entry day is when they started.
   */
  protected readonly beltSinceIsEntryDay = computed<boolean>(() => {
    if (this.currentPage() !== 1) return false;
    const latestBelt = this.promotions().find((p) => p.kind === 'belt');
    return latestBelt?.is_opening === true && latestBelt.to_belt !== this.beltLadder.startingBelt();
  });

  /**
   * "Prima del … la storia non è registrata" under the oldest row (#1966):
   * the one line that stands for everything before the first known point,
   * instead of a ghost for each of those steps. Not for a history that opens
   * on the ladder's first belt — that one starts where the athlete did.
   */
  protected readonly historyUnrecordedBefore = computed<string | null>(() => {
    const startsAt = this.historyStartsAt();
    if (startsAt === null || this.currentPage() !== this.lastPage()) return null;
    const rows = this.promotions();
    const oldest = rows[rows.length - 1];
    if (oldest === undefined) return null;
    const opensAtTheStart =
      oldest.kind === 'belt' &&
      oldest.from_belt === null &&
      oldest.to_belt === this.beltLadder.startingBelt();
    return opensAtTheStart ? null : startsAt;
  });

  protected deletePromotion(promotion: AthletePromotion): void {
    this.deletingId.set(promotion.id);
    this.athleteService
      .deletePromotion(this.athleteId, promotion.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => {
          this.load(this.currentPage());
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.promotions.toast.deletedSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.deletedDetail'),
            life: 3000,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.promotions.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.deleteErrorDetail'),
            life: 4000,
          });
        },
      });
  }
}

/** Whether "Saltato" applies: not to the step an opening row stands for. */
function canSkip(gap: PromotionGap): boolean {
  return gap.completes_promotion_id === null;
}

/** Where focus returns when a skipped step is brought back. */
function addDateSelector(gap: PromotionGap): string {
  return `[data-cy="gap-add-date-${gap.key}"] button`;
}

/**
 * A skip is keyed by the state the step leads to, which the contract puts in
 * the key's last segment (`<kind>:<belt>:<stripes after>`). Read from there,
 * not worked out: a belt step does not always start at 0 — taekwondo's 2nd
 * poom leads to the black belt's 2nd dan, `belt:black:1`.
 */
function stepStripes(gap: PromotionGap): number {
  const last = Number(gap.key.split(':').pop());
  return Number.isInteger(last) ? last : (gap.to_stripes ?? 0);
}

/** The create payload for a missing step: everything is known but the date. */
function payloadFor(gap: PromotionGap, recordedAt: string): AthletePromotionCreatePayload {
  return gap.kind === 'belt'
    ? { kind: 'belt', recorded_at: recordedAt, from_belt: gap.from_belt, to_belt: gap.belt }
    : {
        kind: 'stripe',
        recorded_at: recordedAt,
        from_stripes: gap.from_stripes ?? 0,
        to_stripes: gap.to_stripes ?? 0,
        belt_at_event: gap.belt,
      };
}

/** A server day (`YYYY-MM-DD` or an instant) as the local midnight a date picker reads. */
function dayOf(iso: string): Date {
  return utcCalendarDayAsLocalMidnight(new Date(iso));
}

function nextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Re-anchors a UTC instant's calendar day onto local midnight — the Date
 * this returns has the SAME year/month/day when read with local getters
 * (`getFullYear`/`getMonth`/`getDate`, what PrimeNG's datepicker and
 * `toIsoDate` both use) as `instant` has when read with UTC getters.
 * Without this, `new Date(anIsoString)` fed straight to a date-only
 * picker renders and round-trips the wrong calendar day for any browser
 * timezone that isn't UTC itself.
 */
function utcCalendarDayAsLocalMidnight(instant: Date): Date {
  return new Date(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
}
