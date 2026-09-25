import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  runInInjectionContext,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { Popover, PopoverModule } from 'primeng/popover';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyClass, AcademyClassService } from '../../../../core/services/academy-class.service';
import { TrainingMode } from '../../../../core/services/academy.service';
import { LanguageService } from '../../../../core/services/language.service';
import {
  CalendarLessonState,
  CoveragePosition,
  StatsService,
  SyllabusCalendar,
} from '../../../../core/services/stats.service';
import { whatsappShareLink } from '../../../../shared/utils/contact-links';
import { addDays, admitsTopic, localIso } from '../../../../shared/utils/class-occurrences';
import { localeFor } from '../../../../shared/utils/locale';
import { LessonSheetComponent } from '../../../lessons/lesson-sheet/lesson-sheet.component';
import {
  MapCell,
  MapRow,
  PlanOption,
  WeekLessons,
  buildRows,
  cellLessons,
  mondayOf,
  monthStarts,
  planOptions,
  positionSeason,
} from './season-map.model';
import { publishedWeek, weekPlanText } from './week-plan.model';

/**
 * What the panel shows: one week of one position (a cell, the pointer
 * shortcut), or the position's whole season (its name — the control every
 * keyboard, screen reader and fingertip reaches).
 */
interface OpenPanel {
  readonly mode: 'week' | 'season';
  readonly positionId: number;
  readonly name: string;
  readonly groups: readonly WeekLessons[];
  /**
   * Where a plan can land (#1859): the classes of that week, or of the next
   * two, that may teach this position. Null when planning is not offered —
   * a week already past, a season gone by, an academy with no timetable.
   */
  readonly plan: readonly PlanOption[] | null;
}

/** The lesson being planned from the map, opened in the lesson sheet. */
interface PlanningSlot {
  readonly classId: number;
  readonly heldOn: string;
  readonly className: string;
  readonly positionId: number;
}

/** How far ahead a position's season offers a lesson to plan: the next two weeks. */
const SEASON_PLAN_DAYS = 13;

/**
 * The first day a plan can land on. The calendar's `today` is the server's
 * date, in UTC: for an hour or two after midnight in Rome it is still
 * yesterday, and last night's class would be offered as a plan.
 */
function planningToday(calendar: SyllabusCalendar): string {
  const local = localIso(new Date());
  return local > calendar.today ? local : calendar.today;
}

/**
 * The last day a plan can land on: `to`, or the season's end if that comes
 * first. The map draws the season's last week whole, so a season closing on
 * a Tuesday still shows that week's Wednesday — which belongs to the next one.
 */
function planningUntil(calendar: SyllabusCalendar, to: string): string {
  return to < calendar.season.end ? to : calendar.season.end;
}

/** Short weekday names for the group message, Monday first. */
const WEEKDAY_KEYS = [
  'weekdays.mon',
  'weekdays.tue',
  'weekdays.wed',
  'weekdays.thu',
  'weekdays.fri',
  'weekdays.sat',
  'weekdays.sun',
] as const;

/** Below this the panel is a bottom sheet; the popover is for a wide window. */
const WIDE_QUERY = '(min-width: 768px)';

/** The two states that carry a tag; a held lesson needs none. */
const STATE_KEYS: Record<Exclude<CalendarLessonState, 'held'>, string> = {
  planned: 'stats.syllabus.map.state.planned',
  unconfirmed: 'stats.syllabus.map.state.unconfirmed',
};

/**
 * The season map (#1858): each position, week by week.
 *
 * The coverage report says how much of a position was taught; this says
 * when. Half guard in October and never again is a gap a fraction cannot
 * show, and it is the gap a programme is planned around. The row keeps the
 * report's fraction at its end, so the map replaces the old bars rather than
 * sitting beside them.
 *
 * The rows are the report's (its order, its fraction, its filter). The map
 * fetches only the weeks, so a failure here costs the weeks and nothing else:
 * the names and fractions are still drawn.
 */
@Component({
  selector: 'app-season-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    ButtonModule,
    DrawerModule,
    PopoverModule,
    SkeletonModule,
    LessonSheetComponent,
  ],
  templateUrl: './season-map.component.html',
  styleUrl: './season-map.component.scss',
})
export class SeasonMapComponent {
  private readonly stats = inject(StatsService);
  private readonly classService = inject(AcademyClassService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly messages = inject(MessageService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** The coverage report's rows: they decide which positions are drawn, and in which order. */
  readonly positions = input.required<readonly CoveragePosition[]>();
  readonly seasonsBack = input<number>(0);
  /** The report's filter, or null for the whole programme. */
  readonly kind = input<TrainingMode | null>(null);

  protected readonly calendar = signal<SyllabusCalendar | null>(null);
  protected readonly failed = signal<boolean>(false);
  /** What the panel is showing, or null before anything was opened. */
  protected readonly panel = signal<OpenPanel | null>(null);
  /** The bottom sheet, the panel's form in a narrow window. */
  protected readonly drawerOpen = signal<boolean>(false);
  /** Wide enough for a popover beside the map; below that, a bottom sheet. */
  protected readonly wide = signal<boolean>(true);
  /** The timetable, for what a future week can be planned into (#1859). */
  protected readonly classes = signal<readonly AcademyClass[]>([]);
  /** The lesson being planned from the map, and whether its sheet is open. */
  protected readonly planning = signal<PlanningSlot | null>(null);
  protected readonly planSheetOpen = signal<boolean>(false);

  /**
   * The bottom sheet is a modal dialog named by its title, as the popover is.
   * `p-drawer` has no input for either — its panel says `complementary` — so
   * they go onto the panel through PrimeNG's pass-through.
   */
  protected readonly drawerPt = {
    root: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'season-map-drawer-title',
    },
  };

  private readonly reloadTick = signal<number>(0);
  private readonly popover = viewChild<Popover>('cellPopover');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  /** Where focus goes back to when the panel closes. */
  private lastTrigger: HTMLElement | null = null;

  constructor() {
    this.watchWidth();

    // Once: the timetable does not move with the season or the filter. A
    // failure offers no planning rather than a broken panel.
    const classes = this.classService.list().subscribe({
      next: (list) => this.classes.set(list),
      error: () => this.classes.set([]),
    });
    this.destroyRef.onDestroy(() => classes.unsubscribe());

    // Keyed on the report's own controls, cancelling the previous read: two
    // quick presses on "previous season" must not paint a stale season.
    effect((onCleanup) => {
      const seasonsBack = this.seasonsBack();
      const kind = this.kind();
      this.reloadTick();

      this.failed.set(false);
      this.calendar.set(null);

      const sub = this.stats.syllabusCalendar(seasonsBack, kind).subscribe({
        next: (calendar) => {
          this.calendar.set(calendar);
          this.revealThisWeek();
        },
        error: () => this.failed.set(true),
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  protected readonly weeks = computed<readonly string[]>(() => this.calendar()?.weeks ?? []);

  /**
   * Planning is offered in the current season, on a row some class of the
   * timetable may teach. A season gone by has no week left to plan, and a
   * no-gi position in a gi-only timetable has nowhere to go.
   */
  protected canPlan(row: MapRow): boolean {
    return this.seasonsBack() === 0 && this.classes().some((c) => admitsTopic(c.kind, row.kind));
  }

  protected readonly currentWeek = computed<string | null>(() => {
    const today = this.calendar()?.today;
    return today ? mondayOf(today) : null;
  });

  /** Before the weeks arrive, the rows still carry their name and fraction. */
  protected readonly rows = computed<MapRow[]>(() => {
    const calendar = this.calendar();
    if (calendar !== null) return buildRows(this.positions(), calendar);

    return this.positions().map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      covered: p.covered,
      inScope: p.in_scope,
      cells: [],
    }));
  });

  /** A month's short name over the first week that belongs to it; nothing elsewhere. */
  protected readonly monthLabels = computed<readonly string[]>(() => {
    const calendar = this.calendar();
    if (calendar === null) return [];

    const format = new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      month: 'short',
    });
    // Only the month's name is printed, so any year will do.
    return monthStarts(calendar.weeks, calendar.season).map((month) =>
      month === null ? '' : format.format(new Date(2000, month - 1, 15)),
    );
  });

  /**
   * A week never narrower than 12 px: a whole season then fits a 1280 px
   * window, and a narrower one scrolls the weeks between two fixed columns.
   */
  protected readonly tableMinWidth = computed<string>(
    () => `calc(10rem + 3.5rem + ${this.weeks().length} * 0.75rem)`,
  );

  /**
   * The week the group message is about (#1863): this one while it still has
   * a plan ahead, else the next. The whole academy's plan, whatever the
   * filter: the group is every athlete, not the half the map is showing.
   */
  protected readonly shareWeek = computed<string | null>(() => {
    const calendar = this.calendar();
    return calendar === null ? null : publishedWeek(calendar);
  });

  /** The message itself, or null when that week has nothing planned. */
  protected readonly weekPlan = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — the heading and weekdays follow the toggle
    const calendar = this.calendar();
    const week = this.shareWeek();
    if (calendar === null || week === null) return null;

    return weekPlanText(calendar, week, {
      heading: this.translate.instant('stats.syllabus.map.share.heading'),
      weekdays: WEEKDAY_KEYS.map((key) => this.translate.instant(key)),
    });
  });

  protected readonly whatsappLink = computed<string | null>(() => {
    const plan = this.weekPlan();
    return plan === null ? null : whatsappShareLink(plan);
  });

  /** Copies the week's plan, the way the backup screen copies its code. */
  protected async copyWeekPlan(): Promise<void> {
    const plan = this.weekPlan();
    if (plan === null) return;

    try {
      await navigator.clipboard.writeText(plan);
      this.messages.add({
        severity: 'success',
        summary: this.translate.instant('stats.syllabus.map.share.copied'),
      });
    } catch {
      // The clipboard can be refused; the WhatsApp link carries the same text.
      this.messages.add({
        severity: 'info',
        summary: this.translate.instant('stats.syllabus.map.share.copyFailed'),
      });
    }
  }

  protected weekAria(week: string): string {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const date = this.shortDate(week);
    return this.translate.instant(
      week === this.currentWeek() ? 'stats.syllabus.map.weekCurrent' : 'stats.syllabus.map.week',
      { date },
    );
  }

  protected cellAria(row: MapRow, cell: MapCell): string {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const parts: string[] = [];
    if (cell.held > 0) parts.push(this.count('held', cell.held));
    if (cell.planned > 0) parts.push(this.count('planned', cell.planned));
    if (cell.unconfirmed > 0) parts.push(this.count('unconfirmed', cell.unconfirmed));

    return this.translate.instant('stats.syllabus.map.cell', {
      position: row.name,
      date: this.shortDate(cell.week),
      detail: parts.join(', '),
    });
  }

  protected fractionAria(row: MapRow): string {
    return this.translate.instant('stats.syllabus.map.fraction', {
      covered: row.covered,
      total: row.inScope,
    });
  }

  protected stateKey(state: CalendarLessonState): string | null {
    return state === 'held' ? null : STATE_KEYS[state];
  }

  /** A week's cell: the pointer shortcut to that week's lessons. */
  protected openWeek(event: Event, row: MapRow, cell: MapCell): void {
    const calendar = this.calendar();
    if (calendar === null) return;

    // From today, not from Monday: the days of this week already gone are
    // the check-in's, not a plan's.
    const today = planningToday(calendar);
    const from = cell.week > today ? cell.week : today;
    this.present(event, {
      mode: 'week',
      positionId: row.id,
      name: row.name,
      groups: [{ week: cell.week, lessons: cellLessons(calendar, row.id, cell.week) }],
      plan:
        cell.ahead && this.canPlan(row)
          ? planOptions(
              this.classes(),
              row.kind,
              from,
              planningUntil(calendar, addDays(cell.week, 6)),
            )
          : null,
    });
  }

  /**
   * A position's name: its whole season, every week with something on it.
   * The equivalent of the cells for anyone they are too small for — one tab
   * stop per row, and a target the size of the name.
   */
  protected openSeason(event: Event, row: MapRow): void {
    const calendar = this.calendar();
    if (calendar === null) return;

    const today = planningToday(calendar);
    this.present(event, {
      mode: 'season',
      positionId: row.id,
      name: row.name,
      groups: positionSeason(calendar, row.id),
      plan: this.canPlan(row)
        ? planOptions(
            this.classes(),
            row.kind,
            today,
            planningUntil(calendar, addDays(today, SEASON_PLAN_DAYS)),
          )
        : null,
    });
  }

  /** "Plan closed guard, week of 12 Oct" — an empty week ahead, as a pointer shortcut. */
  protected planAria(row: MapRow, cell: MapCell): string {
    return this.translate.instant('stats.syllabus.map.planAria', {
      position: row.name,
      date: this.shortDate(cell.week),
    });
  }

  /**
   * Open the lesson sheet on the chosen class and day, with the position
   * already expanded (#1859). The panel closes first: two dialogs on top of
   * each other is one too many.
   */
  protected plan(option: PlanOption, panel: OpenPanel): void {
    this.popover()?.hide();
    this.drawerOpen.set(false);
    this.planning.set({
      classId: option.classId,
      heldOn: option.date,
      className: option.name,
      positionId: panel.positionId,
    });
    this.planSheetOpen.set(true);
  }

  /** The plan was saved: redraw the weeks without blanking the map first. */
  protected refreshWeeks(): void {
    this.stats.syllabusCalendar(this.seasonsBack(), this.kind()).subscribe({
      next: (calendar) => this.calendar.set(calendar),
      error: () => undefined,
    });
  }

  protected seasonAria(row: MapRow): string {
    return this.translate.instant('stats.syllabus.map.seasonAria', { position: row.name });
  }

  /** "Closed guard, week of 12 Oct" — or "Closed guard, this season". */
  protected panelTitle(panel: OpenPanel): string {
    return panel.mode === 'season'
      ? this.translate.instant('stats.syllabus.map.seasonTitle', { position: panel.name })
      : this.translate.instant('stats.syllabus.map.popTitle', {
          position: panel.name,
          date: this.shortDate(panel.groups[0]?.week ?? ''),
        });
  }

  /** "Week of 12 Oct" — the heading of one week in a position's season. */
  protected weekTitle(week: string): string {
    return this.translate.instant('stats.syllabus.map.week', { date: this.shortDate(week) });
  }

  /**
   * The panel is up: move focus onto its title, as a dialog must. By id, not
   * by a view query: the same body is stamped into the popover and the sheet.
   */
  protected focusTitle(): void {
    const id = this.wide() ? 'season-map-pop-title' : 'season-map-drawer-title';
    document.getElementById(id)?.focus();
  }

  /**
   * The panel closed. When it took focus with it (Escape, the drawer's own
   * close), hand it back to the control that opened it; when the reader
   * clicked somewhere else, leave it there.
   */
  protected restoreFocus(): void {
    const active = document.activeElement;
    const insidePanel =
      active instanceof HTMLElement && active.closest('[data-cy="season-map-popover"]') !== null;
    if (active === null || active === document.body || insidePanel) this.lastTrigger?.focus();
  }

  /** "12 Oct" — the Monday a week starts on, in the reader's locale. */
  protected shortDate(iso: string): string {
    if (iso === '') return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
  }

  /** "Mon 12 Oct" — a lesson's day inside a week. */
  protected dayDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  /**
   * Show the panel for this trigger. A popover already open for another cell
   * gets the new content and is moved to the new cell: PrimeNG's `show()`
   * does not re-align a panel that is already visible, so it stayed pinned
   * to the first cell.
   */
  private present(event: Event, panel: OpenPanel): void {
    this.lastTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.panel.set(panel);

    if (!this.wide()) {
      this.drawerOpen.set(true);
      return;
    }

    const popover = this.popover();
    if (popover === undefined) return;

    const wasOpen = popover.overlayVisible;
    popover.show(event);
    if (wasOpen) {
      runInInjectionContext(this.injector, () =>
        afterNextRender(() => {
          popover.align();
          this.focusTitle();
        }),
      );
    }
  }

  /** Track the window's width, so the panel is a popover or a bottom sheet as it should be. */
  private watchWidth(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(WIDE_QUERY);
    this.wide.set(query.matches);
    const onChange = (e: MediaQueryListEvent): void => this.wide.set(e.matches);
    query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  private count(what: 'held' | 'planned' | 'unconfirmed', n: number): string {
    const keys = {
      held: ['stats.syllabus.map.heldOne', 'stats.syllabus.map.heldOther'],
      planned: ['stats.syllabus.map.plannedOne', 'stats.syllabus.map.plannedOther'],
      unconfirmed: ['stats.syllabus.map.unconfirmedOne', 'stats.syllabus.map.unconfirmedOther'],
    } as const;
    return this.translate.instant(keys[what][n === 1 ? 0 : 1], { count: n });
  }

  /**
   * Late in the season this week sits past the right edge of a 960 px
   * window. Bring it into the middle once the weeks are drawn, so the map
   * opens on now rather than on September.
   */
  private revealThisWeek(): void {
    runInInjectionContext(this.injector, () =>
      afterNextRender(() => {
        const scroller = this.scroller()?.nativeElement;
        const current = scroller?.querySelector<HTMLElement>('th.is-current');
        if (!scroller || !current) return;

        const right = current.offsetLeft + current.offsetWidth;
        if (right > scroller.clientWidth) {
          scroller.scrollLeft = current.offsetLeft - scroller.clientWidth / 2;
        }
      }),
    );
  }
}
