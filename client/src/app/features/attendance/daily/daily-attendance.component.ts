import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, filter, forkJoin, map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BeltLadderService } from '../../../core/services/belt-ladder.service';
import { RuntimeService } from '../../../core/services/runtime.service';
import { AcademyClosure, AcademyService } from '../../../core/services/academy.service';
import { closureOn } from '../../../shared/utils/training-days';
import { LanguageService } from '../../../core/services/language.service';
import { datePickerFormatFor } from '../../../shared/utils/locale';
import {
  Athlete,
  AthleteService,
  AthleteSortField,
  AthleteSortOrder,
  Belt,
} from '../../../core/services/athlete.service';
import { AcademyClass, AcademyClassService } from '../../../core/services/academy-class.service';
import {
  AttendanceRecord,
  AttendanceService,
  ClassRegular,
  ClassRegulars,
} from '../../../core/services/attendance.service';
import { Lesson, LessonService, LessonTopic } from '../../../core/services/lesson.service';
import { LessonSheetComponent } from '../../lessons/lesson-sheet/lesson-sheet.component';
import { AthleteIdentityComponent } from '../../../shared/components/athlete-identity/athlete-identity.component';
import { FilterSheetComponent } from '../../../shared/components/filter-sheet/filter-sheet.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { BeltSortButtonComponent } from '../../../shared/components/belt-sort-button/belt-sort-button.component';
import {
  nameSortAria,
  nameSortSignifier,
  nameSortTooltipKey,
  nextBeltSort,
  nextNameSort,
  type SortState,
} from '../../../shared/utils/athlete-sort';
import { pickDefaultClass } from './class-pick';
import { MissingRegularsComponent } from './missing-regulars/missing-regulars.component';
import { NewPersonSheetComponent } from '../../athletes/new-person/new-person-sheet.component';
import { MatMoney } from './pay/mat-money';
import { PayChip } from './pay/pay-chip';
import { PayChipComponent } from './pay/pay-chip.component';
import { PayRecorded, PaySheetComponent } from './pay/pay-sheet.component';

interface SelectOption<T extends string> {
  label: string;
  value: T | '';
}

/** One part of the phone's register (#2035), with its heading's key when it has one. */
interface RegisterSection {
  readonly key: 'all' | 'regulars' | 'others';
  readonly label: string | null;
  readonly athletes: readonly Athlete[];
}

/**
 * What marking needs of a person: who, and a name for the toast. A row of
 * the register and a regular from the panel (#1930) are both this.
 */
type Markable = Pick<Athlete, 'id' | 'first_name' | 'last_name'>;

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * How far back the check-in looks for the last session held when today is not
 * one (#195, #1766): long enough to cross a summer closure.
 */
const RESEAT_REACH_DAYS = 62;

/**
 * How many active athletes the check-in reads at once (#1930): the server's
 * cap on `per_page`. A room of forty is forty taps, not a paginator; a
 * centre past this many searches for the rest, and the page says so.
 */
const CHECK_IN_ROSTER_SIZE = 200;

/**
 * YYYY-MM-DD from the LOCAL date components — NOT `toISOString()`, which
 * converts to UTC and can cross midnight in non-UTC timezones (e.g. a user
 * in Europe/Rome at 23:00 local time would land on tomorrow's UTC date).
 * Reused from the athlete form for the same canon reason.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-daily-attendance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    DatePickerModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    Toast,
    RouterLink,
    TranslatePipe,
    AthleteIdentityComponent,
    FilterSheetComponent,
    PageHeaderComponent,
    SortHeaderComponent,
    BeltSortButtonComponent,
    LessonSheetComponent,
    MissingRegularsComponent,
    PayChipComponent,
    PaySheetComponent,
    NewPersonSheetComponent,
    TooltipModule,
  ],
  providers: [MessageService, MatMoney],
  templateUrl: './daily-attendance.component.html',
  styleUrl: './daily-attendance.component.scss',
})
export class DailyAttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly lessonService = inject(LessonService);
  private readonly athleteService = inject(AthleteService);
  private readonly academyService = inject(AcademyService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly beltLadder = inject(BeltLadderService);
  private readonly languageService = inject(LanguageService);
  private readonly academyClassService = inject(AcademyClassService);
  private readonly runtime = inject(RuntimeService);

  /**
   * The phone (#2035): the register a coach taps through at the mat. A tap
   * answers with a buzz and the row's own state, and a second tap undoes it,
   * so the success toast, which would stack over the rows, stays on the PC.
   */
  protected readonly onThePhone = computed(() => this.runtime.profile() === 'mobile');

  /**
   * The money at the mat (#2036, PRD § 6.1): a chip on each phone row says
   * what pays for the month, and a month owed opens the payment sheet. Only
   * on the phone, and only today: the chip is about who is standing there.
   */
  protected readonly money = inject(MatMoney);
  private readonly showsMoney = computed(
    () => this.onThePhone() && this.selectedDateIso() === toLocalDateString(new Date()),
  );
  /** The sheet's athlete and the chip's month; `null` while it is closed. */
  protected readonly paying = signal<{ athlete: Athlete; month: string } | null>(null);
  /** What was typed for someone new (#1939); `null` keeps their sheet shut. */
  protected readonly newPerson = signal<string | null>(null);
  /** Who opened the sheet for someone new: the keyboard goes back there. */
  private newPersonOpener: HTMLElement | null = null;
  /** Set once someone was added: their row takes the keyboard when listed. */
  private addedId: number | null = null;
  private readonly injector = inject(Injector);
  /** Whose row opened the last sheet: the keyboard goes back there. */
  private paidFrom: number | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The date format for every picker on this component (#1498).
   *
   * A signal, not a constant, so switching the sidebar language re-renders
   * the dates with it — before this the format was hardcoded in the template
   * and the app shipped two different ones.
   */
  protected readonly datePickerFormat = computed(() =>
    datePickerFormatFor(this.languageService.currentLang()),
  );

  /**
   * Weekdays the academy does NOT train on, expressed as Carbon-compatible
   * `dayOfWeek` ints (0=Sun..6=Sat). Bound to `<p-datepicker [disabledDays]>`
   * so the picker greys out Sat/Sun for an academy that runs Mon/Wed/Fri —
   * the instructor can't accidentally log attendance on a non-class day
   * (#88c). Empty array when `training_days` is unconfigured (null) so
   * every weekday stays selectable: the legacy 7-day-window behaviour
   * survives until the owner opts in via the academy form.
   */
  protected readonly disabledWeekdays = computed<number[]>(() => {
    const days = this.academyService.academy()?.training_days ?? null;
    if (days === null || days.length === 0) return [];
    const trainingSet = new Set(days);
    return ALL_WEEKDAYS.filter((d) => !trainingSet.has(d));
  });

  /**
   * Backfill window (#181). The PRD originally capped backfilling at 7
   * days; user feedback after the M4 release was that the cap was too
   * tight (post-hoc data entry, holiday catch-up). Single-instructor
   * academy → trust the user. We keep `maxDate` so future dates stay
   * blocked at the picker layer (semantically wrong + the FormRequest
   * still rejects them with 422), and drop the floor entirely so the
   * coach can backfill arbitrarily far back.
   */
  protected readonly maxDate = new Date();

  /**
   * `selectedDate` is bound one way (`[ngModel]`) to the date picker, with
   * `onDateChanged` taking the other direction. `<p-datepicker>` emits a
   * Date **or null** — null for anything its parser rejects, which is why
   * the handler owns the assignment (#1638); we convert to YYYY-MM-DD when
   * crossing the wire boundary (see loadDay).
   *
   * Initialised to today; ngOnInit() reseats this to the most recent past
   * training day when today isn't one (#195) — without that step the user
   * lands on a non-training-day default and every check-in click 422s.
   */
  protected readonly selectedDate = signal<Date>(new Date());

  /**
   * How many are on the mat, in the header (#1539).
   *
   * The screen exists to produce this number and never showed it: you ticked
   * nineteen names out of thirty-three and then counted the ticks by eye,
   * down a list that scrolls. `presentMap()` has been the exact answer all
   * along — it is what every row reads to decide whether it is ticked.
   *
   * Null at zero rather than "0 present": before anyone arrives the count is
   * not information, and `<app-page-header>` drops the chip entirely when it
   * is null. It appears on the first tap and follows the tally from there.
   *
   * The numerator alone, no denominator. "19 / 33" invites "33 of what" —
   * active athletes, or the filtered page? — and the answer changes as soon
   * as someone types in the search box.
   */
  protected readonly presentCountLabel = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const present = this.presentMap().size;
    if (present === 0) return null;

    const key =
      present === 1 ? 'attendance.daily.presentCountOne' : 'attendance.daily.presentCountOther';
    return this.translate.instant(key, { count: present });
  });

  /** Translated header title — today / dated variant in one place for <app-page-header>. */
  protected readonly attendanceTitle = computed<string>(() => {
    return this.selectedDateIsToday()
      ? this.translate.instant('attendance.daily.title')
      : this.translate.instant('attendance.daily.titleForDate', { date: this.selectedDateLabel() });
  });

  /**
   * True when `selectedDate` matches today (calendar day, not exact instant).
   * Drives the title swap (#854): "Check-in di oggi" when true, dated form
   * ("Check-in del martedì 19 maggio") when false. Recomputed reactively
   * so a date-picker change flips the title without a manual refresh.
   *
   * **Stale-after-midnight caveat**: `new Date()` is captured at computed-
   * evaluation time without a time-based signal dependency. If the page
   * is left open past midnight the computed won't re-run until
   * `selectedDate` or `academy()` changes. Low-probability for typical
   * single-session usage; acceptable today, would be revisited if the
   * page grew an always-mounted dashboard surface.
   */
  protected readonly selectedDateIsToday = computed<boolean>(() => {
    const sel = this.selectedDate();
    const today = new Date();
    return (
      sel.getFullYear() === today.getFullYear() &&
      sel.getMonth() === today.getMonth() &&
      sel.getDate() === today.getDate()
    );
  });

  /**
   * True when **today itself** is a no-class day AND `training_days` is
   * configured. Banner trigger (#854) — surfaces ONLY when `initSelectedDate()`
   * had to reseat onto a past training day, NOT when the user manually
   * navigates to a past date on a normal training day (the backfill case
   * is silent; only the title changes there).
   *
   * Why not derive from "selectedDate is in the past" alone: a coach
   * deliberately backfilling Monday's roster on a Wednesday IS a training-
   * day flow; raising a "no class today" banner there would be a false
   * positive.
   *
   * **Stale-after-midnight caveat**: same invariant as
   * `selectedDateIsToday()` — the `new Date()` read isn't on a signal,
   * so the banner won't recompute across a midnight boundary unless the
   * user picks a new date or the cached academy reloads. Acceptable for
   * the current single-session usage pattern.
   */
  protected readonly showNoClassToday = computed<boolean>(() => {
    const trainingDays = this.academyService.academy()?.training_days ?? null;
    if (trainingDays === null || trainingDays.length === 0) return false;
    const today = new Date();
    return !trainingDays.includes(today.getDay()) || this.closedToday() !== null;
  });

  /**
   * The closure today falls in (#1766), or null. The banner names it, and
   * `initSelectedDate()` walks back past it to the last session held.
   */
  protected readonly closedToday = computed<AcademyClosure | null>(() =>
    closureOn(this.academyService.academy()?.closures, new Date()),
  );

  /**
   * Localised "weekday DD month" form of `selectedDate`. Used by the
   * dated title fallback and the banner copy when the page is showing a
   * past training day. `Intl.DateTimeFormat` picks the active SPA locale
   * from `LanguageService` so the string flips IT/EN with the sidebar
   * toggle — matches the rest of the dashboard chrome.
   */
  protected readonly selectedDateLabel = computed<string>(() => {
    const locale = this.languageService.currentLang() === 'it' ? 'it-IT' : 'en-GB';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(this.selectedDate());
  });

  /**
   * The whole active roster, on one page (#1930). Twelve people arrive in
   * five minutes, and with the roster's 20 a page half of a forty-athlete
   * room sat on page 2: every name meant paging back and forth at the door.
   * The same `/api/v1/athletes` endpoint, asked for up to its cap; the
   * roster page keeps its 20. Filters, search and sort narrow or reorder
   * this one page, so there is no page to fall off any more (#527).
   */
  protected readonly athletes = signal<Athlete[]>([]);
  protected readonly totalActiveAthletes = signal<number>(0);

  /**
   * More active athletes than one page carries — a centre past the cap.
   * Said under the list, with the way to the others: the search.
   */
  protected readonly truncated = computed<boolean>(
    () => this.totalActiveAthletes() > this.athletes().length,
  );

  /**
   * athlete_id → record_id for each present athlete. The record_id is the
   * server-generated PK; we need it to fire a DELETE on un-mark. While a
   * mark is in flight we set the value to a sentinel (-1) so the row
   * renders as present optimistically; on success we swap in the real id.
   */
  protected readonly presentMap = signal<Map<number, number>>(new Map());

  /**
   * Subset of presentMap that was self-marked by the athlete (#960).
   * Renders a small "Self" badge next to the name so the instructor
   * distinguishes self-reported presence from rows they entered
   * themselves — spot anomalies, accept the rest.
   */
  protected readonly selfMarkedSet = signal<Set<number>>(new Set());

  protected readonly loading = signal<boolean>(false);

  /**
   * Set of athlete_ids whose mark/unmark is currently in flight. Used to
   * disable the row's tap handler — preventing double-tap during a slow
   * round-trip from spawning two POSTs that race.
   */
  protected readonly inflight = signal<Set<number>>(new Set());

  // ── Classes (#1562) ────────────────────────────────────────────────────────
  // The timetable, read once per visit. Empty on an academy that never set
  // one up, and then nothing on this page changes: no picker, no class on the
  // wire, a presence on a day exactly as before.

  protected readonly classes = signal<readonly AcademyClass[]>([]);
  private classesLoaded = false;

  /** The selected date's classes, in the server's order — by time, untimed last. */
  protected readonly dayClasses = computed<readonly AcademyClass[]>(() => {
    const weekday = this.selectedDate().getDay();
    return this.classes().filter((c) => c.weekday === weekday);
  });

  /**
   * Which class the ticks go into. Chosen by the clock when the page opens
   * (see `pickDefaultClass`), by a tap on a chip after that, and re-chosen
   * whenever the date moves. Null on a day with no class.
   */
  protected readonly selectedClassId = signal<number | null>(null);

  /**
   * Chips lock while any mark is in flight. A response landing after the
   * class changed underneath it would write its record id into the other
   * lesson's present-map — the one race the per-athlete guard cannot see.
   */
  protected readonly anyInflight = computed<boolean>(() => this.inflight().size > 0);

  /**
   * Monotonic counter for `loadDay()` calls. A request whose captured
   * epoch no longer matches the current value is stale (the user clicked
   * the date picker again before the previous response landed) and its
   * tap() into our signals is a no-op. Mirrors AcademyService.epoch.
   */
  private loadEpoch = 0;

  /**
   * The attendance fetch keeps its own counter (#1562). It used to share
   * `loadEpoch`, so any roster-only reload — a search keystroke — bumped it
   * and silently dropped the day's records if they were still in flight; a
   * chip tap would have done the same to the roster. Two questions, two
   * counters: each response is measured against the one that asked it.
   */
  private attendanceEpoch = 0;

  // ── Search + filters (#184) ────────────────────────────────────────────────
  // Mirrors the athletes-list filter strip — same shape, same debounce
  // pipeline. Filter parameters are forwarded to the SAME paginated
  // athletes endpoint the page already calls, so server-side filtering
  // applies. Keeps the chrome consistent and the muscle memory shared
  // with the main list (Jakob's law).

  protected readonly searchTerm = signal<string>('');

  /**
   * The search the list on screen answers (#1930) — not the one asked for.
   * `searchTerm` moves the moment a search is sent; this only when its answer
   * lands, so a failed search leaves it naming the list still shown.
   */
  private readonly listedTerm = signal<string>('');
  protected readonly selectedBelt = signal<Belt | ''>('');

  /**
   * Rank first, highest first — the order the roster has opened on since
   * #1457, and now this page too (#1526).
   *
   * The check-in used to open in insertion order, which answers "who did I
   * type in last": a question nobody asks, and a different answer from the
   * one the roster gives for the same people.
   */
  protected readonly sortField = signal<AthleteSortField | null>('belt');
  protected readonly sortOrder = signal<AthleteSortOrder>('desc');

  /** Current order, in the shape the shared sort helpers take. */
  private readonly sortState = computed<SortState>(() => ({
    field: this.sortField(),
    order: this.sortOrder(),
  }));

  /**
   * Debounce pipeline matching athletes-list (#102): each keystroke
   * pushes here, the trim+distinct guard collapses redundant emissions,
   * the 200 ms window keeps the load count low without making the
   * filter feel laggy (Doherty < 400 ms).
   */
  private readonly searchInputSubject = new Subject<string>();

  // The belt filter offers the academy's own ladder, in rank order (#1801).
  // This file used to carry a BJJ key map and order of its own.
  protected readonly beltOptions = computed<SelectOption<Belt>[]>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return [
      { label: this.translate.instant('belts.all'), value: '' },
      ...this.beltLadder.beltOptions(),
    ];
  });

  constructor() {
    // Compared with the search on screen, not with the pipe's last value:
    // Enter and Esc apply a search directly (#1930), and a keystroke still
    // waiting out its pause must not put back a name they already cleared.
    this.searchInputSubject
      .pipe(
        debounceTime(200),
        map((value) => value.trim()),
        filter((q) => q !== this.searchTerm()),
        takeUntilDestroyed(),
      )
      .subscribe((q) => this.applySearch(q));

    // The runtime answers after the first render, so the phone is known late.
    effect(() => {
      if (this.onThePhone()) untracked(() => this.money.load());
    });
  }

  // Clear any pending undo toast before the next add to avoid stacked Undo
  // buttons. The component-scoped MessageService isolates this from global
  // toasts (see providers above). We intentionally don't use per-message
  // keys: PrimeNG ignores keyed messages when the rendered `<p-toast>` is
  // keyless, so adding keys can silently make undo/error toasts stop
  // appearing — a non-obvious gotcha worth recording at the call site.

  ngOnInit(): void {
    this.initSelectedDate();
    this.loadDay();
  }

  /**
   * If today isn't one of the academy's `training_days`, walk back from
   * today (up to a week) and pick the most recent past training day as
   * the default selection (#195). Without this, an academy that trains
   * Mon/Wed/Fri loads the page on Thursday with today's date pre-selected
   * — every "mark present" click then 422s server-side because Thursday
   * isn't a valid training day for that academy. The future-date guard
   * (#190) already handles tomorrow at the picker layer; this is the
   * symmetric fix on the past side.
   *
   * Legacy fallback: if `training_days` is null (academy hasn't opted
   * into the schedule yet) we keep today as the default — the field is
   * unconfigured so every weekday is fair game.
   */
  private initSelectedDate(): void {
    const academy = this.academyService.academy();
    const trainingDays = academy?.training_days ?? null;
    if (trainingDays === null || trainingDays.length === 0) {
      return;
    }
    const trainingSet = new Set(trainingDays);
    // A day the academy is shut is not a session, whatever its weekday
    // (#1766): the default lands on the last one actually held.
    const isSession = (d: Date): boolean =>
      trainingSet.has(d.getDay()) && closureOn(academy?.closures, d) === null;
    const today = new Date();
    if (isSession(today)) {
      return;
    }
    // Walk back to the most recent past session. A week finds one on any
    // weekly pattern; the rest of the bound is for a closure (August, the
    // Christmas break), and it guarantees termination whatever the data.
    const cursor = new Date(today);
    for (let i = 0; i < RESEAT_REACH_DAYS; i++) {
      cursor.setDate(cursor.getDate() - 1);
      if (isSession(cursor)) {
        this.selectedDate.set(cursor);
        return;
      }
    }
  }

  /**
   * Date-driven full refresh: roster + the day's attendance records.
   * Used on init, on date change, and as the public name the existing
   * test suite exercises. Internally splits to `fetchAthletes()` +
   * `fetchAttendance()` so filter/sort changes can re-fetch ONLY the
   * roster side without clobbering an in-flight optimistic mark on
   * the present-map (#184 follow-up to Copilot review).
   *
   * Epoch-gated against double-trigger: the user clicking the date
   * picker rapidly fires multiple loadDay() calls; each captures its
   * own epoch and only writes to the signals if its epoch is still
   * current. A late response from a previous date can no longer
   * clobber the freshly-selected date's state.
   */
  protected loadDay(): void {
    // Same as a chip: an Undo from the day on screen must not reach the next.
    this.messageService.clear();
    this.loading.set(true);
    const epoch = ++this.loadEpoch;
    const attendanceEpoch = ++this.attendanceEpoch;

    let pending = 2;
    const settle = (): void => {
      pending -= 1;
      if (pending === 0 && epoch === this.loadEpoch) {
        this.loading.set(false);
      }
    };

    this.fetchAthletes(epoch, settle);

    // The day's records depend on which class is selected, and that depends
    // on the timetable — so the classes come first (once), the class is
    // picked, and the attendance fetch follows. `fetchAttendance` is itself
    // epoch-gated, so a date change while the timetable is still loading
    // cannot land a stale day's records.
    this.withClasses(() => {
      if (attendanceEpoch === this.attendanceEpoch) {
        this.selectedClassId.set(
          pickDefaultClass(this.dayClasses(), this.selectedDate(), new Date())?.id ?? null,
        );
      }
      this.fetchAttendance(attendanceEpoch, settle);
      // The topic row and the missing regulars read the same slot the
      // records do.
      this.loadLesson();
      this.loadRegulars();
    });
  }

  /**
   * Runs `then` with the timetable known. Loaded on the first call, cached
   * after — a class list does not change while the check-in is open.
   *
   * On failure the page degrades rather than blocks: the roster is still
   * there and a presence on the day is still a presence. It says so, because
   * from here on marks go in without a class.
   */
  private withClasses(then: () => void): void {
    if (this.classesLoaded) {
      then();
      return;
    }

    this.academyClassService.list().subscribe({
      next: (classes) => {
        this.classes.set(classes);
        this.classesLoaded = true;
        then();
      },
      error: () => {
        this.classesLoaded = true;
        this.toastError(this.translate.instant('attendance.daily.toast.loadClassesError'));
        then();
      },
    });
  }

  /**
   * Fetches ONLY the athletes list — used by filter/sort changes
   * (q, belt, sort_by, sort_order). Crucially does NOT touch the
   * present-map, so an in-flight optimistic mark can't be clobbered
   * by a parallel attendance refetch racing the POST.
   */
  private loadAthletes(onLoaded?: () => void): void {
    this.loading.set(true);
    const epoch = ++this.loadEpoch;
    this.fetchAthletes(epoch, (ok) => {
      if (epoch === this.loadEpoch) {
        this.loading.set(false);
        // Only on the answer for this very load: a failed one leaves the
        // previous list on screen, and acting on it would act on the wrong
        // people.
        if (ok) onLoaded?.();
      }
    });
  }

  /**
   * The actual athletes-list HTTP call. Epoch-gated so a stale
   * response from a previous filter / sort / date change can no
   * longer clobber the current state.
   */
  private fetchAthletes(epoch: number, settle: (ok: boolean) => void): void {
    const belt = this.selectedBelt();
    const sortBy = this.sortField();
    const q = this.searchTerm().trim();
    this.athleteService
      .list({
        status: 'active',
        ...(belt ? { belt } : {}),
        ...(q ? { q } : {}),
        ...(sortBy ? { sortBy, sortOrder: this.sortOrder() } : {}),
        perPage: CHECK_IN_ROSTER_SIZE,
      })
      .subscribe({
        next: (page) => {
          if (epoch === this.loadEpoch) {
            this.athletes.set(page.data);
            this.totalActiveAthletes.set(page.meta.total);
            this.listedTerm.set(q);
          }
          settle(true);
        },
        error: () => {
          if (epoch === this.loadEpoch) {
            this.toastError(this.translate.instant('attendance.daily.toast.loadAthletesError'));
          }
          settle(false);
        },
      });
  }

  /**
   * The attendance-records HTTP call. Same epoch-gated pattern.
   * Rebuilds the present-map from the server's records on success
   * — ONLY safe to call when no mark/unmark is in flight, hence the
   * filter/sort handlers route through `loadAthletes()` instead of
   * `loadDay()` to avoid clobbering an optimistic update.
   */
  private fetchAttendance(epoch: number, settle: () => void): void {
    const date = toLocalDateString(this.selectedDate());
    const classId = this.selectedClassId() ?? undefined;
    this.attendanceService.getDaily(date, { classId }).subscribe({
      next: (records) => {
        if (epoch === this.attendanceEpoch) {
          const map = new Map<number, number>();
          const selfSet = new Set<number>();
          for (const r of records) {
            map.set(r.athlete_id, r.id);
            if (r.source === 'self') selfSet.add(r.athlete_id);
          }
          this.presentMap.set(map);
          this.selfMarkedSet.set(selfSet);
          this.presentEpoch.set(epoch);
          // Only an empty room has anyone to bring over (#1930).
          if (map.size === 0) this.loadCarryOver(epoch);
        }
        settle();
      },
      error: () => {
        if (epoch === this.attendanceEpoch) {
          this.toastError(this.translate.instant('attendance.daily.toast.loadAttendanceError'));
        }
        settle();
      },
    });
  }

  protected isPresent(athleteId: number): boolean {
    return this.presentMap().has(athleteId);
  }

  /** Was today's row pinned by the athlete via `POST /me/attendance/today`
   *  (#960). True only for active rows where source === 'self'. */
  protected isSelfMarked(athleteId: number): boolean {
    return this.selfMarkedSet().has(athleteId);
  }

  protected isInflight(athleteId: number): boolean {
    return this.inflight().has(athleteId);
  }

  /**
   * The single user-facing entry point. Routes to mark or unmark based on
   * current state. Disabled (no-op) while a request for this athlete is
   * already in flight.
   */
  protected togglePresent(athlete: Markable): void {
    // Not while the day is still loading (#1562): before the timetable has
    // answered, `selectedClassId` is null and a tap would record a
    // class-less presence on a day that has classes — a row that then shows
    // as present in every one of them. The table is dimmed and the phone
    // shows skeletons meanwhile, so the refusal is visible, not silent.
    if (this.loading() || this.isInflight(athlete.id)) {
      return;
    }
    if (this.onThePhone()) {
      // A short buzz: the coach's eyes are on the mat, not the screen.
      navigator.vibrate?.(15);
    }
    const existingRecordId = this.presentMap().get(athlete.id);
    if (existingRecordId !== undefined && existingRecordId > 0) {
      this.unmark(athlete, existingRecordId);
    } else {
      this.mark(athlete);
    }
  }

  /**
   * Optimistic mark. Adds a sentinel `-1` record-id so the row flips
   * to present immediately, then fires the POST. On success we swap in
   * the real record id; on error we roll back.
   *
   * `silent` skips the success toast — used when the caller is itself
   * an undo of a previous unmark (PRD § P0.3: "No new toast is emitted
   * for the undo itself").
   */
  private mark(
    athlete: Markable,
    options: { silent?: boolean; settled?: (ok: boolean) => void } = {},
  ): void {
    const date = toLocalDateString(this.selectedDate());
    this.optimisticAdd(athlete.id, -1);
    this.markInflight(athlete.id, true);

    const classId = this.selectedClassId();
    this.attendanceService
      .markBulk({
        date,
        athlete_ids: [athlete.id],
        ...(classId !== null ? { academy_class_id: classId } : {}),
      })
      .subscribe({
        next: (records) => {
          // The server returns the FULL "now present on this date" list for
          // the posted athletes; idempotent path returns the existing record.
          // Either way we want the record id for this athlete.
          const fresh = records.find((r) => r.athlete_id === athlete.id);
          if (fresh) {
            this.optimisticAdd(athlete.id, fresh.id);
            if (!options.silent && !this.onThePhone()) {
              this.toastUndo(
                this.translate.instant('attendance.daily.toast.markedPresent', {
                  name: `${athlete.first_name} ${athlete.last_name}`,
                }),
                () => this.unmark(athlete, fresh.id, { silent: true }),
              );
            }
          }
          this.markInflight(athlete.id, false);
          options.settled?.(true);
        },
        error: () => {
          this.optimisticRemove(athlete.id);
          this.markInflight(athlete.id, false);
          if (options.settled) {
            options.settled(false);
            return;
          }
          this.toastError(
            this.translate.instant('attendance.daily.toast.markError', {
              name: athlete.first_name,
            }),
          );
        },
      });
  }

  /**
   * Optimistic unmark. Removes from the present-map immediately, fires
   * the DELETE, on error puts it back. `silent` skips the success toast
   * for the same Undo-of-undo reason as `mark()`.
   */
  private unmark(athlete: Markable, recordId: number, options: { silent?: boolean } = {}): void {
    this.optimisticRemove(athlete.id);
    this.markInflight(athlete.id, true);

    this.attendanceService.delete(recordId).subscribe({
      next: () => {
        if (!options.silent && !this.onThePhone()) {
          this.toastUndo(
            this.translate.instant('attendance.daily.toast.unmarked', {
              name: `${athlete.first_name} ${athlete.last_name}`,
            }),
            () => this.mark(athlete, { silent: true }),
          );
        }
        this.markInflight(athlete.id, false);
      },
      error: () => {
        this.optimisticAdd(athlete.id, recordId);
        this.markInflight(athlete.id, false);
        this.toastError(
          this.translate.instant('attendance.daily.toast.unmarkError', {
            name: athlete.first_name,
          }),
        );
      },
    });
  }

  /**
   * The picker moved. `next` is null whenever the text in the field does not
   * parse — an emptied field, and every half-typed date on the way to a
   * whole one: `<p-datepicker>` catches its own parse error and reports null.
   *
   * `selectedDate` is this page's spine: the title, the weekday's classes,
   * the wire date, the lesson. Letting null through put it into a signal
   * typed `Date`, and from there `dayClasses` read `.getDay()` on it once
   * per change-detection pass — a console filling with TypeErrors until
   * somebody typed a valid date (#1638).
   *
   * So null simply does not reach the signal, and — this is the part the
   * first attempt got wrong — it does not write anything back either. A
   * write-back on every unparsable keystroke restores the old text under
   * the cursor, which makes a date impossible to type by hand. The field is
   * put right on the way out instead, in `restoreDateDisplay`.
   */
  protected onDateChanged(next: Date | null): void {
    if (next === null) {
      return;
    }
    this.selectedDate.set(next);
    this.loadDay();
  }

  /**
   * Leaving the field with unparsable text in it (or none at all) puts the
   * day back on screen. A check-in is always *for a day*, so a blank field
   * has one meaning: the day we are on. Runs on blur and on the overlay
   * closing; a new `Date` on purpose, so `ngModel` sees a changed reference
   * and re-renders — the same instance would not.
   */
  protected restoreDateDisplay(): void {
    this.selectedDate.set(new Date(this.selectedDate()));
  }

  // ── Class picker (#1562) ───────────────────────────────────────────────────

  /** A chip tap: same day, different lesson — only the records move. */
  protected selectClass(id: number): void {
    if (id === this.selectedClassId() || this.anyInflight() || this.loading()) {
      return;
    }
    // An Undo on screen belongs to the room it was made in: pressed after
    // the switch it would untick people in this one (#1930).
    this.messageService.clear();
    this.selectedClassId.set(id);
    this.loadAttendanceOnly();
    this.loadLesson();
    this.loadRegulars();
  }

  // ── What the lesson covered (#1564) ────────────────────────────────────────

  /** The selected class's lesson for the day, or null while nobody has tagged it. */
  protected readonly lesson = signal<Lesson | null>(null);
  protected readonly lessonSheetOpen = signal<boolean>(false);

  /**
   * The topics as one line — "Armbar · Triangle". Collapsed to a summary
   * because the row sits above the roster, which is what the page is for:
   * the picker is one tap away, and shut the rest of the time.
   */
  /**
   * The topics on today's lesson, as they are shown: one chip each.
   *
   * They used to be one string joined with ` · `, and a middle dot is not a
   * boundary the eye trusts — a four-topic line read as one run-on phrase.
   * Worse, the payload carries `parent_name` and the join threw it away, so
   * "Staple" and its own position "Passing the knee shield" sat side by side
   * looking like two separate techniques.
   *
   * The chips are the ones the lesson sheet draws — the dialog this button
   * opens — so the summary looks like the thing it leads to.
   */
  protected readonly topicChips = computed<readonly LessonTopic[]>(
    () => this.lesson()?.topics ?? [],
  );

  /** Still a string, for the accessible name and the empty check. */
  protected readonly topicSummary = computed<string | null>(() => {
    const topics = this.topicChips();
    if (topics.length === 0) return null;
    return topics.map((t) => t.name).join(' · ');
  });

  /** `YYYY-MM-DD` for the selected day — what the lesson endpoints key on. */
  protected readonly selectedDateIso = computed<string>(() =>
    toLocalDateString(this.selectedDate()),
  );

  protected readonly selectedClassName = computed<string>(
    () => this.dayClasses().find((c) => c.id === this.selectedClassId())?.name ?? '',
  );

  protected openLessonSheet(): void {
    if (this.selectedClassId() === null) return;
    this.lessonSheetOpen.set(true);
  }

  protected onLessonSaved(lesson: Lesson): void {
    this.lesson.set(lesson);
  }

  /**
   * Reads the lesson for the selected slot. Epoch-gated on the same counter
   * the records use: a late answer for yesterday's class must not label
   * today's.
   */
  private loadLesson(): void {
    const classId = this.selectedClassId();
    if (classId === null) {
      this.lesson.set(null);
      return;
    }

    const epoch = this.attendanceEpoch;
    // Bare subscribe, like every other one-shot read on this page: HttpClient
    // completes, so there is nothing to unsubscribe from.
    this.lessonService.get(classId, this.selectedDateIso()).subscribe({
      next: (lesson) => {
        if (epoch === this.attendanceEpoch) this.lesson.set(lesson);
      },
      // A topic row that fails to load is not worth a toast over the roster:
      // it renders as "nothing tagged yet", which is recoverable by opening
      // it.
      error: () => {
        if (epoch === this.attendanceEpoch) this.lesson.set(null);
      },
    });
  }

  // ── Who usually comes and is not here (#1730) ─────────────────────────────

  /** Which load's records `presentMap` holds. */
  private readonly presentEpoch = signal<number>(-1);
  private readonly regularsAnswer = signal<{ epoch: number; regulars: ClassRegulars } | null>(null);
  protected readonly regularsFailed = signal<boolean>(false);

  /**
   * The selected class's regulars, once the room they are subtracted from is
   * the same load's. Without the wait, a first load or a chip tap whose
   * regulars answered before its records would flash every regular as
   * missing, then correct itself — a wrong answer is worse than a moment of
   * none.
   */
  protected readonly regulars = computed<ClassRegulars | null>(() => {
    const answer = this.regularsAnswer();
    return answer !== null && answer.epoch === this.presentEpoch() ? answer.regulars : null;
  });

  /**
   * The phone's register in two parts (#2035): **«Chi viene di solito»**, the
   * class's regulars, the most faithful first, then everyone else in the
   * roster's order. Set when the room loads, so a tap never moves a row. One
   * list while searching or filtering, or when the class has no regulars.
   */
  protected readonly registerSections = computed<readonly RegisterSection[]>(() => {
    const athletes = this.athletes();
    const regulars = this.regulars()?.data ?? [];
    if (this.searchTerm() !== '' || this.selectedBelt() !== '' || regulars.length === 0) {
      return [{ key: 'all', label: null, athletes }];
    }
    const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
    const first = [...regulars]
      .sort((a, b) => b.attended - a.attended)
      .flatMap((regular) => byId.get(regular.id) ?? []);
    if (first.length === 0) {
      return [{ key: 'all', label: null, athletes }];
    }
    const firstIds = new Set(first.map((athlete) => athlete.id));
    return [
      { key: 'regulars', label: 'attendance.daily.register.regulars', athletes: first },
      {
        key: 'others',
        label: 'attendance.daily.register.others',
        athletes: athletes.filter((athlete) => !firstIds.has(athlete.id)),
      },
    ];
  });

  /**
   * The phone's register shows once the class's regulars have answered, or
   * failed: drawn before, it would reorder under the coach's thumb when they
   * arrived. Their answer is enough, even when the day's records failed and
   * `regulars()` waits for them: the roster then shows as one list.
   */
  protected readonly registerReady = computed<boolean>(
    () =>
      !this.loading() &&
      (this.selectedClassId() === null || this.regularsAnswer() !== null || this.regularsFailed()),
  );

  /**
   * Once per (day, class) — on the day's load and on a chip — never per
   * tap: the panel subtracts `presentMap` itself, so a tick takes someone
   * off it with nothing asked of the server. Epoch-gated on the counter the
   * records use, so a slow answer for the previous class cannot land over
   * the one on screen.
   */
  protected loadRegulars(): void {
    this.regularsAnswer.set(null);
    this.regularsFailed.set(false);
    const classId = this.selectedClassId();
    if (classId === null) return;

    const epoch = this.attendanceEpoch;
    this.attendanceService.regulars(this.selectedDateIso(), classId).subscribe({
      next: (regulars) => {
        if (epoch === this.attendanceEpoch) this.regularsAnswer.set({ epoch, regulars });
      },
      error: () => {
        if (epoch === this.attendanceEpoch) this.regularsFailed.set(true);
      },
    });
  }

  /**
   * "Fundamentals · 19:00" — the label for a day with exactly one class,
   * built here so the template stays a projection.
   */
  protected classLabel(c: AcademyClass): string {
    return c.starts_at ? `${c.name} · ${c.starts_at}` : c.name;
  }

  /**
   * Refetch the records and nothing else: the roster has not changed, and
   * re-reading it would race an in-flight mark for no reason.
   */
  private loadAttendanceOnly(): void {
    this.loading.set(true);
    const epoch = ++this.attendanceEpoch;
    this.fetchAttendance(epoch, () => {
      if (epoch === this.attendanceEpoch) {
        this.loading.set(false);
      }
    });
  }

  // ── Bring the earlier class over (#1930) ──────────────────────────────────
  // At 20:00, seven of the twelve from 19:00 stay on for the advanced class.
  // They are already on the register once; ticking them again one by one is
  // the work the earlier tick already did. When this class is empty and the
  // one before it had people, one button copies that room across.

  /** The class right before the selected one on this day, by start time. */
  protected readonly previousClass = computed<AcademyClass | null>(() => {
    const classes = this.dayClasses();
    const selected = classes.find((c) => c.id === this.selectedClassId());
    const startsAt = selected?.starts_at ?? null;
    if (startsAt === null) return null;

    let previous: AcademyClass | null = null;
    for (const c of classes) {
      if (c.starts_at === null || c.starts_at >= startsAt) continue;
      if (previous === null || c.starts_at > (previous.starts_at ?? '')) previous = c;
    }
    return previous;
  });

  /** Who the earlier class had, for the load of the room it would fill. */
  private readonly carryAnswer = signal<{
    epoch: number;
    classId: number;
    athleteIds: readonly number[];
  } | null>(null);

  /**
   * What can be brought over: the earlier class and its people, while this
   * class is still empty and the answer is about the room on screen. Gone the
   * moment anyone is ticked here — the button is for an empty room, and
   * pressing it twice would be a no-op dressed as an action.
   */
  protected readonly carryOver = computed<{
    from: AcademyClass;
    time: string;
    athleteIds: readonly number[];
  } | null>(() => {
    const answer = this.carryAnswer();
    const from = this.previousClass();
    if (answer === null || from === null || answer.classId !== from.id) return null;
    if (answer.epoch !== this.presentEpoch() || answer.athleteIds.length === 0) return null;
    if (this.presentMap().size > 0) return null;
    return { from, time: (from.starts_at ?? '').slice(0, 5), athleteIds: answer.athleteIds };
  });

  /**
   * Reads the earlier class's room. Quiet on failure: the offer is a
   * shortcut, and the register works exactly as before without it.
   */
  private loadCarryOver(epoch: number): void {
    this.carryAnswer.set(null);
    const from = this.previousClass();
    if (from === null) return;

    this.attendanceService.getDaily(this.selectedDateIso(), { classId: from.id }).subscribe({
      next: (records) => {
        if (epoch !== this.attendanceEpoch) return;
        const athleteIds = [...new Set(records.map((r) => r.athlete_id))];
        this.carryAnswer.set({ epoch, classId: from.id, athleteIds });
      },
      error: () => undefined,
    });
  }

  /**
   * One request for the whole room: the bulk endpoint the single tick already
   * uses. Optimistic like a tick; one Undo takes them all back. Under
   * per-lesson carnets each holder spends an entry on this lesson too — the
   * academy's rule, and correct, but not something the toast may hide.
   */
  protected bringOver(): void {
    const offer = this.carryOver();
    const classId = this.selectedClassId();
    if (offer === null || classId === null || this.loading() || this.anyInflight()) return;

    const ids = [...offer.athleteIds];
    const roomKey = this.roomKey();
    for (const id of ids) {
      this.optimisticAdd(id, -1);
      this.markInflight(id, true);
    }

    this.attendanceService
      .markBulk({ date: this.selectedDateIso(), athlete_ids: ids, academy_class_id: classId })
      .subscribe({
        next: (records) => {
          const created = records.filter((r) => ids.includes(r.athlete_id));
          for (const r of created) this.optimisticAdd(r.athlete_id, r.id);
          for (const id of ids) this.markInflight(id, false);
          this.toastUndo(this.carriedMessage(created, offer.time), () =>
            this.takeBack(created, roomKey),
          );
        },
        error: () => {
          for (const id of ids) {
            this.optimisticRemove(id);
            this.markInflight(id, false);
          }
          this.toastError(this.translate.instant('attendance.daily.carryOver.error'));
        },
      });
  }

  /**
   * "7 segnati come alle 19:00", and the carnet note where it applies: when
   * entries count per lesson and a carried athlete may spend one. #1930 asks
   * that a spent entry is never hidden, so the note stays unless the page can
   * vouch for everyone carried — an extra note costs a line, a missing one
   * costs an entry nobody was told about.
   */
  private carriedMessage(records: readonly AttendanceRecord[], time: string): string {
    const count = records.length;
    const key =
      count === 1 ? 'attendance.daily.carryOver.doneOne' : 'attendance.daily.carryOver.doneOther';
    const done = this.translate.instant(key, { count, time });
    const academy = this.academyService.academy();
    const perLesson = (academy?.carnet_entry_unit ?? 'lesson') === 'lesson';
    return perLesson && this.mayHoldACarnet(records.map((r) => r.athlete_id))
      ? `${done} ${this.translate.instant('attendance.daily.carryOver.carnetNote')}`
      : done;
  }

  /**
   * Whether any of these athletes may spend an entry. Only answerable as "no"
   * when the page knows them all: today (an athlete's `active_carnet` is
   * today's — the carnet that covered a backfilled day may have run out or
   * expired since, and reconciliation still charges it), and every one of
   * them on the loaded list (a search, a belt, the page's cap or someone no
   * longer active can keep them off it). Otherwise: yes, say it.
   */
  private mayHoldACarnet(athleteIds: readonly number[]): boolean {
    if (this.selectedDateIso() !== toLocalDateString(new Date())) return true;
    const listed = new Map(this.athletes().map((a) => [a.id, a]));
    return athleteIds.some((id) => {
      const athlete = listed.get(id);
      return athlete === undefined || (athlete.active_carnet ?? null) !== null;
    });
  }

  /** Which room is on screen: the day and the class. */
  private roomKey(): string {
    return `${this.selectedDateIso()}|${this.selectedClassId() ?? ''}`;
  }

  /**
   * The Undo: every presence the button wrote, deleted, as one gesture. The
   * deletes are right wherever the owner is now; the ticks on screen move
   * only if the screen still shows the room they were written in — the same
   * athletes can be really present in the class on screen now.
   */
  private takeBack(records: readonly AttendanceRecord[], roomKey: string): void {
    const sameRoom = roomKey === this.roomKey();
    if (sameRoom) {
      for (const r of records) {
        this.optimisticRemove(r.athlete_id);
        this.markInflight(r.athlete_id, true);
      }
    }
    forkJoin(records.map((r) => this.attendanceService.delete(r.id))).subscribe({
      next: () => {
        if (sameRoom) for (const r of records) this.markInflight(r.athlete_id, false);
      },
      error: () => {
        if (sameRoom) for (const r of records) this.markInflight(r.athlete_id, false);
        // Some went, some did not: the server is the only honest answer.
        this.loadAttendanceOnly();
        this.toastError(this.translate.instant('attendance.daily.carryOver.undoError'));
      },
    });
  }

  // ── Filter handlers (#184) ─────────────────────────────────────────────────

  /** Each keystroke pushes into the debounce pipeline. */
  protected onSearchInput(value: string): void {
    this.searchInputSubject.next(value);
  }

  protected applySearch(q: string, onLoaded?: () => void): void {
    this.searchTerm.set(q.trim());
    // Filter/sort changes reload the ROSTER only — the date hasn't
    // moved, so the attendance records on the wire are unchanged
    // and a parallel re-fetch would race any in-flight optimistic
    // mark on the present-map.
    this.loadAthletes(onLoaded);
  }

  // ── Type a name, press Enter (#1930) ───────────────────────────────────────
  // Twelve people in five minutes at the door: a search, a wait, a reach for
  // the mouse and a clear, per person, is the queue. Enter marks the one
  // match and hands the box back empty for the next name.

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** What is in the box right now — ahead of the search, while typing. */
  private typed(): string {
    return this.searchInput()?.nativeElement.value.trim() ?? '';
  }

  protected onSearchEnter(): void {
    const typed = this.typed();
    if (typed === '') return;
    if (typed === this.listedTerm() && !this.loading()) {
      this.markOnlyMatch();
      return;
    }
    // The list on screen does not answer this name (Enter beat the typing
    // pause, its answer is still on the way, or its search failed): search
    // now, and decide when the answer lands.
    this.applySearch(typed, () => this.markOnlyMatch());
  }

  protected onSearchEscape(): void {
    this.clearSearch();
  }

  /**
   * One person matches, and they are not on the mat yet: mark them, through
   * the same path as a tap on their row. Nobody otherwise — two matches is a
   * choice the owner makes, not one Enter makes for them, and Enter never
   * takes anyone off: that is what the tap on the row is for.
   */
  private markOnlyMatch(): void {
    // The list on screen must answer exactly what is in the box — never a
    // search still on its way, nor the one before a search that failed.
    if (this.typed() !== this.listedTerm()) return;
    const matches = this.athletes();
    if (matches.length !== 1 || this.totalActiveAthletes() !== 1) return;

    const [only] = matches;
    if (this.isPresent(only.id)) return;
    this.togglePresent(only);
    // Refused (the day is still loading): leave the name where it is.
    if (this.isInflight(only.id)) this.clearSearch();
  }

  /** The box empty, the whole register back, the cursor still in the box. */
  private clearSearch(): void {
    const input = this.searchInput()?.nativeElement;
    if (input !== undefined) input.value = '';
    // Also cancels a keystroke still waiting out its pause.
    this.searchInputSubject.next('');
    if (this.searchTerm() !== '') this.applySearch('');
  }

  /** "Presente" on a regular in the panel below (#1930). Only ever marks. */
  protected markRegular(regular: ClassRegular): void {
    if (this.isPresent(regular.id)) return;
    this.togglePresent(regular);
  }

  protected onBeltChange(belt: Belt | ''): void {
    this.selectedBelt.set(belt);
    this.loadAthletes();
  }

  /** Active-filter badge count for the mobile filter-sheet (#711). */
  protected readonly activeFilterCount = computed<number>(() =>
    this.selectedBelt() !== '' ? 1 : 0,
  );

  /** No-op apply handler — on*Change loads eagerly; apply just closes. */
  protected noop(): void {
    // intentionally empty — see athletes-list parallel.
  }

  /** Reset every dropdown in one shot from the mobile filter-sheet (#711). */
  protected resetFilters(): void {
    this.selectedBelt.set('');
    this.loadAthletes();
  }

  // ── Sorting (#1526) ────────────────────────────────────────────────────────
  // The same two controls the roster has, from the same place: the 4-state
  // name header and the belt button in the filter row. This page had PrimeNG's
  // stock 2-state `pSortableColumn` on the name and no belt control at all —
  // `onSort()` allowlisted `belt`, but nothing on the page could ever emit it.
  //
  // Sort changes reload the ROSTER only, like the filters above: the date has
  // not moved, so the attendance records on the wire are unchanged and a
  // parallel re-fetch would race any in-flight optimistic mark.

  protected cycleFullNameSort(): void {
    const next = nextNameSort(this.sortState());
    this.sortField.set(next.field);
    this.sortOrder.set(next.order);
    this.loadAthletes();
  }

  protected cycleBeltSort(): void {
    const next = nextBeltSort(this.sortState());
    this.sortField.set(next.field);
    this.sortOrder.set(next.order);
    this.loadAthletes();
  }

  /** `F↑` / `L↓`, or null when a name is not what the list is sorted by. */
  protected readonly fullNameSortLabel = computed<string | null>(() =>
    nameSortSignifier(this.sortState()),
  );

  /** Plain-English tooltip for the Full name header — Norman § signifier. */
  protected readonly fullNameSortTooltip = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return this.translate.instant(nameSortTooltipKey(this.sortState()));
  });

  /** Direction for AT; the lead reaches it through the button's aria-label. */
  protected readonly fullNameAriaSort = computed<'ascending' | 'descending' | 'none'>(() =>
    nameSortAria(this.sortState()),
  );

  // ── Helpers ────────────────────────────────────────────────────────

  private optimisticAdd(athleteId: number, recordId: number): void {
    const next = new Map(this.presentMap());
    next.set(athleteId, recordId);
    this.presentMap.set(next);
  }

  private optimisticRemove(athleteId: number): void {
    const next = new Map(this.presentMap());
    next.delete(athleteId);
    this.presentMap.set(next);
    // Drop from the self-marked set too — the row is gone, the badge
    // should disappear with it.
    if (this.selfMarkedSet().has(athleteId)) {
      const nextSet = new Set(this.selfMarkedSet());
      nextSet.delete(athleteId);
      this.selfMarkedSet.set(nextSet);
    }
  }

  private markInflight(athleteId: number, on: boolean): void {
    const next = new Set(this.inflight());
    if (on) {
      next.add(athleteId);
    } else {
      next.delete(athleteId);
    }
    this.inflight.set(next);
  }

  /** The payment chip for one phone row, or `null` when it shows none. */
  protected payChip(athlete: Athlete): PayChip | null {
    return this.showsMoney() ? this.money.chipFor(athlete) : null;
  }

  /** Someone new at the door (#1939): their sheet, with what was typed. */
  protected openNewPerson(typed: string): void {
    const active = document.activeElement;
    this.newPersonOpener = active instanceof HTMLElement ? active : null;
    this.addedId = null;
    this.newPerson.set(typed);
  }

  /**
   * Added: the search shows them alone, marked present in the class on
   * screen, and the toast links to the rest of their record. A mark that
   * fails leaves them added, and the toast says which half went through.
   */
  protected onPersonAdded(athlete: Athlete): void {
    this.newPerson.set(null);
    this.addedId = athlete.id;
    const name = `${athlete.first_name} ${athlete.last_name}`;
    this.applySearch(name, () => this.focusAdded());
    this.mark(athlete, {
      silent: true,
      settled: (ok) => {
        this.messageService.clear();
        this.messageService.add({
          severity: ok ? 'success' : 'warn',
          summary: this.translate.instant(
            ok ? 'attendance.daily.newPerson.added' : 'attendance.daily.newPerson.addedNotMarked',
            { name },
          ),
          data: { record: ['/dashboard/athletes', athlete.id, 'edit'] },
          life: 6000,
        });
      },
    });
  }

  /**
   * Their sheet closed with the keyboard inside it. Cancelled: back to what
   * opened it. Added: nothing yet, because the row is not listed until the
   * search answers (`focusAdded`); the search box would raise the phone's
   * keyboard over the register.
   */
  protected returnFocusFromNewPerson(): void {
    if (this.addedId !== null || !this.keyboardFree()) return;
    (this.newPersonOpener?.isConnected
      ? this.newPersonOpener
      : this.searchInput()?.nativeElement
    )?.focus();
  }

  /** The new person's row, once the search lists it: the phone's card or the PC's row. */
  private focusAdded(): void {
    const id = this.addedId;
    if (id === null) return;
    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        if (!this.keyboardFree()) return;
        Array.from(
          this.host.nativeElement.querySelectorAll<HTMLElement>(
            `[data-cy="attendance-card-${id}"], [data-cy="attendance-row-${id}"]`,
          ),
        )
          .find((el) => el.offsetParent !== null)
          ?.focus();
      }),
    );
  }

  /** Nobody else has the keyboard: it is on the page, or in the sheet that went. */
  private keyboardFree(): boolean {
    const active = document.activeElement;
    return (
      active === null ||
      active === document.body ||
      (active instanceof HTMLElement && active.closest('.new-person-dialog') !== null)
    );
  }

  protected openPay(athlete: Athlete, chip: PayChip): void {
    if (chip.kind !== 'due') return;
    this.paidFrom = athlete.id;
    this.paying.set({ athlete, month: chip.month });
  }

  /**
   * The sheet closed with the keyboard inside it (Escape, ✕, a payment):
   * hand it back to the row rather than to `<body>` at the top of the page,
   * as the lesson sheet does (#2001). The chip when it is still there; after
   * a payment it may be a label, and the row's toggle takes it.
   */
  protected returnFocusFromPay(): void {
    const id = this.paidFrom;
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && active.closest('.pay-sheet-dialog') !== null;
    if (id === null || (active !== null && active !== document.body && !inside)) return;
    const root = this.host.nativeElement;
    const target =
      root.querySelector<HTMLElement>(`[data-cy="attendance-pay-${id}"] button`) ??
      root.querySelector<HTMLElement>(`[data-cy="attendance-card-${id}"]`);
    target?.focus();
  }

  protected closePay(): void {
    this.paying.set(null);
  }

  /**
   * Recorded: the sheet closes, the chip moves on, and the toast can take it
   * back. Not one the server already held (a payment from the PC, arrived in
   * a sync): undoing that would delete a payment this screen never made.
   */
  protected onPaid({ athlete, payment, created }: PayRecorded): void {
    this.paying.set(null);
    navigator.vibrate?.(15);
    const name = `${athlete.first_name} ${athlete.last_name}`;
    if (!created) {
      this.messageService.clear();
      this.messageService.add({
        severity: 'info',
        summary: this.translate.instant('attendance.daily.pay.toast.already', { name }),
        life: 4000,
      });
      return;
    }
    this.toastUndo(this.translate.instant('attendance.daily.pay.toast.recorded', { name }), () =>
      this.money.undo(athlete, payment).subscribe({
        next: () => this.messageService.clear(),
        error: () =>
          this.toastError(this.translate.instant('attendance.daily.pay.toast.undoError')),
      }),
    );
  }

  private toastUndo(summary: string, undo: () => void): void {
    this.messageService.clear();
    this.messageService.add({
      severity: 'success',
      summary,
      // The custom toast template (see html) reads .data.undo and renders
      // a button that calls it. PrimeNG dismisses the toast on its own
      // after `life` ms; the user has 5 seconds to act.
      data: { undo },
      life: 5000,
    });
  }

  private toastError(summary: string): void {
    this.messageService.clear();
    this.messageService.add({
      severity: 'error',
      summary,
      life: 4000,
    });
  }
}
