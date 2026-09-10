import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
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
  type AthletePromotionCreatePayload,
  AthleteService,
  Belt,
  MAX_STRIPES_PER_BELT,
} from '../../../../core/services/athlete.service';
import { LanguageService } from '../../../../core/services/language.service';
import { datePickerFormatFor } from '../../../../shared/utils/locale';
import { BELT_KEYS, BELT_ORDER } from '../../../../shared/utils/i18n-enum-keys';
import { BeltBadgeComponent } from '../../../../shared/components/belt-badge/belt-badge.component';
import { ConfirmDestructiveButtonComponent } from '../../../../shared/components/confirm-destructive-button/confirm-destructive-button.component';

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
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
 */
@Component({
  selector: 'app-promotions-list',
  standalone: true,
  imports: [
    DatePipe,
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
  private readonly languageService = inject(LanguageService);

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
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);

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

  /** Every belt, in IBJJF rank order — for `to_belt` / `belt_at_event`. */
  protected readonly beltOptions = computed<SelectOption<Belt>[]>(() => {
    this.languageService.currentLang();
    return BELT_ORDER.map((value) => ({ label: this.translate.instant(BELT_KEYS[value]), value }));
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
    const belt = this.beltAtEventValue();
    if (belt === null) return [];
    const max = MAX_STRIPES_PER_BELT[belt];
    return Array.from({ length: max + 1 }, (_, i) => String(i)).map((v) => ({
      label: v,
      value: v,
    }));
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

  protected load(page: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.athleteService
      .promotions(this.athleteId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.promotions.set(resp.data);
          this.currentPage.set(resp.meta.current_page);
          this.lastPage.set(resp.meta.last_page);
          this.loading.set(false);
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
