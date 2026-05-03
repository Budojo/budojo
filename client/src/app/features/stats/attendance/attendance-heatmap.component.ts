import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

interface Cell {
  readonly date: Date;
  readonly iso: string; // 'YYYY-MM-DD' for the title tooltip
  readonly count: number;
  readonly bucket: 0 | 1 | 2 | 3 | 4; // intensity bucket
  readonly inWindow: boolean; // false for cells outside the data range (alignment padding)
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
  readonly points = input.required<readonly { date: string; count: number }[]>();
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
        week.push({
          date: new Date(cursor),
          iso,
          count,
          bucket: this.bucketFor(count),
          inWindow,
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
}
