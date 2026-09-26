import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { finalize } from 'rxjs';
import {
  AcademyClosurePayload,
  AcademyClosureService,
} from '../../../../core/services/academy-closure.service';
import { AcademyClosure, AcademyService } from '../../../../core/services/academy.service';
import { LanguageService } from '../../../../core/services/language.service';
import { localIso } from '../../../../shared/utils/class-occurrences';
import { closureDayCount, formatClosureRange } from '../../../../shared/utils/closure-range';
import {
  CONFIRM_ACCEPT_DESTRUCTIVE,
  CONFIRM_REJECT_BUTTON,
} from '../../../../shared/utils/confirm-buttons';
import { datePickerFormatFor, localeFor } from '../../../../shared/utils/locale';

/** Why Save did not save, said under the dates. */
type DatesError = 'missing' | 'order' | null;

/**
 * The days the academy is shut (#1766), under the week on the timetable page.
 *
 * Here because a closure is the other half of "when do we train": the week
 * says which days, this says which of them we are not there. Every attendance
 * count then leaves those days out, and the missed-streak alert stops warning
 * about a summer nobody trained through.
 *
 * Its own component rather than more of the timetable: the page was already
 * the week and a class form. The list reads the academy (`Academy.closures`),
 * so a write refreshes it and every other screen sees the change too.
 */
@Component({
  selector: 'app-academy-closures',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
  ],
  // Its own confirm: a ConfirmationService from the page would draw this
  // component's question in the page's dialog, or nowhere.
  providers: [ConfirmationService],
  templateUrl: './academy-closures.component.html',
  styleUrl: './academy-closures.component.scss',
})
export class AcademyClosuresComponent {
  private readonly fb = inject(FormBuilder);
  private readonly closureService = inject(AcademyClosureService);
  private readonly academyService = inject(AcademyService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dialogOpen = signal(false);
  protected readonly saving = signal(false);
  /** The closure being edited, or null while adding one. */
  protected readonly editing = signal<AcademyClosure | null>(null);
  protected readonly datesError = signal<DatesError>(null);

  protected readonly form = this.fb.group({
    starts_on: this.fb.control<Date | null>(null),
    ends_on: this.fb.control<Date | null>(null),
    label: this.fb.nonNullable.control(''),
  });

  protected readonly datePickerFormat = computed(() =>
    datePickerFormatFor(this.languageService.currentLang()),
  );

  /** The rows: dates in words, name, and how many days they take out. */
  protected readonly rows = computed(() => {
    const locale = localeFor(this.languageService.currentLang());
    return (this.academyService.academy()?.closures ?? []).map((closure) => {
      const days = closureDayCount(closure);
      return {
        closure,
        range: formatClosureRange(closure, locale),
        days: this.translate.instant(
          days === 1
            ? 'academy.timetable.closures.daysOne'
            : 'academy.timetable.closures.daysOther',
          { count: days },
        ),
      };
    });
  });

  constructor() {
    // Picking a date is the fix for "pick both dates": the message goes as
    // soon as the fix starts, like the class name's.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.datesError.set(null));
  }

  protected startAdding(): void {
    this.editing.set(null);
    this.form.reset({ starts_on: null, ends_on: null, label: '' });
    this.datesError.set(null);
    this.dialogOpen.set(true);
  }

  protected startEditing(closure: AcademyClosure): void {
    this.editing.set(closure);
    this.form.reset({
      starts_on: fromIso(closure.starts_on),
      ends_on: fromIso(closure.ends_on),
      label: closure.label ?? '',
    });
    this.datesError.set(null);
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected submit(): void {
    if (this.saving()) return;

    const { starts_on, ends_on, label } = this.form.getRawValue();
    if (starts_on === null || ends_on === null) {
      this.datesError.set('missing');
      return;
    }
    if (localIso(ends_on) < localIso(starts_on)) {
      this.datesError.set('order');
      return;
    }

    const payload: AcademyClosurePayload = {
      starts_on: localIso(starts_on),
      ends_on: localIso(ends_on),
      label: label.trim() === '' ? null : label.trim(),
    };
    const current = this.editing();
    const op$ =
      current === null
        ? this.closureService.create(payload)
        : this.closureService.update(current.id, payload);

    this.saving.set(true);
    op$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.dialogOpen.set(false);
          this.refreshAcademy();
          this.toast('success', 'academy.timetable.closures.toast.saved');
        },
        error: () => this.toast('error', 'academy.timetable.closures.toast.error'),
      });
  }

  protected confirmRemove(): void {
    const current = this.editing();
    if (current === null) return;

    this.confirmationService.confirm({
      header: this.translate.instant('academy.timetable.closures.confirm.title'),
      message: this.translate.instant('academy.timetable.closures.confirm.remove', {
        range: formatClosureRange(current, localeFor(this.languageService.currentLang())),
      }),
      acceptLabel: this.translate.instant('academy.timetable.closures.confirm.accept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: CONFIRM_ACCEPT_DESTRUCTIVE,
      rejectButtonProps: CONFIRM_REJECT_BUTTON,
      accept: () => this.remove(current.id),
    });
  }

  private remove(id: number): void {
    this.closureService
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.dialogOpen.set(false);
          this.refreshAcademy();
          this.toast('success', 'academy.timetable.closures.toast.removed');
        },
        error: () => this.toast('error', 'academy.timetable.closures.toast.error'),
      });
  }

  /** The list, the calendar and the check-in all read the cached academy. */
  private refreshAcademy(): void {
    this.academyService
      .get({ forceRefresh: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  private toast(severity: 'success' | 'error', key: string): void {
    this.messageService.add({
      severity,
      summary: this.translate.instant(key),
      life: severity === 'error' ? 4000 : 3000,
    });
  }
}

/** `YYYY-MM-DD` as local midnight, for the date pickers. */
function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
