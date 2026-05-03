import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DailyAttendancePoint } from '../../../core/services/stats.service';

interface Cell {
  readonly date: Date;
  readonly iso: string; // 'YYYY-MM-DD' for the title tooltip
  readonly count: number;
  readonly bucket: 0 | 1 | 2 | 3 | 4; // intensity bucket
  readonly inWindow: boolean; // false for cells outside the data range (alignment padding)
  readonly tooltip: string; // localized, prebuilt for the <title>
  readonly fill: string; // per-month hued fill color
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
        const dateLabel = cellDate.toLocaleDateString(undefined, {
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
   * Month-label positions: column index where each month starts.
   */
  protected readonly monthLabels = computed(() => {
    const cols = this.grid();
    const labels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (let i = 0; i < cols.length; i++) {
      const firstMondayOfCol = cols[i][0].date;
      const m = firstMondayOfCol.getMonth();
      if (m !== prevMonth) {
        labels.push({
          col: i,
          label: firstMondayOfCol.toLocaleString(undefined, { month: 'short' }),
        });
        prevMonth = m;
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

  private fillFor(date: Date, bucket: 0 | 1 | 2 | 3 | 4): string {
    if (bucket === 0) return '#e9ecef';
    const hue = AttendanceHeatmapComponent.MONTH_HUES[date.getMonth()];
    const alphas = ['', '40', '80', 'bf', ''] as const;
    return `${hue}${alphas[bucket]}`;
  }
}
