import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { finalize } from 'rxjs';
import { FeeTier, FeeTierService } from '../../../core/services/fee-tier.service';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../../shared/utils/locale';

/**
 * The academy's monthly price list (#1381).
 *
 * An academy used to have exactly one fee. One that charges by how often
 * someone trains — 2 lessons €55, 3 lessons €65 — had no way to say so, and
 * was reduced to selling carnets as a stand-in just to tell the two groups
 * apart. This is the list; the athlete form is where someone is put on a line
 * of it.
 *
 * Embedded in the academy form rather than given a route of its own, next to
 * the flat fee it generalises: the two answer the same question and splitting
 * them across two pages would make the owner hunt. It follows the
 * schedule-planner precedent — its own endpoints and its own immediate-effect
 * saves inside a form that saves separately.
 *
 * Amounts are euros on screen and cents on the wire, like every other price
 * in the app.
 */
@Component({
  selector: 'app-fee-tier-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    ConfirmPopupModule,
    InputNumberModule,
    InputTextModule,
    SkeletonModule,
  ],
  // Same split as the schedule planner: the toast lands in the host form's
  // MessageService, while the confirm popup below belongs to this template
  // and so needs its own ConfirmationService.
  providers: [ConfirmationService],
  templateUrl: './fee-tier-list.component.html',
  styleUrl: './fee-tier-list.component.scss',
})
export class FeeTierListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly feeTierService = inject(FeeTierService);
  private readonly languageService = inject(LanguageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal<boolean>(true);
  protected readonly tiers = signal<readonly FeeTier[]>([]);
  protected readonly saving = signal<boolean>(false);
  /** `null` = closed, `0` = adding, `>0` = editing that tier. */
  protected readonly editingId = signal<number | null>(null);

  protected readonly form = this.fb.group({
    label: this.fb.control<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    // Euros here, cents on the wire.
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    lessons_per_week: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(14),
    ]),
  });

  protected readonly isAdding = computed(() => this.editingId() === 0);

  constructor() {
    this.load();
  }

  protected startAdding(): void {
    this.form.reset({ label: '', amount: null, lessons_per_week: null });
    this.editingId.set(0);
  }

  protected startEditing(tier: FeeTier): void {
    this.form.reset({
      label: tier.label,
      amount: tier.amount_cents / 100,
      lessons_per_week: tier.lessons_per_week,
    });
    this.editingId.set(tier.id);
  }

  protected cancelEditing(): void {
    this.editingId.set(null);
  }

  protected submit(): void {
    const id = this.editingId();
    if (id === null || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      label: raw.label.trim(),
      // Rounded, not truncated: 55.555 typed into a currency field is meant
      // as 55.56, and `Math.trunc` would quietly take a cent off.
      amount_cents: Math.round((raw.amount ?? 0) * 100),
      lessons_per_week: raw.lessons_per_week ?? 1,
    };

    this.saving.set(true);
    const op$ =
      id === 0 ? this.feeTierService.create(payload) : this.feeTierService.update(id, payload);

    op$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.editingId.set(null);
          this.load();
          this.toast('success', 'academy.feeTiers.toast.savedSummary');
        },
        error: (err: { status?: number }) => {
          this.toast(
            'error',
            'academy.feeTiers.toast.errorSummary',
            err.status === 422
              ? 'academy.feeTiers.toast.duplicateDetail'
              : 'academy.feeTiers.toast.errorDetail',
          );
        },
      });
  }

  protected confirmRemove(event: MouseEvent, tier: FeeTier): void {
    // The athlete count is the whole point of asking: dropping a tier hands
    // everyone on it back to the academy's flat fee, and that is a price
    // change for real people. Say how many before, not after.
    const message = this.translate.instant(this.confirmKeyFor(tier.athletes_count), {
      label: tier.label,
      count: tier.athletes_count,
    });

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message,
      accept: () => this.remove(tier.id),
    });
  }

  private remove(id: number): void {
    this.feeTierService
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.editingId() === id) this.editingId.set(null);
          this.load();
          this.toast('success', 'academy.feeTiers.toast.removedSummary');
        },
        error: () =>
          this.toast(
            'error',
            'academy.feeTiers.toast.errorSummary',
            'academy.feeTiers.toast.errorDetail',
          ),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.feeTierService
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (tiers) => this.tiers.set(tiers),
        // Keep the last-known list rather than blanking it — an empty list
        // reads as "you have no tiers", which is a different and wrong claim.
        error: () =>
          this.toast(
            'error',
            'academy.feeTiers.toast.errorSummary',
            'academy.feeTiers.toast.loadErrorDetail',
          ),
      });
  }

  /**
   * "2 lessons a week · 7 athletes", or just the lesson count when nobody is
   * on the tier yet. Built here rather than in the template because both
   * halves pluralise, and ngx-translate has no plural rule of its own — the
   * repo's convention is an explicit `…One` / `…Other` key pair chosen in
   * code (see `MonthlySummaryComponent`).
   */
  protected metaFor(tier: FeeTier): string {
    const lessons = this.translate.instant(
      tier.lessons_per_week === 1
        ? 'academy.feeTiers.lessonsPerWeekOne'
        : 'academy.feeTiers.lessonsPerWeekOther',
      { count: tier.lessons_per_week },
    );

    if (tier.athletes_count === 0) {
      return lessons;
    }

    const athletes = this.translate.instant(
      tier.athletes_count === 1
        ? 'academy.feeTiers.athletesOnOne'
        : 'academy.feeTiers.athletesOnOther',
      { count: tier.athletes_count },
    );

    return `${lessons} · ${athletes}`;
  }

  private confirmKeyFor(athletesCount: number): string {
    if (athletesCount === 0) return 'academy.feeTiers.confirm.remove';
    return athletesCount === 1
      ? 'academy.feeTiers.confirm.removeWithAthletesOne'
      : 'academy.feeTiers.confirm.removeWithAthletesOther';
  }

  protected formatAmount(cents: number): string {
    const locale = localeFor(this.languageService.currentLang());
    return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  }

  protected currentLocale(): string {
    return localeFor(this.languageService.currentLang());
  }

  private toast(severity: 'success' | 'error', summaryKey: string, detailKey?: string): void {
    this.messageService.add({
      severity,
      summary: this.translate.instant(summaryKey),
      detail: detailKey ? this.translate.instant(detailKey) : undefined,
      life: severity === 'error' ? 4000 : 3000,
    });
  }
}
