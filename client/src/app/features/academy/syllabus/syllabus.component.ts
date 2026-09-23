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
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
import { finalize } from 'rxjs';
import { AcademyService, TrainingMode } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { SyllabusService, SyllabusTopic } from '../../../core/services/syllabus.service';
import { TrainingModesService } from '../../../core/services/training-modes.service';
import { ChoiceGridComponent } from '../../../shared/components/choice-grid/choice-grid.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  CONFIRM_ACCEPT_DESTRUCTIVE,
  CONFIRM_REJECT_BUTTON,
} from '../../../shared/utils/confirm-buttons';

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
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    ChoiceGridComponent,
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
  /** The academy's modes (#1803): gi and no-gi here, kata and kumite in a karate one. */
  private readonly trainingModes = inject(TrainingModesService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal<boolean>(true);
  protected readonly positions = signal<readonly SyllabusTopic[]>([]);
  protected readonly saving = signal<boolean>(false);
  protected readonly seeding = signal<boolean>(false);

  /**
   * Whether the academy's martial art has a starter programme to copy
   * (#1802). Empty until the art's first programme ships; the seed CTA would
   * otherwise meet a 404.
   */
  protected readonly hasStarter = computed<boolean>(
    () => (this.academyService.academy()?.syllabus_programmes?.length ?? 0) > 0,
  );
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
    kind: this.fb.control<TrainingMode>('both', {
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

  /**
   * The search field (#1629, SYL-1).
   *
   * The shipped programme is 278 techniques and this is the page that
   * maintains it; without a field, finding "kimura" meant opening seven
   * positions one at a time. The lesson sheet has searched this same tree
   * since #1564 — the page that edits it could not.
   */
  protected readonly query = signal<string>('');

  /** Set the query, and forget anything folded shut under the previous one. */
  protected setQuery(next: string): void {
    this.collapsedInSearch.set(new Set());
    this.query.set(next);
  }

  protected readonly searching = computed<boolean>(() => this.query().trim() !== '');

  /**
   * Matching positions, each carrying only its matching techniques.
   *
   * Grouped rather than flattened, which is the whole difference from the
   * lesson sheet's flat result list: the programme holds a Kimura under
   * Closed guard, Half guard and Side control, and a flat list of three
   * identical names answers nothing. A position whose own name matches keeps
   * all of its techniques — you searched for the position.
   */
  protected readonly filteredPositions = computed<readonly SyllabusTopic[]>(() => {
    const needle = this.query().trim().toLocaleLowerCase();
    if (needle === '') return this.positions();

    const hit = (name: string): boolean => name.toLocaleLowerCase().includes(needle);

    return this.positions()
      .map((position) => {
        if (hit(position.name)) return position;
        const children = (position.children ?? []).filter((child) => hit(child.name));
        return children.length > 0 ? { ...position, children } : null;
      })
      .filter((position): position is SyllabusTopic => position !== null);
  });

  /**
   * How many techniques each position really holds, by id.
   *
   * The badge on a position row means "this position holds N techniques", and
   * a search must not quietly change what it means: `filteredPositions` hands
   * the template a position carrying only its matches, so reading the badge
   * off that would make Closed guard say 1 when it holds 6.
   */
  private readonly totalByPosition = computed<ReadonlyMap<number, number>>(
    () => new Map(this.positions().map((p) => [p.id, p.children?.length ?? 0])),
  );

  protected techniqueTotal(position: SyllabusTopic): number {
    return this.totalByPosition().get(position.id) ?? position.children?.length ?? 0;
  }

  /** How many techniques the search turned up, and across how many positions. */
  protected readonly resultSummary = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const positions = this.filteredPositions();
    const techniques = positions.reduce((n, p) => n + (p.children?.length ?? 0), 0);
    // Two counts that vary independently, so each picks its own One/Other —
    // ngx-translate has no plural rule, and a single hardcoded-plural string
    // renders "1 techniques across 1 positions" on the commonest search
    // there is. The same mistake is already documented in `confirmRemove`.
    const t = this.translate.instant(
      techniques === 1
        ? 'academy.syllabus.searchCountTechniqueOne'
        : 'academy.syllabus.searchCountTechniqueOther',
      { count: techniques },
    );
    const p = this.translate.instant(
      positions.length === 1
        ? 'academy.syllabus.searchCountPositionOne'
        : 'academy.syllabus.searchCountPositionOther',
      { count: positions.length },
    );
    return this.translate.instant('academy.syllabus.searchSummary', {
      techniques: t,
      positions: p,
    });
  });

  /**
   * In-season and total, said separately (#1629).
   *
   * One number used to stand for both, and they diverge the moment a position
   * goes out of season — silently, on the page whose ticks are what the
   * coverage report counts.
   */
  protected readonly inSeasonCount = computed<number>(() =>
    this.positions().reduce(
      (total, position) =>
        total + (position.children ?? []).filter((child) => child.in_season).length,
      0,
    ),
  );

  protected readonly countLabel = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const n = this.techniqueCount();
    if (n === 0) return null;
    const inSeason = this.inSeasonCount();
    // Only split the count when the two actually differ — "31 in stagione ·
    // 31 totali" is noise, and the whole point is that a divergence shows.
    return inSeason === n
      ? this.translate.instant(
          n === 1 ? 'academy.syllabus.countOne' : 'academy.syllabus.countOther',
          { count: n },
        )
      : this.translate.instant('academy.syllabus.countSplit', { inSeason, total: n });
  });

  protected readonly kindOptions = this.trainingModes.topicOptions;

  protected setKind(kind: TrainingMode): void {
    this.form.controls.kind.setValue(kind);
    this.form.controls.kind.markAsDirty();
  }

  /** "Heel hooks are no-gi…", "O-soto-gari is tachi-waza…" — the art's own example. */
  protected readonly kindHintKey = this.trainingModes.hintKey;

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

  /**
   * Positions the reader folded shut while a search was running (#1629).
   *
   * A search opens everything it kept, or the matches sit inside collapsed
   * positions and the field looks like it found nothing. But "open" cannot be
   * an override that outranks the toggle: a name like "guard" matches
   * fourteen positions and keeps every technique under each, and the reader
   * has to be able to fold one away. So the search has its own closed-set,
   * and `expanded` — what the reader had open before, and gets back after —
   * is left alone.
   */
  private readonly collapsedInSearch = signal<ReadonlySet<number>>(new Set());

  protected isExpanded(position: SyllabusTopic): boolean {
    return this.searching()
      ? !this.collapsedInSearch().has(position.id)
      : this.expanded().has(position.id);
  }

  protected toggleExpanded(position: SyllabusTopic): void {
    // While searching, the toggle acts on the search's own closed-set —
    // otherwise the press writes to `expanded`, changes nothing on screen,
    // and the reader finds positions opened or closed behind their back once
    // the field is cleared.
    if (this.searching()) {
      const next = new Set(this.collapsedInSearch());
      if (!next.delete(position.id)) next.add(position.id);
      this.collapsedInSearch.set(next);
      return;
    }

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
    return topic.kind === 'both' ? null : this.trainingModes.labels()[topic.kind];
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
    // Open it in the model that survives the search, not the one the search
    // is painting: `isExpanded` is true for every kept position while a query
    // is running, so testing it here meant the id never reached `expanded`
    // and the new technique was gone the moment the field was cleared.
    if (!this.expanded().has(position.id)) {
      this.expanded.update((open) => new Set(open).add(position.id));
    }
    this.collapsedInSearch.update((shut) => {
      const next = new Set(shut);
      next.delete(position.id);
      return next;
    });
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

  protected confirmRemove(): void {
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
      // No `target`: a modal confirm is centred, so there is nothing to anchor
      // to — and anchoring is what put the old popup outside the dialog this
      // button lives in (#1644, same shape as the timetable's TT-5).
      header: this.translate.instant('academy.syllabus.confirm.title'),
      message: this.translate.instant(messageKey, { name: current.name, count: under }),
      acceptLabel: this.translate.instant('academy.syllabus.confirm.accept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: CONFIRM_ACCEPT_DESTRUCTIVE,
      rejectButtonProps: CONFIRM_REJECT_BUTTON,
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
