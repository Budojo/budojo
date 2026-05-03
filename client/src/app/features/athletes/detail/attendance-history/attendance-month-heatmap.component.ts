import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

interface Cell {
  /** Day of month (1-31). null for blank padding cells. */
  readonly day: number | null;
  /** ISO date string YYYY-MM-DD, null for blank cells. */
  readonly iso: string | null;
  /** Whether this day appears in the attended-dates input. */
  readonly filled: boolean;
}

/**
 * Build a YYYY-MM-DD string from local date components.
 * Using toISOString() would shift to UTC and could report the wrong day
 * for dates near midnight in positive-offset timezones.
 */
function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Month heatmap for a single athlete's attendance.
 *
 * Renders a fixed 6 × 7 grid (Mon-first, EU/IT convention) for a single
 * calendar month. Cells are either:
 *   - blank (padding outside the month, aria-hidden)
 *   - idle (day inside the month, athlete did not attend)
 *   - filled (day inside the month, athlete attended — var(--p-primary-color))
 *
 * This component is intentionally separate from AttendanceHeatmapComponent
 * (stats page), which operates on a date-range + count-per-day shape.
 * Here the input is simply a list of Date objects (count is always 1 or 0).
 */
@Component({
  selector: 'app-attendance-month-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './attendance-month-heatmap.component.html',
  styleUrl: './attendance-month-heatmap.component.scss',
})
export class AttendanceMonthHeatmapComponent {
  /** Any Date whose year + month are the target month (day is ignored). */
  readonly month = input.required<Date>();

  /** Full Date objects for each session attended by the athlete in this month. */
  readonly attendedDates = input.required<readonly Date[]>();

  /**
   * Build a Set of ISO date strings from the attended dates for O(1) lookup.
   */
  protected readonly attendedSet = computed<Set<string>>(() => {
    const set = new Set<string>();
    for (const d of this.attendedDates()) {
      set.add(toIso(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    }
    return set;
  });

  /**
   * Fixed 42-cell (6 rows × 7 cols) flat array, Mon-first.
   * Index formula: row * 7 + col. We expose as a flat array and let the
   * template use CSS grid — cleaner than nested @for.
   */
  protected readonly cells = computed<readonly Cell[]>(() => {
    const m = this.month();
    const year = m.getFullYear();
    const month = m.getMonth() + 1; // 1-12
    const attended = this.attendedSet();

    // Number of days in the month.
    const daysInMonth = new Date(year, month, 0).getDate();

    // Day-of-week for the 1st (0=Sun … 6=Sat). Shift to Mon=0 … Sun=6.
    const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;

    const cells: Cell[] = [];

    // Leading blank cells (Mon of the first week up to but not including day 1).
    for (let i = 0; i < firstDow; i++) {
      cells.push({ day: null, iso: null, filled: false });
    }

    // Day cells.
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIso(year, month, day);
      cells.push({ day, iso, filled: attended.has(iso) });
    }

    // Trailing blank cells to reach exactly 42 (6 × 7).
    while (cells.length < 42) {
      cells.push({ day: null, iso: null, filled: false });
    }

    return cells;
  });

  /** True when there are no attended sessions for the month. */
  protected readonly isEmpty = computed(() => this.attendedDates().length === 0);
}
