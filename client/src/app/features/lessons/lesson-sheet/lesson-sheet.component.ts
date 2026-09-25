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
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription, catchError, forkJoin, of, switchMap } from 'rxjs';
import {
  Lesson,
  LessonService,
  LessonSuggestion,
  LessonTopic,
  RoomGap,
  SuggestionReason,
} from '../../../core/services/lesson.service';
import { LanguageService } from '../../../core/services/language.service';
import { SyllabusService, SyllabusTopic } from '../../../core/services/syllabus.service';
import type { TrainingMode } from '../../../core/services/academy.service';
import { AthleteIdentityComponent } from '../../../shared/components/athlete-identity/athlete-identity.component';
import { localeFor } from '../../../shared/utils/locale';

/** A topic as the picker shows it, whichever list it came from. */
interface Pickable {
  readonly id: number;
  readonly name: string;
  readonly parentName: string | null;
  readonly kind: TrainingMode;
  /** How it is taught here, and the video it came from (#1862). */
  readonly notes: string | null;
  readonly videoUrl: string | null;
}

/** The groups a topic row can sit in — one row's details open at a time. */
type DetailGroup = 'results' | 'suggestions' | 'recent' | 'tree';

/** The last evening that taught a topic and left notes (#1862), fetched when asked. */
type LastEvening =
  { readonly state: 'loading' } | { readonly state: 'done'; readonly lesson: Lesson | null };

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
    NgTemplateOutlet,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SkeletonModule,
    TextareaModule,
    TooltipModule,
    AthleteIdentityComponent,
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
  /**
   * What most of tonight's room missed (#1860), and how many are in it. Read
   * after the lesson, and only for one with people in it: a plan has no room.
   */
  protected readonly roomGaps = signal<readonly RoomGap[]>([]);
  protected readonly roomPresent = signal<number>(0);
  /** The room rows whose names are open. Folded by default: a count, not a list of people. */
  protected readonly roomNamesOpen = signal<ReadonlySet<number>>(new Set());
  private roomRead: Subscription | null = null;
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
      pickable(position, null),
      ...(position.children ?? []).map((child) => pickable(child, position.name)),
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
    // Offered once: a technique the room group already names comes with the
    // reason about tonight's people, which is the sharper of the two.
    const room = new Set(this.roomGapsOffered().map((g) => g.id));
    return this.suggestions().filter(
      (s) => !picked.has(s.id) && !waved.has(s.id) && !room.has(s.id),
    );
  });

  /** The room rows not already chosen — a tick moves one into "Fatto", like a suggestion. */
  protected readonly roomGapsOffered = computed<readonly RoomGap[]>(() => {
    const picked = this.selected();
    return this.roomGaps().filter((g) => !picked.has(g.id));
  });

  protected readonly heldLabel = computed<string | null>(() => {
    const lesson = this.lesson();
    if (lesson === null) return null;
    return lesson.held ? 'lessons.sheet.held' : 'lessons.sheet.planned';
  });

  protected isChosen(id: number): boolean {
    return this.selected().has(id);
  }

  // ── How it is taught here (#1862) ───────────────────────────────────────

  /**
   * The one row whose details are open, or null — one at a time, it is a
   * list. Keyed by the group as well as the topic: the same technique can be
   * a suggestion, a recent one and a row in the tree at once, and opening it
   * in one place must not open it in all three.
   */
  protected readonly detailOpen = signal<string | null>(null);

  protected detailKey(where: DetailGroup, id: number): string {
    return `${where}-${id}`;
  }

  protected isDetailOpen(where: DetailGroup, id: number): boolean {
    return this.detailOpen() === this.detailKey(where, id);
  }

  /**
   * The last evening each opened topic was taught with notes, fetched the
   * first time its details are opened — never for every row in the list.
   */
  private readonly lastEvenings = signal<ReadonlyMap<number, LastEvening>>(new Map());

  /** What the programme says about a topic: its notes and its video. */
  protected detailOf(id: number): Pickable | undefined {
    return this.byId().get(id);
  }

  /** Whether the programme has anything written for it — the info button says so. */
  protected hasWritten(id: number): boolean {
    const topic = this.byId().get(id);
    return (topic?.notes ?? null) !== null || (topic?.videoUrl ?? null) !== null;
  }

  protected lastEveningLoading(id: number): boolean {
    return this.lastEvenings().get(id)?.state === 'loading';
  }

  /** The last evening's lesson once fetched; null when there is none (or it failed). */
  protected lastEveningOf(id: number): Lesson | null {
    const entry = this.lastEvenings().get(id);
    return entry?.state === 'done' ? entry.lesson : null;
  }

  /** Nothing written in the programme and no evening with notes: say so, once fetched. */
  protected detailEmpty(id: number): boolean {
    const entry = this.lastEvenings().get(id);
    return !this.hasWritten(id) && entry?.state === 'done' && entry.lesson === null;
  }

  protected toggleDetail(where: DetailGroup, id: number): void {
    const key = this.detailKey(where, id);
    if (this.detailOpen() === key) {
      this.detailOpen.set(null);
      return;
    }
    this.detailOpen.set(key);
    if (this.lastEvenings().has(id)) return;

    this.setLastEvening(id, { state: 'loading' });
    // A side panel failing must not cost the sheet anything: no notes found
    // and no notes fetched read the same, and the rest of the detail stands.
    // Only evenings before this sheet's day: tonight's plan, once somebody is
    // checked in, is held — and still this evening, not the last one.
    this.lessonService
      .lastNotes(id, this.heldOn())
      .pipe(catchError(() => of(null)))
      .subscribe((lesson) => this.setLastEvening(id, { state: 'done', lesson }));
  }

  private setLastEvening(id: number, value: LastEvening): void {
    this.lastEvenings.update((all) => new Map(all).set(id, value));
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

  protected isRoomNamesOpen(id: number): boolean {
    return this.roomNamesOpen().has(id);
  }

  protected toggleRoomNames(id: number): void {
    const next = new Set(this.roomNamesOpen());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.roomNamesOpen.set(next);
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
   *
   * An explicit map, not a template string. The i18n canon forbids building a
   * key by concatenation: the parity spec cannot see such a key, so a reason
   * nobody translated would ship green and render its own key on the mat.
   * Here an unmapped value is a compile error instead.
   */
  private static readonly REASON_KEYS: Readonly<Record<SuggestionReason, string>> = {
    never: 'lessons.sheet.suggestions.reason.never',
    thin: 'lessons.sheet.suggestions.reason.thin',
    stale: 'lessons.sheet.suggestions.reason.stale',
  };

  protected reasonKey(reason: SuggestionReason): string {
    return LessonSheetComponent.REASON_KEYS[reason];
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
    this.clearRoom();
    this.detailOpen.set(null);
    this.lastEvenings.set(new Map());

    forkJoin({
      lesson: this.lessonService.get(this.academyClassId(), this.heldOn()),
      positions: this.syllabusService.list(),
      recent: this.lessonService.recentTopics(),
      // Caught here and not in the shared error branch: suggestions are the
      // one piece of this dialog nobody needs. Letting them fail the forkJoin
      // would stop an instructor editing tonight's topics because a panel they
      // can dismiss anyway did not load.
      suggestions: this.lessonService
        .suggestions(this.academyClassId())
        .pipe(catchError(() => of<LessonSuggestion[]>([]))),
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
        if (lesson?.held) this.loadRoom();
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

  /**
   * Tonight's room (#1860), read after the sheet is already usable: it is a
   * panel on top of the picker, never a reason to hold the picker back, and a
   * failure leaves it out rather than failing the sheet.
   */
  private loadRoom(): void {
    this.roomRead = this.lessonService
      .roomGaps(this.academyClassId(), this.heldOn())
      .pipe(catchError(() => of(null)))
      .subscribe((room) => {
        this.roomGaps.set(room?.rows ?? []);
        this.roomPresent.set(room?.present ?? 0);
      });
  }

  /**
   * The instance outlives a slot change, so a read still in flight for the
   * last slot is cancelled rather than allowed to paint its room over this
   * one.
   */
  private clearRoom(): void {
    this.roomRead?.unsubscribe();
    this.roomRead = null;
    this.roomGaps.set([]);
    this.roomPresent.set(0);
    this.roomNamesOpen.set(new Set());
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

function pickable(topic: SyllabusTopic, parentName: string | null): Pickable {
  return {
    id: topic.id,
    name: topic.name,
    parentName,
    kind: topic.kind,
    notes: topic.notes,
    videoUrl: topic.video_url,
  };
}

/** Set equality by value — order is not part of what a topic list means. */
function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}
