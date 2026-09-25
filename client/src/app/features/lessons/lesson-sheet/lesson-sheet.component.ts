import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  runInInjectionContext,
  signal,
  untracked,
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
import { addDays, localIso } from '../../../shared/utils/class-occurrences';
import { localeFor } from '../../../shared/utils/locale';
import { prefersReducedMotion } from '../../../shared/utils/prefers-reduced-motion';

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
  private readonly injector = inject(Injector);

  /** Two-way, so the host can close it and the dialog can close itself. */
  readonly visible = model<boolean>(false);

  readonly academyClassId = input.required<number>();
  /** The day, `YYYY-MM-DD`. A date ahead of today is a plan. */
  readonly heldOn = input.required<string>();
  readonly className = input<string>('');
  /** Already-localised day label for the header — the host knows the locale. */
  readonly dateLabel = input<string>('');
  /**
   * Planning hosts (#1859): the header steps one occurrence of the class at a
   * time — a week — so the owner can plan the Monday after next without
   * leaving the sheet. Never before today: the past is the check-in's.
   */
  readonly steppable = input<boolean>(false);
  /**
   * A topic to open the programme on (#1859): its position is expanded and
   * brought into view, so planning "half guard" from the season map lands
   * on half guard instead of the top of sixty positions.
   */
  readonly focusTopicId = input<number | null>(null);
  /**
   * A topic the host is planning (#1656): ticked on every lesson the sheet
   * opens or steps to, and not counted as an edit — the owner asked for it by
   * opening the sheet. Save sends it; unticking it is an ordinary choice.
   */
  readonly chooseTopicId = input<number | null>(null);

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

  /**
   * The day this sheet reads and writes. The host's `heldOn` on every
   * opening; the stepper moves it a week at a time from there (#1859).
   */
  protected readonly slot = signal<string>('');

  /** What was on the lesson when it opened — so Save can send only changes. */
  private readonly openedWith = signal<{ topicIds: readonly number[]; notes: string }>({
    topicIds: [],
    notes: '',
  });
  /** The same, plus the host's topic: the selection the sheet was handed. */
  private readonly arrivedWith = signal<readonly number[]>([]);

  constructor() {
    // Opening is the load: the slot can change between two openings (another
    // class, another day), and nothing here is worth keeping across them —
    // a week stepped to last time included, so the sheet opens where the
    // host said.
    effect(() => {
      if (!this.visible()) return;
      const heldOn = this.heldOn();
      this.academyClassId();
      untracked(() => {
        this.slot.set(heldOn);
        this.load();
      });
    });
  }

  /** Something picked or typed that Save would send. */
  protected readonly dirty = computed<boolean>(() => {
    const opened = this.openedWith();
    return !sameIds([...this.selected()], opened.topicIds) || this.notes().trim() !== opened.notes;
  });

  /**
   * Something the owner picked or typed that moving would throw away. The
   * host's own topic is not that: it comes along to the next week.
   */
  protected readonly stepHeld = computed<boolean>(() => {
    if (!this.dirty()) return false;
    const asHanded =
      sameIds([...this.selected()], this.arrivedWith()) &&
      this.notes().trim() === this.openedWith().notes;
    return !asHanded;
  });

  /**
   * What a lesson still ahead will cover is planned, not covered — tonight's
   * included, until somebody is checked in and the header stops saying
   * "planned" too. The evenings gone by keep "covered".
   */
  protected readonly chosenTitle = computed<string>(() => {
    const slot = this.slot();
    const today = localIso(new Date());
    const ahead = slot > today || (slot === today && !this.lesson()?.held);
    return ahead ? 'lessons.sheet.chosenPlanned' : 'lessons.sheet.chosen';
  });

  /**
   * "Tonight" only for tonight's lesson. Anything else — a plan three weeks
   * out, an evening being backfilled — is "this lesson".
   */
  protected readonly suggestionWords = computed<{ title: string; dismiss: string }>(() =>
    this.slot() === localIso(new Date())
      ? { title: 'lessons.sheet.suggestions.title', dismiss: 'lessons.sheet.suggestions.dismiss' }
      : {
          title: 'lessons.sheet.suggestions.titleLesson',
          dismiss: 'lessons.sheet.suggestions.dismissLesson',
        },
  );

  /**
   * The previous occurrence is still today or later. The stepper is for
   * planning; recording a past evening is the check-in's job.
   */
  protected readonly canStepBack = computed<boolean>(() => {
    const slot = this.slot();
    return slot !== '' && addDays(slot, -7) >= localIso(new Date());
  });

  /** The header's day: the host's words, or the stepped day's own once it can move. */
  protected readonly headerDate = computed<string>(() => {
    if (!this.steppable()) return this.dateLabel();
    const iso = this.slot();
    if (iso === '') return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(y, m - 1, d));
  });

  /**
   * One occurrence of the class forward or back — a week, since a timetable
   * class runs once a week. Held while something is unsaved: moving would
   * throw it away, and a plan silently lost is worse than a disabled arrow.
   */
  protected step(direction: 1 | -1): void {
    if (this.loading() || this.saving() || this.stepHeld()) return;
    if (direction === -1 && !this.canStepBack()) return;

    this.slot.set(addDays(this.slot(), 7 * direction));
    this.load();
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
  /**
   * Those reads still in flight. They belong to one opening of the sheet and
   * are cancelled with it, as the room's read is: an answer for last
   * Monday's slot must not land in tonight's.
   */
  private lastNotesReads = new Subscription();

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
    this.lastNotesReads.add(
      this.lessonService
        .lastNotes(id, this.slot())
        .pipe(catchError(() => of(null)))
        .subscribe((lesson) => this.setLastEvening(id, { state: 'done', lesson })),
    );
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
    const heldOn = this.slot();
    const topicIds = [...this.selected()];
    const notes = this.notes().trim();

    const opened = this.openedWith();
    const topicsChanged = !sameIds(topicIds, opened.topicIds);
    const notesChanged = notes !== opened.notes;

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
    this.clearDetails();

    forkJoin({
      lesson: this.lessonService.get(this.academyClassId(), this.slot()),
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
        const handed = [...new Set([...living, ...this.hostTopic()])];
        this.selected.set(new Set(handed));
        this.notes.set(lesson?.notes ?? '');
        this.openedWith.set({ topicIds: living, notes: lesson?.notes ?? '' });
        this.arrivedWith.set(handed);
        this.loading.set(false);
        this.revealFocus(positions);
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
        this.openedWith.set({ topicIds: [], notes: '' });
        this.arrivedWith.set([]);
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

  /** The host's topic, when it is still in the programme; nothing otherwise. */
  private hostTopic(): number[] {
    const id = this.chooseTopicId();
    return id !== null && this.allTopics().some((t) => t.id === id) ? [id] : [];
  }

  /**
   * Open the programme on the host's topic: its position expanded — the
   * position itself, or the one a technique sits under — and scrolled into
   * the middle of the sheet once it is drawn.
   */
  private revealFocus(positions: readonly SyllabusTopic[]): void {
    const focus = this.focusTopicId();
    if (focus === null) return;

    const position = positions.find(
      (p) => p.id === focus || (p.children ?? []).some((c) => c.id === focus),
    );
    if (position === undefined) return;

    this.expanded.set(new Set([position.id]));
    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        document.querySelector(`[data-cy="lesson-expand-${position.id}"]`)?.scrollIntoView({
          block: 'center',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }),
    );
  }

  /**
   * Tonight's room (#1860), read after the sheet is already usable: it is a
   * panel on top of the picker, never a reason to hold the picker back, and a
   * failure leaves it out rather than failing the sheet.
   */
  private loadRoom(): void {
    this.roomRead = this.lessonService
      .roomGaps(this.academyClassId(), this.slot())
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

  /** Same rule for the technique details (#1862): the last opening's reads go with it. */
  private clearDetails(): void {
    this.lastNotesReads.unsubscribe();
    this.lastNotesReads = new Subscription();
    this.detailOpen.set(null);
    this.lastEvenings.set(new Map());
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
