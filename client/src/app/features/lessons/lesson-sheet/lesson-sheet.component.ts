import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin, of, switchMap } from 'rxjs';
import {
  Lesson,
  LessonService,
  LessonSuggestion,
  LessonTopic,
} from '../../../core/services/lesson.service';
import { LanguageService } from '../../../core/services/language.service';
import { SyllabusService, SyllabusTopic, TopicKind } from '../../../core/services/syllabus.service';
import { localeFor } from '../../../shared/utils/locale';

/** A topic as the picker shows it, whichever list it came from. */
interface Pickable {
  readonly id: number;
  readonly name: string;
  readonly parentName: string | null;
  readonly kind: TopicKind;
}

/**
 * What a lesson covers (#1564) — the plan before it is held, the record
 * after, and the same list either way.
 *
 * **The picker is where this feature dies if it is wrong.** A flat list of
 * three hundred technique names, on a phone, at the edge of a mat, is not a
 * choice anyone makes (Hick's law). So it is search-first and opens on three
 * short groups: what is already chosen, what this academy taught lately —
 * teaching runs in blocks, so last Monday is very often tonight — and only
 * then the tree, collapsed to its positions.
 *
 * Selecting a position tags the position, not its children: "we worked half
 * guard" is a legitimate and common answer, and the coverage view (#1565)
 * would rather hear it than a guess at four techniques.
 *
 * A topic that has since left the programme shows as a locked chip. It cannot
 * be unticked here and it is never offered again, but it stays on the lesson:
 * tidying the syllabus must not rewrite what March was about.
 */
@Component({
  selector: 'app-lesson-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SkeletonModule,
    TextareaModule,
    TooltipModule,
  ],
  templateUrl: './lesson-sheet.component.html',
  styleUrl: './lesson-sheet.component.scss',
})
export class LessonSheetComponent {
  private readonly lessonService = inject(LessonService);
  private readonly syllabusService = inject(SyllabusService);
  private readonly translate = inject(TranslateService);
  private readonly messageService = inject(MessageService);
  private readonly languageService = inject(LanguageService);

  /** Two-way, so the host can close it and the dialog can close itself. */
  readonly visible = model<boolean>(false);

  readonly academyClassId = input.required<number>();
  /** The day, `YYYY-MM-DD`. A date ahead of today is a plan. */
  readonly heldOn = input.required<string>();
  readonly className = input<string>('');
  /** Already-localised day label for the header — the host knows the locale. */
  readonly dateLabel = input<string>('');

  /** The saved lesson, so the host can refresh its summary without re-reading. */
  readonly saved = output<Lesson>();

  protected readonly loading = signal<boolean>(true);
  /** The open failed: there is nothing to edit, and nothing to save. */
  protected readonly loadFailed = signal<boolean>(false);
  protected readonly saving = signal<boolean>(false);
  protected readonly lesson = signal<Lesson | null>(null);
  protected readonly positions = signal<readonly SyllabusTopic[]>([]);
  protected readonly recent = signal<readonly LessonTopic[]>([]);
  protected readonly suggestions = signal<readonly LessonSuggestion[]>([]);
  /**
   * Waved away for this opening only. Not persisted: "not tonight" is not
   * "never", and a dismissal that outlives the evening would quietly shrink
   * the programme without anyone deciding to.
   */
  protected readonly dismissed = signal<ReadonlySet<number>>(new Set());
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  protected readonly notes = signal<string>('');
  protected readonly query = signal<string>('');
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  /** What was on the lesson when it opened — so Save can send only changes. */
  private openedWith: { topicIds: readonly number[]; notes: string } = { topicIds: [], notes: '' };

  constructor() {
    // Opening is the load: the slot can change between two openings (another
    // class, another day), and nothing here is worth keeping across them.
    effect(() => {
      if (this.visible()) this.load();
    });
  }

  /** Every topic in the programme, flattened once for search and lookup. */
  private readonly allTopics = computed<readonly Pickable[]>(() =>
    this.positions().flatMap((position) => [
      { id: position.id, name: position.name, parentName: null, kind: position.kind },
      ...(position.children ?? []).map((child) => ({
        id: child.id,
        name: child.name,
        parentName: position.name,
        kind: child.kind,
      })),
    ]),
  );

  private readonly byId = computed<ReadonlyMap<number, Pickable>>(
    () => new Map(this.allTopics().map((t) => [t.id, t])),
  );

  /**
   * The chosen topics, resolved for display. Anything the programme no longer
   * holds falls through to `departed` instead.
   */
  protected readonly chosen = computed<readonly Pickable[]>(() => {
    const map = this.byId();
    return [...this.selected()]
      .map((id) => map.get(id))
      .filter((t): t is Pickable => t !== undefined);
  });

  /**
   * Topics this lesson names that have since left the programme. Shown, and
   * locked: they stay attached, and the server keeps them through any edit.
   */
  protected readonly departed = computed<readonly LessonTopic[]>(
    () => this.lesson()?.topics.filter((t) => t.deleted) ?? [],
  );

  protected readonly searching = computed<boolean>(() => this.query().trim().length > 0);

  /**
   * Search runs across both levels at once — "guard" should find the position
   * and every technique under it, and "armbar" should find it wherever it
   * lives, which is the case the two-level tree exists to create.
   */
  protected readonly results = computed<readonly Pickable[]>(() => {
    const needle = this.query().trim().toLocaleLowerCase();
    if (needle === '') return [];
    return this.allTopics().filter(
      (t) =>
        t.name.toLocaleLowerCase().includes(needle) ||
        (t.parentName?.toLocaleLowerCase().includes(needle) ?? false),
    );
  });

  /** The recent group, minus anything already chosen — that is its own group. */
  protected readonly recentOffered = computed<readonly LessonTopic[]>(() => {
    const picked = this.selected();
    return this.recent().filter((t) => !picked.has(t.id));
  });

  /**
   * The suggestions still worth showing: not already chosen, not waved away.
   *
   * Never pre-selected, by design — a suggestion that fills the field is a
   * suggestion that becomes wrong data the evening the instructor teaches
   * something else.
   */
  protected readonly suggestionsOffered = computed<readonly LessonSuggestion[]>(() => {
    const picked = this.selected();
    const waved = this.dismissed();
    return this.suggestions().filter((s) => !picked.has(s.id) && !waved.has(s.id));
  });

  protected readonly heldLabel = computed<string | null>(() => {
    const lesson = this.lesson();
    if (lesson === null) return null;
    return lesson.held ? 'lessons.sheet.held' : 'lessons.sheet.planned';
  });

  protected isChosen(id: number): boolean {
    return this.selected().has(id);
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

  protected toggle(id: number): void {
    const next = new Set(this.selected());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selected.set(next);
  }

  /** Wave one away without touching the lesson. Always available. */
  protected dismissSuggestion(id: number): void {
    const next = new Set(this.dismissed());
    next.add(id);
    this.dismissed.set(next);
  }

  /**
   * "Not taught yet this season" / "last taught 12 Mar" — the reason in plain
   * words, beside the suggestion it explains.
   */
  protected reasonKey(reason: LessonSuggestion['reason']): string {
    return `lessons.sheet.suggestions.reason.${reason}`;
  }

  /** "12 Mar" — the day a topic was last on the mat, in the reader's locale. */
  protected shortDate(iso: string): string {
    if (iso === '') return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
  }

  protected clearQuery(): void {
    this.query.set('');
  }

  protected close(): void {
    this.visible.set(false);
  }

  protected save(): void {
    if (this.saving()) return;

    const classId = this.academyClassId();
    const heldOn = this.heldOn();
    const topicIds = [...this.selected()];
    const notes = this.notes().trim();

    const topicsChanged = !sameIds(topicIds, this.openedWith.topicIds);
    const notesChanged = notes !== this.openedWith.notes;

    if (!topicsChanged && !notesChanged) {
      this.close();
      return;
    }

    this.saving.set(true);
    // Chained, not concurrent. Both writes return the whole lesson, so the
    // last response is the one worth emitting — and that is only true if the
    // second actually ran after the first. Two PUTs racing on the same slot
    // would let the notes reply carry a pre-sync topic list straight into the
    // check-in's summary row.
    const topics$ = topicsChanged
      ? this.lessonService.setTopics(classId, heldOn, topicIds)
      : of(null as Lesson | null);

    topics$
      .pipe(
        switchMap((afterTopics) =>
          notesChanged
            ? this.lessonService.setNotes(classId, heldOn, notes === '' ? null : notes)
            : of(afterTopics),
        ),
      )
      .subscribe({
        next: (latest) => {
          this.saving.set(false);
          if (latest !== null) this.saved.emit(latest);
          this.toast('success', 'lessons.sheet.toast.saved');
          this.close();
        },
        error: () => {
          this.saving.set(false);
          this.toast(
            'error',
            'lessons.sheet.toast.errorSummary',
            'lessons.sheet.toast.errorDetail',
          );
        },
      });
  }

  private load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.query.set('');
    this.expanded.set(new Set());
    this.dismissed.set(new Set());

    forkJoin({
      lesson: this.lessonService.get(this.academyClassId(), this.heldOn()),
      positions: this.syllabusService.list(),
      recent: this.lessonService.recentTopics(),
      suggestions: this.lessonService.suggestions(this.academyClassId()),
    }).subscribe({
      next: ({ lesson, positions, recent, suggestions }) => {
        this.lesson.set(lesson);
        this.positions.set(positions);
        this.recent.set(recent);
        this.suggestions.set(suggestions);

        // Departed topics are not in the selectable set: they cannot be
        // unticked here, and the server carries them through the sync.
        const living = (lesson?.topics ?? []).filter((t) => !t.deleted).map((t) => t.id);
        this.selected.set(new Set(living));
        this.notes.set(lesson?.notes ?? '');
        this.openedWith = { topicIds: living, notes: lesson?.notes ?? '' };
        this.loading.set(false);
      },
      error: () => {
        // Everything the previous opening left behind, cleared. The component
        // instance outlives a slot change — switching class chips on the
        // check-in reuses it — so keeping the last lesson's ticks here would
        // render them under the new header and, worse, write them into the
        // new slot on Save.
        this.lesson.set(null);
        this.positions.set([]);
        this.recent.set([]);
        this.suggestions.set([]);
        this.selected.set(new Set());
        this.notes.set('');
        this.openedWith = { topicIds: [], notes: '' };
        this.loadFailed.set(true);
        this.loading.set(false);
        this.toast(
          'error',
          'lessons.sheet.toast.errorSummary',
          'lessons.sheet.toast.loadErrorDetail',
        );
      },
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

/** Set equality by value — order is not part of what a topic list means. */
function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}
