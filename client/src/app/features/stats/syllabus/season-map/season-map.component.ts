import {
  ChangeDetectionStrategy,
  Component,
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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Popover, PopoverModule } from 'primeng/popover';
import { SkeletonModule } from 'primeng/skeleton';
import { TrainingMode } from '../../../../core/services/academy.service';
import { LanguageService } from '../../../../core/services/language.service';
import {
  CalendarLessonState,
  CoveragePosition,
  StatsService,
  SyllabusCalendar,
} from '../../../../core/services/stats.service';
import { localeFor } from '../../../../shared/utils/locale';
import {
  CellLesson,
  MapCell,
  MapRow,
  buildRows,
  cellLessons,
  mondayOf,
  monthStarts,
} from './season-map.model';

interface SelectedCell {
  readonly name: string;
  readonly week: string;
  readonly lessons: readonly CellLesson[];
}

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
  imports: [TranslatePipe, PopoverModule, SkeletonModule],
  templateUrl: './season-map.component.html',
  styleUrl: './season-map.component.scss',
})
export class SeasonMapComponent {
  private readonly stats = inject(StatsService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);

  /** The coverage report's rows: they decide which positions are drawn, and in which order. */
  readonly positions = input.required<readonly CoveragePosition[]>();
  readonly seasonsBack = input<number>(0);
  /** The report's filter, or null for the whole programme. */
  readonly kind = input<TrainingMode | null>(null);

  protected readonly calendar = signal<SyllabusCalendar | null>(null);
  protected readonly failed = signal<boolean>(false);
  protected readonly selected = signal<SelectedCell | null>(null);

  private readonly reloadTick = signal<number>(0);
  private readonly popover = viewChild<Popover>('cellPopover');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
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

  protected open(event: Event, row: MapRow, cell: MapCell): void {
    const calendar = this.calendar();
    if (calendar === null) return;

    this.selected.set({
      name: row.name,
      week: cell.week,
      lessons: cellLessons(calendar, row.id, cell.week),
    });
    this.popover()?.show(event);
  }

  /** "12 Oct" — the Monday a week starts on, in the reader's locale. */
  protected shortDate(iso: string): string {
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
