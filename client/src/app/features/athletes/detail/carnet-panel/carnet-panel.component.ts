import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { AcademyService } from '../../../../core/services/academy.service';
import { Carnet, CarnetEntry, CarnetService } from '../../../../core/services/carnet.service';
import { LanguageService } from '../../../../core/services/language.service';
import { activeCarnetOf } from '../../../../shared/utils/active-carnet';
import { localeFor } from '../../../../shared/utils/locale';

/**
 * Entry-carnet panel on the athlete's payments tab (#1364).
 *
 * Sits beside the monthly-fee table rather than in a tab of its own: the
 * owner's mental model is "this athlete's money", not two separate ledgers,
 * and a fourth tab would push the tab bar toward overflow.
 *
 * The whole panel hides when the academy hasn't configured a carnet price and
 * size — an academy that doesn't sell carnets never sees the concept.
 *
 * `remaining_entries` and `is_active` come from the server; the client never
 * recomputes them. It has no view of the consumption ledger, and a second
 * implementation of the rule is how the two would drift.
 */
@Component({
  selector: 'app-carnet-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    AccordionModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    SkeletonModule,
    TagModule,
  ],
  templateUrl: './carnet-panel.component.html',
  styleUrl: './carnet-panel.component.scss',
})
export class CarnetPanelComponent {
  private readonly fb = inject(FormBuilder);
  private readonly carnetService = inject(CarnetService);
  private readonly academyService = inject(AcademyService);
  private readonly languageService = inject(LanguageService);
  private readonly messageService = inject(MessageService);
  // The popup element itself is the parent tab's — rendering a second one
  // here would put two on the page reacting to the same service, and show two.
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  /** Set by the parent tab once the route param resolves. */
  readonly athleteId = input.required<number | null>();

  protected readonly loading = signal<boolean>(true);
  protected readonly carnets = signal<readonly Carnet[]>([]);
  protected readonly entries = signal<readonly CarnetEntry[]>([]);
  protected readonly entriesLoading = signal<boolean>(false);
  protected readonly sellDialogOpen = signal<boolean>(false);
  protected readonly selling = signal<boolean>(false);
  protected readonly validityDialogOpen = signal<boolean>(false);
  protected readonly savingValidity = signal<boolean>(false);
  protected readonly deleting = signal<boolean>(false);
  /**
   * Reactive rather than template-driven, matching every other date field in
   * the SPA and `client/CLAUDE.md`.
   *
   * Both dates start **empty**, which is also exactly the server contract:
   * omit `purchased_at` and the sale is dated today, omit `valid_from` and it
   * follows the sale. The hints say so.
   *
   * Pre-filling the purchase date with today was tried and abandoned. The
   * value does reach the control — the open calendar highlights the right day
   * — but PrimeNG never writes it into the input's text, so the field reads
   * empty while holding a value, which is worse than empty. Seeding at
   * construction, on open, and on the dialog's `onShow` all behave the same.
   * Curiously the re-dating dialog below seeds fine; the difference has not
   * been isolated, and chasing it further was not worth the cosmetics.
   */
  protected readonly sellForm = this.fb.group({
    purchased_at: this.fb.control<Date | null>(null),
    // Where the carnet starts covering sessions (#1380). Left empty it follows
    // the sale; set earlier, the carnet pays for training already recorded.
    valid_from: this.fb.control<Date | null>(null),
  });

  /** Re-dating an existing carnet. Separate form, separate dialog. */
  protected readonly validityForm = this.fb.group({
    valid_from: this.fb.control<Date | null>(null),
  });

  /**
   * How many sessions the carnet is paying for right now — what the owner
   * loses cover on if they delete it. Some may be picked up by another carnet
   * whose window also holds them, which is why the copy says "sta pagando"
   * rather than promising they all become uncovered.
   */
  protected readonly consumedByActive = computed<number>(() => {
    const active = this.activeCarnet();
    return active === null ? 0 : active.total_entries - active.remaining_entries;
  });

  /** Today, so the sell dialog cannot offer a future purchase date. */
  protected readonly maxPurchaseDate = new Date();

  /**
   * Both halves of the offering must be configured before a carnet can be
   * sold — the server returns 422 otherwise. Gating here means the owner is
   * told upfront rather than through a surprising toast.
   */
  protected readonly offering = computed(() => {
    const academy = this.academyService.academy();
    const priceCents = academy?.carnet_price_cents ?? null;
    const entries = academy?.carnet_entries ?? null;
    return priceCents !== null && entries !== null ? { priceCents, entries } : null;
  });

  /** The carnet the next session will be charged against — see `activeCarnetOf`. */
  protected readonly activeCarnet = computed<Carnet | null>(() => activeCarnetOf(this.carnets()));

  /**
   * Every carnet except the one on the card — expired, exhausted, and any
   * second still-valid carnet bought before the first ran out. Filtering on
   * `!is_active` would make that second one vanish from the UI entirely.
   */
  protected readonly otherCarnets = computed<readonly Carnet[]>(() => {
    const active = this.activeCarnet();
    return this.carnets().filter((c) => c.id !== active?.id);
  });

  /**
   * Two or fewer entries left, so the owner can say "vuoi rinnovare?" before
   * the athlete walks out rather than after.
   */
  protected readonly lowBalance = computed<boolean>(() => {
    const active = this.activeCarnet();
    return active !== null && active.remaining_entries <= LOW_BALANCE_THRESHOLD;
  });

  /** Inside 30 days of expiry — the other moment worth a nudge. */
  protected readonly expiringSoon = computed<boolean>(() => {
    const active = this.activeCarnet();
    if (active === null) return false;
    const daysLeft = (Date.parse(active.expires_at) - Date.now()) / MS_PER_DAY;
    return daysLeft <= EXPIRY_WARNING_DAYS;
  });

  constructor() {
    // `athleteId` resolves from the parent's route param after construction,
    // and changes again if the owner navigates between athletes without
    // leaving the tab. An effect on the input signal covers both; a lifecycle
    // hook would only cover the first.
    effect(() => {
      const id = this.athleteId();
      if (id === null) return;
      this.entries.set([]);
      this.load(id);
    });
  }

  protected openSellDialog(): void {
    this.sellForm.reset({ purchased_at: null, valid_from: null });
    this.sellDialogOpen.set(true);
  }

  protected confirmSell(): void {
    const id = this.athleteId();
    if (id === null || this.selling()) return;

    // Empty is the normal case: the server dates the sale today. A value is
    // present only when the owner deliberately back-dated it.
    const purchasedAt = this.sellForm.controls.purchased_at.value;
    const validFrom = this.sellForm.controls.valid_from.value;

    this.selling.set(true);
    this.carnetService
      .sell(
        id,
        purchasedAt === null ? undefined : toIsoDate(purchasedAt),
        validFrom === null ? undefined : toIsoDate(validFrom),
      )
      .pipe(finalize(() => this.selling.set(false)))
      .subscribe({
        next: () => {
          this.sellDialogOpen.set(false);
          this.load(id);
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.carnets.toast.soldSummary'),
            detail: this.translate.instant('athletes.detail.carnets.toast.soldDetail'),
            life: 3000,
          });
        },
        error: (err: { status?: number }) => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.carnets.toast.errorSummary'),
            detail: this.translate.instant(
              err.status === 422
                ? 'athletes.detail.carnets.toast.errorNotConfigured'
                : 'athletes.detail.carnets.toast.errorGeneric',
            ),
            life: 4000,
          });
        },
      });
  }

  protected openValidityDialog(): void {
    const active = this.activeCarnet();
    if (active === null) return;

    // Seeded from the current value so the picker opens on the month the owner
    // is correcting, not on today.
    this.validityForm.reset({ valid_from: new Date(`${active.valid_from}T00:00:00`) });
    this.validityDialogOpen.set(true);
  }

  protected confirmValidity(): void {
    const id = this.athleteId();
    const active = this.activeCarnet();
    const validFrom = this.validityForm.controls.valid_from.value;
    if (id === null || active === null || validFrom === null || this.savingValidity()) return;

    this.savingValidity.set(true);
    this.carnetService
      .updateValidity(id, active.id, toIsoDate(validFrom))
      .pipe(finalize(() => this.savingValidity.set(false)))
      .subscribe({
        next: () => {
          this.validityDialogOpen.set(false);
          this.load(id);
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.carnets.toast.validitySummary'),
            detail: this.translate.instant('athletes.detail.carnets.toast.validityDetail'),
            life: 3000,
          });
        },
        error: () => this.reportError('athletes.detail.carnets.toast.errorGeneric'),
      });
  }

  protected confirmDelete(event: MouseEvent): void {
    const id = this.athleteId();
    const active = this.activeCarnet();
    if (id === null || active === null) return;

    // The owner sees what the deletion costs before it happens, not after: a
    // carnet halfway through its entries is paying for training already done.
    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('athletes.detail.carnets.confirmDelete', {
        code: active.code,
        count: this.consumedByActive(),
      }),
      accept: () => this.applyDelete(id, active.id),
    });
  }

  private applyDelete(athleteId: number, carnetId: number): void {
    this.deleting.set(true);
    this.carnetService
      .remove(athleteId, carnetId)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.entries.set([]);
          this.load(athleteId);
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.carnets.toast.deletedSummary'),
            detail: this.translate.instant('athletes.detail.carnets.toast.deletedDetail'),
            life: 3000,
          });
        },
        error: () => this.reportError('athletes.detail.carnets.toast.errorGeneric'),
      });
  }

  private reportError(detailKey: string): void {
    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant('athletes.detail.carnets.toast.errorSummary'),
      detail: this.translate.instant(detailKey),
      life: 4000,
    });
  }

  /**
   * The register is fetched only when the owner opens it — most visits to the
   * payments tab never ask "where did the entries go".
   */
  protected loadEntries(): void {
    const id = this.athleteId();
    const active = this.activeCarnet();
    if (id === null || active === null || this.entriesLoading()) return;

    this.entriesLoading.set(true);
    this.carnetService
      .entries(id, active.id)
      .pipe(finalize(() => this.entriesLoading.set(false)))
      .subscribe({
        next: (entries) => this.entries.set(entries),
        error: () =>
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.carnets.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.carnets.toast.errorEntries'),
            life: 4000,
          }),
      });
  }

  private load(athleteId: number): void {
    this.loading.set(true);
    this.carnetService
      .list(athleteId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (carnets) => this.carnets.set(carnets),
        // Keep the last-known-good list on error, same reasoning as the
        // payments table: blanking it would claim the athlete has no carnet,
        // which is a worse lie than stale data.
        error: () =>
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.carnets.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.carnets.toast.loadError'),
            life: 4000,
          }),
      });
  }

  protected formatPrice(cents: number): string {
    const locale = localeFor(this.languageService.currentLang());
    return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  }

  protected formatDate(iso: string): string {
    const locale = localeFor(this.languageService.currentLang());
    // Parsed as UTC to avoid a timezone shift moving a date-only value to the
    // previous day for users west of Greenwich.
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
}

const LOW_BALANCE_THRESHOLD = 2;
const EXPIRY_WARNING_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
