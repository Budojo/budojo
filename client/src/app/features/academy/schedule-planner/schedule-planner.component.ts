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
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { finalize } from 'rxjs';
import { AcademyService, AcademySchedule } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../../shared/utils/locale';
import { TrainingDaysPickerComponent } from '../../../shared/components/training-days-picker/training-days-picker.component';

/** Carbon dayOfWeek convention (0=Sun..6=Sat). Display order: Mon-first. */
const DAY_KEY_MAP: Record<number, string> = {
  0: 'weekdays.sun',
  1: 'weekdays.mon',
  2: 'weekdays.tue',
  3: 'weekdays.wed',
  4: 'weekdays.thu',
  5: 'weekdays.fri',
  6: 'weekdays.sat',
};
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * Schedule a future `training_days` change (#1094). One of three
 * states at any time:
 *
 *   - **idle** — no pending change exists; the "Plan a change" CTA
 *     reveals the inline form
 *   - **pending** — `next_schedule` exists on the academy; render
 *     "Dal {date} → {days}" + a Cancel button
 *   - **editing** — the user opened the form to schedule a change
 *
 * Same-day changes (immediate effect today) still go through the
 * canonical `PATCH /api/v1/academy` field above this section. The
 * server-side endpoint we POST to here rejects `effective_from <=
 * today` (the form's min-date guard mirrors that).
 */
@Component({
  selector: 'app-schedule-planner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    ConfirmPopupModule,
    DatePickerModule,
    MessageModule,
    TrainingDaysPickerComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './schedule-planner.component.html',
  styleUrl: './schedule-planner.component.scss',
})
export class SchedulePlannerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly academyService = inject(AcademyService);
  private readonly messageService = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  /** Tomorrow at 00:00 — the min date the picker will accept. */
  protected readonly minDate = this.tomorrowMidnight();

  protected readonly editing = signal(false);
  protected readonly submitting = signal(false);
  protected readonly cancelling = signal(false);

  protected readonly nextSchedule = computed<AcademySchedule | null>(
    () => this.academyService.academy()?.next_schedule ?? null,
  );

  protected readonly currentSchedule = computed<AcademySchedule | null>(
    () => this.academyService.academy()?.current_schedule ?? null,
  );

  /** `Mar 1, 2026 — Mon, Wed, Fri` style line for the pending state. */
  protected readonly nextScheduleLabel = computed<string>(() => {
    const next = this.nextSchedule();
    if (!next) return '';
    const locale = localeFor(this.languageService.currentLang());
    const datePart = new Date(`${next.effective_from}T00:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return `${datePart} — ${this.weekdaysLabel(next.training_days)}`;
  });

  protected readonly form = this.fb.nonNullable.group({
    effective_from: this.fb.nonNullable.control<Date | null>(null, [Validators.required]),
    training_days: this.fb.nonNullable.control<number[]>([], [Validators.required]),
  });

  protected readonly trainingDaysControl = this.form.controls.training_days;

  startEditing(): void {
    // Seed the form with the current schedule so the user sees what
    // they're about to change FROM. Empty `training_days` is fine —
    // the form requires at least one selection so the submit button
    // stays disabled until the user picks at least one day.
    const current = this.currentSchedule();
    this.form.reset({
      effective_from: null,
      training_days: current?.training_days ?? [],
    });
    this.editing.set(true);
  }

  cancelEditing(): void {
    this.editing.set(false);
    this.form.reset({ effective_from: null, training_days: [] });
  }

  setTrainingDays(days: number[]): void {
    this.trainingDaysControl.setValue(days);
    this.trainingDaysControl.markAsDirty();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    const value = this.form.getRawValue();
    const effective = value.effective_from;
    if (!effective) return;

    const payload = {
      // `training_days: []` from the form maps to `null` on the wire —
      // an empty array isn't a valid POST payload (validation rejects
      // `min:1`), and `null` is the canonical "schedule not configured
      // for this period" sentinel. Owner who picks zero days gets an
      // immediate "schedule paused starting {date}" effect.
      training_days: value.training_days.length === 0 ? null : value.training_days,
      effective_from: toIsoDate(effective),
    };

    this.submitting.set(true);
    this.academyService
      .scheduleChange(payload)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('academy.schedule.toast.scheduledSummary'),
            detail: this.translate.instant('academy.schedule.toast.scheduledDetail', {
              date: this.formatDate(payload.effective_from),
            }),
          });
          this.editing.set(false);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('academy.schedule.toast.errorSummary'),
            detail: this.translate.instant('academy.schedule.toast.errorDetail'),
          });
        },
      });
  }

  confirmCancel(event: Event): void {
    const next = this.nextSchedule();
    if (!next) return;
    this.confirmation.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('academy.schedule.cancelConfirm'),
      acceptLabel: this.translate.instant('academy.schedule.cancelAccept'),
      rejectLabel: this.translate.instant('academy.schedule.cancelReject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.executeCancel(next.id),
    });
  }

  private executeCancel(scheduleId: number): void {
    this.cancelling.set(true);
    this.academyService
      .cancelPendingSchedule(scheduleId)
      .pipe(
        finalize(() => this.cancelling.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('academy.schedule.toast.cancelledSummary'),
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('academy.schedule.toast.errorSummary'),
            detail: this.translate.instant('academy.schedule.toast.cancelErrorDetail'),
          });
        },
      });
  }

  /** Renders `[1, 3, 5]` → "Mon, Wed, Fri" in the user's locale. */
  private weekdaysLabel(days: number[] | null): string {
    if (!days || days.length === 0) {
      return this.translate.instant('academy.schedule.notConfigured');
    }
    const set = new Set(days);
    const parts = DISPLAY_ORDER.filter((d) => set.has(d)).map((d) =>
      this.translate.instant(DAY_KEY_MAP[d]),
    );
    return parts.join(', ');
  }

  private formatDate(iso: string): string {
    const locale = localeFor(this.languageService.currentLang());
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private tomorrowMidnight(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

/** Local-time `YYYY-MM-DD` — same logic as the attendance-rate helper. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
