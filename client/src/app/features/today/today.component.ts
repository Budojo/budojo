import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyClass, AcademyClassService } from '../../core/services/academy-class.service';
import { AcademyService } from '../../core/services/academy.service';
import { Athlete, AthleteListResponse, AthleteService } from '../../core/services/athlete.service';
import { BackupFolderService } from '../../core/services/backup-folder.service';
import { DocumentService, ExpiringDocumentsResponse } from '../../core/services/document.service';
import { DriveSyncService } from '../../core/services/drive-sync.service';
import { LanguageService } from '../../core/services/language.service';
import {
  Lesson,
  LessonService,
  LessonSuggestion,
  SuggestionReason,
} from '../../core/services/lesson.service';
import {
  DailyAttendancePoint,
  StatsService,
  SyllabusCoverage,
} from '../../core/services/stats.service';
import { TrainingModesService } from '../../core/services/training-modes.service';
import { AthleteIdentityComponent } from '../../shared/components/athlete-identity/athlete-identity.component';
import { ContactActionsComponent } from '../../shared/components/contact-actions/contact-actions.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LocaleDatePipe } from '../../shared/pipes/locale-date.pipe';
import { academyChargesAFee } from '../../shared/utils/academy-fee';
import { driveErrorKey, folderErrorKey } from '../../shared/utils/backup-errors';
import { localeFor } from '../../shared/utils/locale';
import { monthKey } from '../../shared/utils/months';
import { LessonSheetComponent } from '../lessons/lesson-sheet/lesson-sheet.component';
import { Birthday, upcomingBirthdays } from './today-birthdays';
import {
  isoDay,
  joinedSince,
  nextClassAfter,
  nextClassFrom,
  presencesSince,
  timeRange,
  tonightClasses,
  weekStart,
} from './today.helpers';
import { BackupHealth, backupHealth } from './today-backup';

/** A block's own request: in flight, answered, or failed on its own. */
type Load<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly value: T }
  | { readonly state: 'error' };

const LOADING = { state: 'loading' } as const;
const FAILED = { state: 'error' } as const;

/**
 * One line of "Da guardare": a count, what it counts, and where to act on it.
 * A row with no count is an alert about a state, not a tally (#1751): it
 * carries a warning mark in the count's place and a line saying why.
 */
interface WatchRow {
  readonly dataCy: string;
  readonly count: number | null;
  readonly label: string;
  readonly detail: string | null;
  readonly link: string;
  readonly queryParams: Record<string, string> | null;
}

interface DocumentsHealth {
  readonly certificates: number;
  readonly documents: number;
  readonly missing: number;
}

/**
 * Today (#1643) — the app's first screen.
 *
 * The owner opens the laptop at 18:30 with five questions: what is on
 * tonight, what needs looking at, what to teach, how the week is going, and
 * whether the data is safe. Every answer already lived on some screen; none
 * was on the first one. This page asks the endpoints those screens already
 * use and puts the answers side by side. It computes nothing new on the
 * server, by rule: a block that needs a new aggregate waits for one. The
 * birthdays block did (#1754), and came with its `?birthday=` roster filter.
 *
 * Each block fetches and fails on its own. A reader whose role cannot see
 * the stats still gets tonight's classes; a failed documents check costs one
 * card, not the page.
 */
@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AthleteIdentityComponent,
    ButtonModule,
    ContactActionsComponent,
    LessonSheetComponent,
    LocaleDatePipe,
    PageHeaderComponent,
    RouterLink,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './today.component.html',
  styleUrl: './today.component.scss',
})
export class TodayComponent implements OnInit {
  private readonly academyClassService = inject(AcademyClassService);
  private readonly academyService = inject(AcademyService);
  private readonly athleteService = inject(AthleteService);
  private readonly backupFolder = inject(BackupFolderService);
  private readonly documentService = inject(DocumentService);
  private readonly driveSync = inject(DriveSyncService);
  private readonly languageService = inject(LanguageService);
  private readonly lessonService = inject(LessonService);
  private readonly statsService = inject(StatsService);
  private readonly trainingModes = inject(TrainingModesService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  /**
   * The moment the cards describe. A signal, not a constant: Today is the
   * screen a desktop window sits on overnight, and after a sleep it must not
   * go on showing yesterday — nor save tonight's topics onto yesterday's
   * lesson. Re-read when the window comes back (see `ngOnInit`).
   */
  private readonly now = signal<Date>(new Date());
  private readonly todayIso = computed<string>(() => isoDay(this.now()));
  private readonly mondayIso = computed<string>(() => isoDay(weekStart(this.now())));
  /**
   * Bumped on every reload, so an answer to a request made for yesterday is
   * dropped instead of landing on today's cards.
   */
  private epoch = 0;
  /** Bumped on every suggestions request; only the latest one may answer. */
  private suggestionsCall = 0;

  protected readonly kindLabels = this.trainingModes.labels;
  protected readonly timeRange = timeRange;

  // ── Stasera ────────────────────────────────────────────────────────────

  protected readonly classes = signal<Load<readonly AcademyClass[]>>(LOADING);
  protected readonly tonight = computed<readonly AcademyClass[]>(() => {
    const c = this.classes();
    return c.state === 'ready' ? tonightClasses(c.value, this.now()) : [];
  });
  /** A timetable exists at all — without one, "tonight" has no answer yet. */
  protected readonly hasTimetable = computed<boolean>(() => {
    const c = this.classes();
    return c.state === 'ready' && c.value.length > 0;
  });
  /** Tonight's lessons by class id; `null` once asked and none exists yet. */
  protected readonly lessons = signal<ReadonlyMap<number, Lesson | null>>(new Map());

  protected readonly nextClassLine = computed<string | null>(() => {
    this.languageService.currentLang();
    const c = this.classes();
    if (c.state !== 'ready') return null;
    const next = nextClassAfter(c.value, this.now());
    if (next === null) return null;
    const day = new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(next.date);
    const cls = next.academyClass;
    return cls.starts_at === null
      ? this.translate.instant('today.tonight.nextUntimed', { day, name: cls.name })
      : this.translate.instant('today.tonight.next', { day, time: cls.starts_at, name: cls.name });
  });

  /**
   * The lesson whose sheet is open: a class and the date of the occurrence
   * being planned — tonight's from "Stasera", the next class's own date from
   * "Cosa insegnare" (#1752). The date travels with it, or topics chosen for
   * Tuesday would land on tonight's lesson.
   */
  protected readonly planning = signal<{ readonly cls: AcademyClass; readonly date: Date } | null>(
    null,
  );
  protected readonly sheetOpen = signal<boolean>(false);

  // ── Da guardare ────────────────────────────────────────────────────────

  protected readonly health = signal<Load<DocumentsHealth>>(LOADING);
  /**
   * Owing this month; `null` when the academy charges nothing, so there is
   * no request and no line. Its own load state, because "nothing to check"
   * is a claim about BOTH halves of the card: a count still loading, or one
   * that failed, is not a zero.
   */
  protected readonly unpaid = signal<Load<number> | null>(null);

  /**
   * The card says "nothing to check" only when every half has answered and
   * found nothing — never while one is loading, and never after one failed.
   */
  protected readonly watchState = computed<'loading' | 'settled'>(() =>
    this.health().state === 'loading' || this.unpaid()?.state === 'loading' || !this.backupRead()
      ? 'loading'
      : 'settled',
  );
  protected readonly watchAllClear = computed<boolean>(
    () =>
      this.watchState() === 'settled' &&
      this.health().state === 'ready' &&
      this.unpaid()?.state !== 'error' &&
      this.watchRows().length === 0,
  );

  protected readonly watchRows = computed<readonly WatchRow[]>(() => {
    this.languageService.currentLang();
    const h = this.health();
    const t = (one: string, other: string, count: number, params = {}): string =>
      this.translate.instant(count === 1 ? one : other, params);
    // The one failure that loses the whole academy goes first (#1751).
    const backup = this.backupAlert();
    const rows: WatchRow[] = backup === null ? [] : [backup];
    const expiring = '/dashboard/documents/expiring';
    if (h.state === 'ready' && h.value.certificates > 0) {
      rows.push({
        dataCy: 'today-watch-certificates',
        count: h.value.certificates,
        label: t(
          'today.watch.certificateOne',
          'today.watch.certificateOther',
          h.value.certificates,
        ),
        detail: null,
        link: expiring,
        queryParams: null,
      });
    }
    if (h.state === 'ready' && h.value.missing > 0) {
      rows.push({
        dataCy: 'today-watch-missing',
        count: h.value.missing,
        label: t('today.watch.missingOne', 'today.watch.missingOther', h.value.missing),
        detail: null,
        link: expiring,
        queryParams: null,
      });
    }
    if (h.state === 'ready' && h.value.documents > 0) {
      rows.push({
        dataCy: 'today-watch-documents',
        count: h.value.documents,
        label: t('today.watch.documentOne', 'today.watch.documentOther', h.value.documents),
        detail: null,
        link: expiring,
        queryParams: null,
      });
    }
    const u = this.unpaid();
    const unpaid = u?.state === 'ready' ? u.value : 0;
    if (unpaid > 0) {
      const month = this.translate.instant(monthKey(this.now().getMonth() + 1));
      rows.push({
        dataCy: 'today-watch-unpaid',
        count: unpaid,
        label: t('today.watch.unpaidOne', 'today.watch.unpaidOther', unpaid, { month }),
        detail: null,
        link: '/dashboard/athletes',
        queryParams: { paid: 'no' },
      });
    }
    return rows;
  });

  // ── Cosa insegnare ─────────────────────────────────────────────────────

  /**
   * The lesson the suggestions are for (#1752): the next class on the
   * timetable at or after now, wrapping the week. On a rest day it is still
   * worth asking — the ranking reads the season, not the date, and Sunday
   * with the laptop open is when planning actually happens. Null only when
   * there is no timetable at all, and then the card is not drawn.
   */
  protected readonly teachSlot = computed<{
    readonly academyClass: AcademyClass;
    readonly date: Date;
  } | null>(() => {
    const c = this.classes();
    return c.state === 'ready' ? nextClassFrom(c.value, this.now()) : null;
  });
  protected readonly suggestions = signal<Load<readonly LessonSuggestion[]>>(LOADING);

  // ── Questa settimana ───────────────────────────────────────────────────

  protected readonly presences = signal<number | null>(null);
  protected readonly coverage = signal<SyllabusCoverage | null>(null);
  protected readonly joined = signal<Load<readonly Athlete[]>>(LOADING);

  // ── Compleanni ─────────────────────────────────────────────────────────

  /**
   * The week's birthdays (#1754), today's first. Empty until answered, and
   * after a failure too: the card is a prompt, not a report, so it shows
   * only when it has someone to name — never empty, never as an error.
   */
  private readonly birthdays = signal<readonly Birthday<Athlete>[]>([]);
  protected readonly birthdayRows = computed(() => {
    this.languageService.currentLang();
    return this.birthdays().map((b) => ({ ...b, label: this.birthdayLabel(b) }));
  });

  // ── Header and system line ─────────────────────────────────────────────

  protected readonly dateTitle = computed<string>(() => {
    const label = new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(this.now());
    // "giovedì 24 settembre" is a sentence fragment in Italian; as a title it
    // starts with a capital, as any heading does.
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly seasonSubtitle = computed<string | null>(() => {
    this.languageService.currentLang();
    const c = this.coverage();
    return c === null ? null : this.translate.instant('today.season', { label: c.season.label });
  });

  /**
   * Whether a copy of the academy exists off this computer (#1751), or null
   * until read — and forever on the web build, which has no bridge to ask.
   */
  protected readonly backup = signal<BackupHealth | null>(null);
  /**
   * Whether the bridge has answered — the third half of "Da guardare". The
   * bridge is asynchronous, and the documents and payments can land first:
   * without this the card would say "nothing to check" and then grow a
   * backup alert. True from the start on the web build, which never asks.
   */
  private readonly backupRead = signal<boolean>(!this.backupFolder.available);

  /**
   * The backup as a "Da guardare" row: failing, never set up, or silent for
   * more than a week. Healthy copies stay a quiet line at the foot.
   */
  private readonly backupAlert = computed<WatchRow | null>(() => {
    this.languageService.currentLang();
    const b = this.backup();
    if (b === null || b.kind === 'ok') return null;
    const row = {
      dataCy: 'today-watch-backup',
      count: null,
      link: '/dashboard/backup',
      queryParams: null,
    };
    if (b.kind === 'local-only') {
      return {
        ...row,
        label: this.translate.instant('today.backup.localOnly'),
        // Drive is offered only where it exists: a build without its client
        // hides the card on the Backup page, so advice to link it is a dead end.
        detail: this.translate.instant(
          b.driveAvailable ? 'today.backup.localOnlyDetail' : 'today.backup.localOnlyDetailFolder',
        ),
      };
    }
    if (b.kind === 'stale') {
      const date = new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
        day: 'numeric',
        month: 'long',
      }).format(new Date(b.lastCopyAt));
      return {
        ...row,
        label: this.translate.instant('today.backup.stale', { date }),
        detail: this.translate.instant('today.backup.staleDetail'),
      };
    }
    const label =
      b.target === 'folder'
        ? this.translate.instant('today.backup.folderFailing', { where: b.where })
        : b.where === ''
          ? this.translate.instant('today.backup.driveFailingUnnamed')
          : this.translate.instant('today.backup.driveFailing', { where: b.where });
    const reasonKey = b.target === 'folder' ? folderErrorKey(b.code) : driveErrorKey(b.code);
    return { ...row, label, detail: this.translate.instant(reasonKey, { code: b.code }) };
  });

  ngOnInit(): void {
    this.loadAll();

    // Back from a sleep, or from another window, on a different day: re-read
    // the clock and ask every card again. Clicking "Oggi" cannot do it — the
    // router reuses the page on a same-URL navigation.
    fromEvent(this.document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.document.visibilityState !== 'visible') return;
        const now = new Date();
        if (isoDay(now) !== this.todayIso()) {
          this.now.set(now);
          this.reset();
          this.loadAll();
          return;
        }
        // The same day, later: the cards stand, but the class to plan may
        // have moved on — opened at 18:30 and back at 21:30, the 19:00 class
        // is held and next week's is the one to prepare (#1752).
        const before = this.teachSlot();
        this.now.set(now);
        if (!sameSlot(before, this.teachSlot())) {
          this.suggestions.set(LOADING);
          this.loadSuggestions();
        }
      });
  }

  private loadAll(): void {
    this.loadClasses();
    this.loadHealth();
    this.loadUnpaid();
    this.loadWeek();
    this.loadBirthdays();
    this.loadBackup();
  }

  /** Every card back to "loading", and every older answer to the bin. */
  private reset(): void {
    this.epoch++;
    this.classes.set(LOADING);
    this.lessons.set(new Map());
    this.suggestions.set(LOADING);
    this.health.set(LOADING);
    this.unpaid.set(null);
    this.presences.set(null);
    this.coverage.set(null);
    this.joined.set(LOADING);
    this.birthdays.set([]);
    this.sheetOpen.set(false);
    this.planning.set(null);
  }

  /** Runs `apply` only if no reload happened since the request was made. */
  private current<T>(apply: (value: T) => void): (value: T) => void {
    const epoch = this.epoch;
    return (value) => {
      if (epoch === this.epoch) apply(value);
    };
  }

  protected topicsOf(classId: number): string | null {
    const lesson = this.lessons().get(classId);
    if (!lesson || lesson.topics.length === 0) return null;
    return lesson.topics.map((t) => t.name).join(', ');
  }

  /** Opens the sheet on a class's occurrence — tonight's unless told otherwise. */
  protected plan(c: AcademyClass, date: Date = this.now()): void {
    this.planning.set({ cls: c, date });
    this.sheetOpen.set(true);
  }

  /**
   * Only tonight's lessons have a line on "Stasera". A plan saved for another
   * day — next Thursday's occurrence of the same weekly class — must not
   * rewrite tonight's.
   */
  protected onSaved(saved: Lesson): void {
    if (saved.academy_class_id === null || saved.held_on !== this.todayIso()) return;
    const classId = saved.academy_class_id;
    this.lessons.update((m) => new Map(m).set(classId, saved));
  }

  protected reasonLabel(s: LessonSuggestion): string {
    this.languageService.currentLang();
    if (s.reason === 'never' || s.last_taught_on === null) {
      return this.translate.instant(REASON_KEYS.never);
    }
    const [y, m, d] = s.last_taught_on.split('-').map(Number);
    const date = new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
    return this.translate.instant(REASON_KEYS[s.reason], { date });
  }

  /**
   * "Per Fondamentali alle 19:00" tonight; "Per Fondamentali, lunedì 28
   * settembre alle 19:00" on any other day — so the reader always knows which
   * evening the suggestions are for.
   */
  protected teachHeading(slot: {
    readonly academyClass: AcademyClass;
    readonly date: Date;
  }): string {
    this.languageService.currentLang();
    const c = slot.academyClass;
    if (isoDay(slot.date) === this.todayIso()) {
      return c.starts_at === null
        ? this.translate.instant('today.teach.forUntimed', { name: c.name })
        : this.translate.instant('today.teach.for', { name: c.name, time: c.starts_at });
    }
    const day = this.longDate(slot.date);
    return c.starts_at === null
      ? this.translate.instant('today.teach.forDayUntimed', { name: c.name, day })
      : this.translate.instant('today.teach.forDay', { name: c.name, day, time: c.starts_at });
  }

  /** "lunedì 28 settembre", in the reader's language. */
  private longDate(date: Date): string {
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  protected readonly sheetDateLabel = computed<string>(() => {
    this.languageService.currentLang();
    const p = this.planning();
    return p === null ? '' : this.longDate(p.date);
  });

  protected readonly sheetHeldOn = computed<string>(() => {
    const p = this.planning();
    return p === null ? this.todayIso() : isoDay(p.date);
  });

  private loadClasses(): void {
    this.academyClassService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((classes: AcademyClass[]) => {
          this.classes.set({ state: 'ready', value: classes });
          for (const c of this.tonight()) this.loadLesson(c.id);
          this.loadSuggestions();
        }),
        error: this.current(() => {
          this.classes.set(FAILED);
          this.suggestions.set(FAILED);
        }),
      });
  }

  private loadLesson(classId: number): void {
    this.lessonService
      .get(classId, this.todayIso())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((lesson: Lesson | null) =>
          this.lessons.update((m) => new Map(m).set(classId, lesson)),
        ),
        // A missing topic line is not worth an error on the card: the class
        // itself still shows, and the sheet reads the lesson again on open.
        error: () => undefined,
      });
  }

  private loadSuggestions(): void {
    const slot = this.teachSlot();
    // Only the latest request may answer: a reply for a slot re-picked since
    // (a same-day return) must not land under the new heading.
    const call = ++this.suggestionsCall;
    const latest =
      <T>(apply: (value: T) => void) =>
      (value: T): void => {
        if (call === this.suggestionsCall) apply(value);
      };
    if (slot === null) {
      this.suggestions.set({ state: 'ready', value: [] });
      return;
    }
    this.lessonService
      .suggestions(slot.academyClass.id, 3)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current(
          latest((value: LessonSuggestion[]) => this.suggestions.set({ state: 'ready', value })),
        ),
        error: this.current(latest(() => this.suggestions.set(FAILED))),
      });
  }

  private loadHealth(): void {
    this.documentService
      .fetchDocumentsHealth()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((resp: ExpiringDocumentsResponse) => {
          // Defaulted as on the roster (#1456): a response without one of the
          // arrays must cost a zero, not the card.
          const documents = resp.data ?? [];
          const certificates = documents.filter((d) => d.type === 'medical_certificate').length;
          this.health.set({
            state: 'ready',
            value: {
              certificates,
              documents: documents.length - certificates,
              missing: resp.missing_medical_certificate?.length ?? 0,
            },
          });
        }),
        error: this.current(() => this.health.set(FAILED)),
      });
  }

  private loadUnpaid(): void {
    // Nothing is owed where nothing is charged (#1381): no request, no line.
    if (!academyChargesAFee(this.academyService.academy())) return;
    this.unpaid.set(LOADING);
    this.athleteService
      .list({ paid: 'no' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((res: AthleteListResponse) =>
          this.unpaid.set({ state: 'ready', value: res.meta.total }),
        ),
        error: this.current(() => this.unpaid.set(FAILED)),
      });
  }

  private loadWeek(): void {
    this.statsService
      .attendanceDaily(3)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((points: readonly DailyAttendancePoint[]) =>
          this.presences.set(presencesSince(points, this.mondayIso())),
        ),
        error: () => undefined,
      });
    this.statsService
      .syllabusCoverage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // A report without its season or totals is no report: an empty 200
        // (a stub, a proxy) must cost the row, not the page's change detection.
        next: this.current((coverage: SyllabusCoverage) =>
          this.coverage.set(coverage?.season && coverage.totals ? coverage : null),
        ),
        // Stats are an owner capability; a reader without it sees the rest.
        error: () => undefined,
      });
    // Newest joiners first: the first page holds this week's, and a week
    // with more than a page of new members is a problem nobody has had.
    this.athleteService
      .list({ sortBy: 'joined_at', sortOrder: 'desc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((res: AthleteListResponse) =>
          this.joined.set({
            state: 'ready',
            value: joinedSince(res.data, this.mondayIso(), this.todayIso()),
          }),
        ),
        error: this.current(() => this.joined.set(FAILED)),
      });
  }

  /**
   * One request for the week, of the people training: an inactive athlete is
   * not someone to message from here. The roster pages by 20, and a week
   * with more birthdays than that is not one this academy will have.
   */
  private loadBirthdays(): void {
    this.athleteService
      .list({ birthday: 'week', status: 'active' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: this.current((res: AthleteListResponse) =>
          this.birthdays.set(upcomingBirthdays(res.data, this.now())),
        ),
        error: () => undefined,
      });
  }

  /** "Turns 34 today" for today's; the weekday for the rest of the window. */
  private birthdayLabel(b: Birthday<Athlete>): string {
    if (b.ahead > 0) return this.translate.instant(WEEKDAY_KEYS[b.date.getDay()]);
    if (b.turns === null) return this.translate.instant('today.birthdays.today');
    return this.translate.instant(
      b.turns === 1 ? 'today.birthdays.turnsOne' : 'today.birthdays.turnsOther',
      { years: b.turns },
    );
  }

  private loadBackup(): void {
    // `state()` answers all-nulls where there is no bridge, and on the web an
    // absent folder means "no such feature", not "none chosen". Only the
    // desktop is asked, or the web build would raise a backup alarm about a
    // feature it does not have.
    if (!this.backupFolder.available) return;
    const drive = this.driveSync.available
      ? this.driveSync.state()
      : Promise.resolve({ configured: false, linked: false });
    void Promise.all([this.backupFolder.state(), drive])
      .then(
        ([folder, link]) => this.backup.set(backupHealth(folder, link, this.now())),
        // A bridge that fails to answer costs the backup line, not the card.
        () => this.backup.set(null),
      )
      .finally(() => this.backupRead.set(true));
  }
}

/** The same class on the same date: the suggestions already on screen still apply. */
function sameSlot(
  a: { readonly academyClass: AcademyClass; readonly date: Date } | null,
  b: { readonly academyClass: AcademyClass; readonly date: Date } | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.academyClass.id === b.academyClass.id && isoDay(a.date) === isoDay(b.date);
}

/**
 * The suggestion reasons in the lesson sheet's own words (#1566): the two
 * screens describe the same suggestion, so they say it the same way. An
 * explicit map, never a concatenated key — the parity spec cannot see those.
 */
const REASON_KEYS: Readonly<Record<SuggestionReason, string>> = {
  never: 'lessons.sheet.suggestions.reason.never',
  thin: 'lessons.sheet.suggestions.reason.thin',
  stale: 'lessons.sheet.suggestions.reason.stale',
};

/**
 * `Date.getDay()` to the weekday names the timetable already uses (#1754).
 * Within a window of seven days a weekday names one date, so it needs no
 * more. An explicit list, never a built key.
 */
const WEEKDAY_KEYS: readonly string[] = [
  'weekdays.sun',
  'weekdays.mon',
  'weekdays.tue',
  'weekdays.wed',
  'weekdays.thu',
  'weekdays.fri',
  'weekdays.sat',
];
