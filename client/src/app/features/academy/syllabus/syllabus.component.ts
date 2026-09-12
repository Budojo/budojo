import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
import { finalize } from 'rxjs';
import { AcademyService } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import {
  SyllabusService,
  SyllabusTopic,
  TOPIC_KINDS,
  TopicKind,
} from '../../../core/services/syllabus.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

interface KindOption {
  readonly label: string;
  readonly value: TopicKind;
}

/**
 * The academy's programme (#1563).
 *
 * Coverage needs a denominator: "twelve armbars" is neither a lot nor a
 * little, "twelve of the forty things I said I'd teach this year" is a number
 * an instructor acts on. This is where that list is kept — positions, and the
 * techniques under them.
 *
 * Collapsed to positions by default, because sixty headings are a programme
 * you can read and three hundred techniques are a wall. Each position carries
 * the two things worth seeing without opening it: how many techniques it
 * holds, and whether it is in season. Unticking a position takes its
 * techniques with it — narrowing the seed in one tap is the difference
 * between an owner who edits it and one who abandons it.
 *
 * Editing goes through one dialog rather than in-place, against this page's
 * own first sketch: on a phone the keyboard covers the row being renamed, and
 * the kind belongs next to the name while it is being decided. It is also the
 * dialog the timetable already taught (Jakob).
 */
@Component({
  selector: 'app-syllabus',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CheckboxModule,
    ConfirmPopupModule,
    DialogModule,
    InputTextModule,
    SelectButtonModule,
    SkeletonModule,
    Toast,
    Tooltip,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './syllabus.component.html',
  styleUrl: './syllabus.component.scss',
})
export class SyllabusComponent {
  private readonly fb = inject(FormBuilder);
  private readonly syllabus = inject(SyllabusService);
  private readonly academyService = inject(AcademyService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal<boolean>(true);
  protected readonly positions = signal<readonly SyllabusTopic[]>([]);
  protected readonly saving = signal<boolean>(false);
  protected readonly seeding = signal<boolean>(false);
  protected readonly dialogOpen = signal<boolean>(false);

  /** The topic being edited, or null while adding a new one. */
  protected readonly editing = signal<SyllabusTopic | null>(null);
  /** The position a new technique goes under, or null for a new position. */
  protected readonly addingUnder = signal<SyllabusTopic | null>(null);
  /** Which positions are open. Ids, so a reload does not close them. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly nameError = signal<boolean>(false);

  protected readonly form = this.fb.group({
    name: this.fb.control<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    kind: this.fb.control<TopicKind>('both', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  /**
   * The techniques, counted across the programme. Techniques and not
   * positions: a position with nothing under it is a heading, not something
   * to teach — and it is the number the academy page shows too.
   */
  protected readonly techniqueCount = computed<number>(() =>
    this.positions().reduce((total, position) => total + (position.children?.length ?? 0), 0),
  );

  protected readonly countLabel = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const n = this.techniqueCount();
    if (n === 0) return null;
    return this.translate.instant(
      n === 1 ? 'academy.syllabus.countOne' : 'academy.syllabus.countOther',
      { count: n },
    );
  });

  /**
   * An explicit map, not `'academy.syllabus.kind.' + kind`: the i18n parity
   * check cannot see a key built at runtime, and the day a kind is added this
   * fails to compile until its label exists in both languages.
   */
  private readonly kindKeys: Record<TopicKind, string> = {
    both: 'academy.syllabus.kind.both',
    gi: 'academy.syllabus.kind.gi',
    nogi: 'academy.syllabus.kind.nogi',
  };

  protected readonly kindLabels = computed<Record<TopicKind, string>>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return {
      both: this.translate.instant(this.kindKeys.both),
      gi: this.translate.instant(this.kindKeys.gi),
      nogi: this.translate.instant(this.kindKeys.nogi),
    };
  });

  protected readonly kindOptions = computed<KindOption[]>(() =>
    TOPIC_KINDS.map((value) => ({ value, label: this.kindLabels()[value] })),
  );

  /**
   * Four headers for one dialog, because "New technique in Closed guard" is
   * the sentence that says where the thing being typed will land — the one
   * question a bare "New topic" would leave open.
   */
  protected readonly dialogTitle = computed<string>(() => {
    const editing = this.editing();
    if (editing !== null) {
      return editing.parent_id === null
        ? 'academy.syllabus.dialog.editPosition'
        : 'academy.syllabus.dialog.editTechnique';
    }
    return this.addingUnder() === null
      ? 'academy.syllabus.dialog.addPosition'
      : 'academy.syllabus.dialog.addTechnique';
  });

  /**
   * "Closed guard" under a position field, "Armbar" under a technique's —
   * the shipped placeholder was the position's own name, which read like a
   * value already typed when the dialog was opened from inside that position.
   */
  protected readonly namePlaceholder = computed<string>(() => {
    const editing = this.editing();
    const isPosition = editing !== null ? editing.parent_id === null : this.addingUnder() === null;
    return isPosition
      ? 'academy.syllabus.form.namePlaceholderPosition'
      : 'academy.syllabus.form.namePlaceholderTechnique';
  });

  constructor() {
    this.load();

    // Typing a name is the fix for "give it a name" — the message goes as
    // soon as the fix starts, not on the next failed Save.
    this.form.controls.name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nameError.set(false));
  }

  protected isExpanded(position: SyllabusTopic): boolean {
    return this.expanded().has(position.id);
  }

  protected toggleExpanded(position: SyllabusTopic): void {
    const next = new Set(this.expanded());
    if (next.has(position.id)) {
      next.delete(position.id);
    } else {
      next.add(position.id);
    }
    this.expanded.set(next);
  }

  /** The kind, said only when it narrows something — "both" is the default. */
  protected kindChip(topic: SyllabusTopic): string | null {
    return topic.kind === 'both' ? null : this.kindLabels()[topic.kind];
  }

  protected startAddingPosition(): void {
    this.editing.set(null);
    this.addingUnder.set(null);
    this.form.reset({ name: '', kind: 'both' });
    this.nameError.set(false);
    this.dialogOpen.set(true);
  }

  protected startAddingTechnique(position: SyllabusTopic): void {
    this.editing.set(null);
    this.addingUnder.set(position);
    // A technique starts as its position is trained — a submission under
    // "Lapel guards" is a gi technique until someone says otherwise.
    this.form.reset({ name: '', kind: position.kind });
    this.nameError.set(false);
    this.dialogOpen.set(true);
    // Adding into a closed position would hide the result.
    if (!this.isExpanded(position)) this.toggleExpanded(position);
  }

  protected startEditing(topic: SyllabusTopic): void {
    this.editing.set(topic);
    this.addingUnder.set(null);
    this.form.reset({ name: topic.name, kind: topic.kind });
    this.nameError.set(false);
    this.dialogOpen.set(true);
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.nameError.set(this.form.controls.name.invalid);
      return;
    }

    const raw = this.form.getRawValue();
    const name = raw.name.trim();
    const current = this.editing();

    const op$ =
      current === null
        ? this.syllabus.create({
            name,
            kind: raw.kind,
            parent_id: this.addingUnder()?.id ?? null,
          })
        : this.syllabus.update(current.id, { name, kind: raw.kind });

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
          this.refreshAcademy();
          this.toast('success', 'academy.syllabus.toast.saved');
        },
        // A name already taken among its siblings is the one failure the
        // owner can act on, and it is the likeliest one on a list this long.
        error: (err: { status?: number }) =>
          err.status === 422
            ? this.nameError.set(true)
            : this.toast(
                'error',
                'academy.syllabus.toast.errorSummary',
                'academy.syllabus.toast.errorDetail',
              ),
      });
  }

  protected confirmRemove(event: Event): void {
    const current = this.editing();
    if (current === null) return;

    const isPosition = current.parent_id === null;
    const under = isPosition
      ? (this.positions().find((p) => p.id === current.id)?.children?.length ?? 0)
      : 0;

    // Three keys, because ngx-translate has no plural rule and "and the 1
    // techniques under it" is how that shows up the first time somebody
    // deletes a position holding exactly one.
    const messageKey =
      under === 0
        ? 'academy.syllabus.confirm.remove'
        : under === 1
          ? 'academy.syllabus.confirm.removePositionOne'
          : 'academy.syllabus.confirm.removePositionOther';

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant(messageKey, { name: current.name, count: under }),
      acceptLabel: this.translate.instant('academy.syllabus.confirm.accept'),
      rejectLabel: this.translate.instant('academy.syllabus.confirm.reject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.remove(current.id),
    });
  }

  /**
   * In or out of season, ticked where it is read. On a position the server
   * cascades to its techniques, so the same rule is applied here rather than
   * re-reading the whole tree for one tick — a failure resyncs from the
   * server, which is the only state worth a round-trip.
   */
  protected setSeason(topic: SyllabusTopic, inSeason: boolean): void {
    this.applySeason(topic, inSeason);

    this.syllabus
      .update(topic.id, { in_season: inSeason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.load();
          this.toast(
            'error',
            'academy.syllabus.toast.errorSummary',
            'academy.syllabus.toast.errorDetail',
          );
        },
      });
  }

  protected seedFromStarter(): void {
    if (this.seeding()) return;

    this.seeding.set(true);
    this.syllabus
      .seed()
      .pipe(
        finalize(() => this.seeding.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.load();
          this.refreshAcademy();
          this.toast('success', 'academy.syllabus.toast.seeded');
        },
        error: () =>
          this.toast(
            'error',
            'academy.syllabus.toast.errorSummary',
            'academy.syllabus.toast.errorDetail',
          ),
      });
  }

  private applySeason(topic: SyllabusTopic, inSeason: boolean): void {
    this.positions.set(
      this.positions().map((position) => {
        if (position.id === topic.id) {
          return {
            ...position,
            in_season: inSeason,
            children: (position.children ?? []).map((child) => ({ ...child, in_season: inSeason })),
          };
        }

        if (position.children?.some((child) => child.id === topic.id)) {
          return {
            ...position,
            children: position.children.map((child) =>
              child.id === topic.id ? { ...child, in_season: inSeason } : child,
            ),
          };
        }

        return position;
      }),
    );
  }

  private remove(id: number): void {
    this.syllabus
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.dialogOpen.set(false);
          this.load();
          this.refreshAcademy();
          this.toast('success', 'academy.syllabus.toast.removed');
        },
        error: () =>
          this.toast(
            'error',
            'academy.syllabus.toast.errorSummary',
            'academy.syllabus.toast.errorDetail',
          ),
      });
  }

  /**
   * The programme changed, so the academy did too: `syllabus_topics_count` is
   * what the academy page reads, and it comes off the cached academy signal.
   */
  private refreshAcademy(): void {
    this.academyService
      .get({ forceRefresh: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  private load(): void {
    this.loading.set(true);
    this.syllabus
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (positions) => this.positions.set(positions),
        // Keep whatever was on screen: an empty tree reads as "you have no
        // programme", which is a different and wrong claim.
        error: () =>
          this.toast(
            'error',
            'academy.syllabus.toast.errorSummary',
            'academy.syllabus.toast.loadErrorDetail',
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
