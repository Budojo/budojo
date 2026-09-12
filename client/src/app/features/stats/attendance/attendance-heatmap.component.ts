import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { DailyAttendancePoint } from '../../../core/services/stats.service';
import { localeFor } from '../../../shared/utils/locale';

type Bucket = 0 | 1 | 2 | 3 | 4;

interface Cell {
  readonly date: Date;
  readonly iso: string; // 'YYYY-MM-DD' for the title tooltip
  readonly count: number;
  readonly bucket: Bucket; // intensity bucket
  readonly inWindow: boolean; // false for cells outside the data range (alignment padding)
  readonly tooltip: string; // localized, prebuilt for the <title>
}

/**
 * The three cut points between the four non-empty shades — the 25th, 50th
 * and 75th percentile of the window's non-zero day counts.
 */
type Thresholds = readonly [number, number, number];

@Component({
  selector: 'app-attendance-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './attendance-heatmap.component.html',
  styleUrl: './attendance-heatmap.component.scss',
})
export class AttendanceHeatmapComponent {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  readonly points = input.required<readonly DailyAttendancePoint[]>();
  readonly windowStart = input.required<Date>();
  readonly windowEnd = input.required<Date>();

  /**
   * Where the four shades begin, read off the window itself (#1560).
   *
   * The cut points used to be absolute — 0 / ≤2 / ≤5 / ≤10 / more — a scale
   * written for one athlete's history, where a busy week is four sessions.
   * This chart is the whole academy's: on a 33-athlete roster every session
   * has 20-29 people, so every training day landed in the top bucket and the
   * map was one solid block. It said "you train Mon, Wed, Fri", which the
   * axis already says, and nothing else — and the bigger the academy, the
   * less it said.
   *
   * Quartiles of the window's own counts instead: the top quarter of the
   * crowds seen is the darkest whether that means 4 people or 40, and the
   * chart means the same thing on a roster of 12 and a roster of 120.
   *
   * Quartiles of the DISTINCT counts, not of the days. Over the days, a
   * crowd that repeats becomes every cut point at once — thirty days of 5
   * make the thresholds [5, 5, 5], and the three days of 6 the chart exists
   * to show are painted the same as the 5s. Over the distinct values a mode
   * is one value like any other, so [4, 5, 6] cuts 2 / 3 / 4 and the busy
   * day stands out. Null when nobody trained at all — every cell is then
   * empty and there is no scale to draw.
   */
  private readonly thresholds = computed<Thresholds | null>(() => {
    const distinct = [
      ...new Set(
        this.points()
          .map((p) => p.count)
          .filter((c) => c > 0),
      ),
    ].sort((a, b) => a - b);
    if (distinct.length === 0) return null;

    // Nearest-rank percentile over the distinct values: the smallest value
    // with at least p of them at or below it.
    const at = (p: number): number =>
      distinct[Math.min(distinct.length - 1, Math.max(0, Math.ceil(p * distinct.length) - 1))];
    return [at(0.25), at(0.5), at(0.75)];
  });

  /**
   * 7 rows × N columns grid. Row 0 = Monday, row 6 = Sunday.
   * Column 0 = the week containing windowStart (left-padded with
   * out-of-window cells if windowStart isn't a Monday).
   */
  protected readonly grid = computed(() => {
    // Register dependency on the active language so the tooltip locale re-evaluates on lang switch.
    const tooltipLocale = localeFor(this.languageService.currentLang());
    const thresholds = this.thresholds();

    const start = this.windowStart();
    const end = this.windowEnd();
    // Align grid start to the Monday of the start's ISO week.
    const gridStart = new Date(start);
    const dow = (gridStart.getDay() + 6) % 7; // Mon=0 … Sun=6
    gridStart.setDate(gridStart.getDate() - dow);

    // Build a count map keyed by ISO date for O(1) lookup.
    const counts = new Map<string, number>();
    for (const p of this.points()) counts.set(p.date, p.count);

    const cols: Cell[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= end) {
      const week: Cell[] = [];
      for (let row = 0; row < 7; row++) {
        const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        const count = counts.get(iso) ?? 0;
        const inWindow = cursor >= start && cursor <= end;
        const bucket = this.bucketFor(count, thresholds);
        const cellDate = new Date(cursor);
        const dateLabel = cellDate.toLocaleDateString(tooltipLocale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        const tooltip =
          count === 0
            ? this.translate.instant('stats.attendance.heatmap.tooltipEmpty', { date: dateLabel })
            : this.translate.instant('stats.attendance.heatmap.tooltipCount', {
                date: dateLabel,
                count,
              });
        week.push({
          date: cellDate,
          iso,
          count,
          bucket,
          inWindow,
          tooltip,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(week);
    }
    return cols;
  });

  /**
   * Month-label positions: column index where each month's first in-window
   * cell appears. Walking in-window cells (not just the Monday) ensures the
   * label lands at the correct column even when a month starts mid-week.
   */
  protected readonly monthLabels = computed(() => {
    // Register dependency on the active language so labels re-render on locale switch.
    const labelLocale = localeFor(this.languageService.currentLang());
    const cols = this.grid();
    const labels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (let i = 0; i < cols.length; i++) {
      // Find the first in-window cell in this column.
      // If any cell starts a new month, the label belongs at column i.
      for (const cell of cols[i]) {
        if (!cell.inWindow) continue;
        const m = cell.date.getMonth();
        if (m !== prevMonth) {
          labels.push({
            col: i,
            label: cell.date.toLocaleString(labelLocale, { month: 'short' }),
          });
          prevMonth = m;
          break;
        }
      }
    }
    return labels;
  });

  /**
   * What the four shades mean in THIS window — "20–21 · 22–23 · 24–26 · 27–29
   * attendances a day" — because a scale that moves with the data has to
   * say where it moved to (Norman: explain the mapping at the control).
   * A shade nothing landed in reads as "—". Null when the window is empty
   * and there is no scale to explain.
   */
  protected readonly scaleLabel = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    if (this.thresholds() === null) return null;

    const ranges = new Map<Bucket, { min: number; max: number }>();
    for (const week of this.grid()) {
      for (const cell of week) {
        if (!cell.inWindow || cell.count === 0) continue;
        const range = ranges.get(cell.bucket);
        if (range === undefined) {
          ranges.set(cell.bucket, { min: cell.count, max: cell.count });
        } else {
          range.min = Math.min(range.min, cell.count);
          range.max = Math.max(range.max, cell.count);
        }
      }
    }

    const label = (bucket: Bucket): string => {
      const range = ranges.get(bucket);
      if (range === undefined) return '—';
      return range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
    };

    return this.translate.instant('stats.attendance.heatmap.scale', {
      b1: label(1),
      b2: label(2),
      b3: label(3),
      b4: label(4),
    });
  });

  /**
   * Upward from the top: at or above the 75th percentile is the darkest, and
   * so on down. Ties resolve towards the darker shade, which is what makes a
   * window where every day drew the same crowd read as full rather than
   * pale — no variation is not the same thing as nothing happened.
   */
  private bucketFor(count: number, thresholds: Thresholds | null): Bucket {
    if (count === 0 || thresholds === null) return 0;
    const [q25, q50, q75] = thresholds;
    if (count >= q75) return 4;
    if (count >= q50) return 3;
    if (count >= q25) return 2;
    return 1;
  }
}
