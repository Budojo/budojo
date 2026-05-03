import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { DailyAttendancePoint } from '../../../core/services/stats.service';
import { localeFor } from '../../../shared/utils/locale';

interface Cell {
  readonly date: Date;
  readonly iso: string; // 'YYYY-MM-DD' for the title tooltip
  readonly count: number;
  readonly bucket: 0 | 1 | 2 | 3 | 4; // intensity bucket
  readonly inWindow: boolean; // false for cells outside the data range (alignment padding)
  readonly tooltip: string; // localized, prebuilt for the <title>
  readonly fill: string | null; // per-month hued fill color; null for bucket-0 cells (CSS default)
}

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

  /** One hue per calendar month (index 0 = Jan … 11 = Dec). */
  private static readonly MONTH_HUES: readonly string[] = [
    '#5b6cff', // Jan — primary blue
    '#7c4dff', // Feb — violet
    '#26a69a', // Mar — teal
    '#66bb6a', // Apr — green
    '#9ccc65', // May — lime
    '#ffca28', // Jun — amber
    '#ffa726', // Jul — orange
    '#ef5350', // Aug — red
    '#ec407a', // Sep — pink
    '#ab47bc', // Oct — purple
    '#5c6bc0', // Nov — indigo
    '#42a5f5', // Dec — light blue
  ];

  readonly points = input.required<readonly DailyAttendancePoint[]>();
  readonly windowStart = input.required<Date>();
  readonly windowEnd = input.required<Date>();

  /**
   * 7 rows × N columns grid. Row 0 = Monday, row 6 = Sunday.
   * Column 0 = the week containing windowStart (left-padded with
   * out-of-window cells if windowStart isn't a Monday).
   */
  protected readonly grid = computed(() => {
    // Register dependency on the active language so the tooltip locale re-evaluates on lang switch.
    const tooltipLocale = localeFor(this.languageService.currentLang());

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
        const bucket = this.bucketFor(count);
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
          fill: this.fillFor(cellDate, bucket),
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

  private bucketFor(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
  }

  private fillFor(date: Date, bucket: 0 | 1 | 2 | 3 | 4): string | null {
    // Bucket 0 returns null so [attr.fill]="null" removes the attribute from
    // the <rect>, letting the CSS-defined fill on .heatmap__cell take over.
    // That CSS fill uses a --p-surface-200 token, which adapts to dark mode.
    if (bucket === 0) return null;
    const hue = AttendanceHeatmapComponent.MONTH_HUES[date.getMonth()];
    const alphas = ['', '40', '80', 'bf', ''] as const;
    return `${hue}${alphas[bucket]}`;
  }
}
