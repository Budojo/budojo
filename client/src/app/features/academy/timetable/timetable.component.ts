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
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { finalize } from 'rxjs';
import {
  AcademyClass,
  AcademyClassPayload,
  AcademyClassService,
  CLASS_KINDS,
  ClassKind,
} from '../../../core/services/academy-class.service';
import { LanguageService } from '../../../core/services/language.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TrainingDaysPickerComponent } from '../../../shared/components/training-days-picker/training-days-picker.component';
import { localeFor } from '../../../shared/utils/locale';

/** Mon-first display order, Carbon values (0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * Any Sunday — `Intl` needs a real date to name a weekday, and only its
 * day-of-week matters here.
 */
const A_SUNDAY = new Date(2026, 0, 4);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Day {
  readonly weekday: number;
  readonly name: string;
  readonly classes: readonly AcademyClass[];
  readonly isToday: boolean;
}

interface KindOption {
  readonly label: string;
  readonly value: ClassKind;
}

/**
 * The weekly timetable (#1562).
 *
 * Until this, Budojo knew when an academy trains as a weekday bitmap. An
 * academy with kids at 17:00 and adults at 19:00 on the same Monday had one
 * bucket for both, so "who was at the kids' class" could not be asked. This
 * is where the classes get names, days and times; the check-in reads the
 * result and offers the day's classes.
 *
 * Its own page rather than a section of the academy form: it is read as often
 * as it is edited, and a week wants to be seen whole — seven days across on a
 * desk, seven days down on a phone. Every day is drawn, the empty ones too,
 * because a Thursday with nothing on it is information and an invitation
 * (Norman): the "+" on each day opens the form with that day already chosen.
 *
 * Nothing here is mandatory. An academy that never opens this page keeps
 * checking people in by the day, exactly as before.
 */
@Component({
  selector: 'app-timetable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    ConfirmPopupModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectButtonModule,
    SkeletonModule,
    Toast,
    EmptyStateComponent,
    PageHeaderComponent,
    TrainingDaysPickerComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './timetable.component.html',
  styleUrl: './timetable.component.scss',
})
export class TimetableComponent {
  private readonly fb = inject(FormBuilder);
  private readonly classService = inject(AcademyClassService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal<boolean>(true);
  protected readonly classes = signal<readonly AcademyClass[]>([]);
  protected readonly saving = signal<boolean>(false);
  protected readonly dialogOpen = signal<boolean>(false);
  /** The class being edited, or null while adding a new one. */
  protected readonly editing = signal<AcademyClass | null>(null);
  /** The day picked in the form — a signal because the picker takes a list. */
  protected readonly selectedDay = signal<number | null>(null);

  /**
   * The two things a class cannot do without, said next to the field when
   * Save is pressed without them. A disabled Save with no reason is a grey
   * button and a question (Norman: the constraint has to be explained at the
   * control); so Save stays pressable and the press explains itself.
   */
  protected readonly nameError = signal<boolean>(false);
  protected readonly dayError = signal<boolean>(false);

  protected readonly form = this.fb.group({
    name: this.fb.control<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    weekday: this.fb.control<number | null>(null, [Validators.required]),
    // `<input type="time">` hands back `HH:MM` or an empty string; the
    // pattern is belt and braces for a browser that renders it as text.
    starts_at: this.fb.control<string>('', {
      nonNullable: true,
      validators: [Validators.pattern(TIME_PATTERN)],
    }),
    duration_minutes: this.fb.control<number | null>(null, [
      Validators.min(15),
      Validators.max(480),
    ]),
    kind: this.fb.control<ClassKind>('gi', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  /**
   * Seven days, Monday first, each carrying its classes in the server's
   * order — by time, untimed last. Named through `Intl` in the active locale
   * rather than a second set of weekday keys: the abbreviations in
   * `weekdays.*` are for pills, and a day column deserves its full name.
   *
   * `isToday` reads the clock without a signal, so a page left open past
   * midnight keeps yesterday's mark until something else re-renders — the
   * same trade the check-in makes, for the same reason.
   */
  protected readonly week = computed<Day[]>(() => {
    const locale = localeFor(this.languageService.currentLang());
    const nameOf = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    const today = new Date().getDay();

    const byDay = new Map<number, AcademyClass[]>();
    for (const c of this.classes()) {
      byDay.set(c.weekday, [...(byDay.get(c.weekday) ?? []), c]);
    }

    return WEEK_ORDER.map((weekday) => {
      const sample = new Date(A_SUNDAY);
      sample.setDate(A_SUNDAY.getDate() + weekday);
      const raw = nameOf.format(sample);
      return {
        weekday,
        // Italian writes weekdays in lower case; a column header does not.
        name: raw.charAt(0).toLocaleUpperCase(locale) + raw.slice(1),
        classes: byDay.get(weekday) ?? [],
        isToday: weekday === today,
      };
    });
  });

  /** "4 classes a week" in the header, or nothing before there are any. */
  protected readonly countLabel = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const n = this.classes().length;
    if (n === 0) return null;
    return this.translate.instant(
      n === 1 ? 'academy.timetable.countOne' : 'academy.timetable.countOther',
      { count: n },
    );
  });

  /**
   * An explicit map, not `'academy.timetable.kind.' + kind`: the i18n parity
   * check cannot see a key built at runtime, and the day a kind is added this
   * fails to compile until its label exists in both languages.
   */
  private readonly kindKeys: Record<ClassKind, string> = {
    gi: 'academy.timetable.kind.gi',
    nogi: 'academy.timetable.kind.nogi',
    both: 'academy.timetable.kind.both',
    other: 'academy.timetable.kind.other',
  };

  protected readonly kindLabels = computed<Record<ClassKind, string>>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return {
      gi: this.translate.instant(this.kindKeys.gi),
      nogi: this.translate.instant(this.kindKeys.nogi),
      both: this.translate.instant(this.kindKeys.both),
      other: this.translate.instant(this.kindKeys.other),
    };
  });

  protected readonly kindOptions = computed<KindOption[]>(() =>
    CLASS_KINDS.map((value) => ({ value, label: this.kindLabels()[value] })),
  );

  /** The picker takes a list; in single mode it holds at most one day. */
  protected readonly dayValue = computed<number[]>(() => {
    const day = this.selectedDay();
    return day === null ? [] : [day];
  });

  constructor() {
    this.load();

    // Typing a name is the fix for "give it a name" — the message goes as
    // soon as the fix starts, not on the next failed Save.
    this.form.controls.name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nameError.set(false));
  }

  /** Open the form empty — or with the day already chosen, from a day's "+". */
  protected startAdding(weekday: number | null = null): void {
    this.editing.set(null);
    this.form.reset({ name: '', weekday, starts_at: '', duration_minutes: null, kind: 'gi' });
    this.selectedDay.set(weekday);
    this.clearErrors();
    this.dialogOpen.set(true);
  }

  protected startEditing(c: AcademyClass): void {
    this.editing.set(c);
    this.form.reset({
      name: c.name,
      weekday: c.weekday,
      starts_at: c.starts_at ?? '',
      duration_minutes: c.duration_minutes,
      kind: c.kind,
    });
    this.selectedDay.set(c.weekday);
    this.clearErrors();
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected setDay(weekday: number | null): void {
    this.selectedDay.set(weekday);
    this.form.controls.weekday.setValue(weekday);
    this.dayError.set(false);
  }

  protected submit(): void {
    if (this.saving()) return;

    if (this.form.invalid) {
      this.nameError.set(this.form.controls.name.invalid);
      this.dayError.set(this.form.controls.weekday.invalid);
      return;
    }

    const raw = this.form.getRawValue();
    const payload: AcademyClassPayload = {
      name: raw.name.trim(),
      weekday: raw.weekday ?? 0,
      // An empty time input is "no fixed time", which the wire spells null.
      starts_at: raw.starts_at === '' ? null : raw.starts_at,
      duration_minutes: raw.duration_minutes,
      kind: raw.kind,
    };

    const current = this.editing();
    const op$ =
      current === null
        ? this.classService.create(payload)
        : this.classService.update(current.id, payload);

    this.saving.set(true);
    op$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.dialogOpen.set(false);
          this.load();
          this.toast('success', 'academy.timetable.toast.saved');
        },
        error: () =>
          this.toast(
            'error',
            'academy.timetable.toast.errorSummary',
            'academy.timetable.toast.errorDetail',
          ),
      });
  }

  protected confirmRemove(event: Event): void {
    const current = this.editing();
    if (current === null) return;

    // Say what stays: the lessons already held keep their name and their
    // people. Removing a slot from next week is not deleting last week.
    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('academy.timetable.confirm.remove', { name: current.name }),
      acceptLabel: this.translate.instant('academy.timetable.confirm.accept'),
      rejectLabel: this.translate.instant('academy.timetable.confirm.reject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.remove(current.id),
    });
  }

  /**
   * "19:00 – 20:00", "19:00" without a duration, null without a time. The
   * end is arithmetic on the start, so the two can never disagree.
   */
  protected timeRange(c: AcademyClass): string | null {
    if (c.starts_at === null) return null;
    if (c.duration_minutes === null) return c.starts_at;

    const [h, m] = c.starts_at.split(':').map(Number);
    const end = (h * 60 + m + c.duration_minutes) % (24 * 60);
    const hh = String(Math.floor(end / 60)).padStart(2, '0');
    const mm = String(end % 60).padStart(2, '0');
    return `${c.starts_at} – ${hh}:${mm}`;
  }

  private clearErrors(): void {
    this.nameError.set(false);
    this.dayError.set(false);
  }

  private remove(id: number): void {
    this.classService
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.dialogOpen.set(false);
          this.load();
          this.toast('success', 'academy.timetable.toast.removed');
        },
        error: () =>
          this.toast(
            'error',
            'academy.timetable.toast.errorSummary',
            'academy.timetable.toast.errorDetail',
          ),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.classService
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (classes) => this.classes.set(classes),
        // Keep whatever was on screen: an empty week reads as "you have no
        // classes", which is a different and wrong claim.
        error: () =>
          this.toast(
            'error',
            'academy.timetable.toast.errorSummary',
            'academy.timetable.toast.loadErrorDetail',
          ),
      });
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
