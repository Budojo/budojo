import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { Subscription } from 'rxjs';
import { DailyAttendancePoint, StatsService } from '../../../core/services/stats.service';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';

interface RangeOption {
  label: string;
  value: 3 | 6 | 12;
}

const RANGE_OPTIONS: RangeOption[] = [
  { label: '3m', value: 3 },
  { label: '6m', value: 6 },
  { label: '12m', value: 12 },
];

@Component({
  selector: 'app-stats-attendance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AttendanceHeatmapComponent,
    FormsModule,
    SelectButtonModule,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './stats-attendance.component.html',
  styleUrl: './stats-attendance.component.scss',
})
export class StatsAttendanceComponent {
  private readonly stats = inject(StatsService);

  protected readonly rangeOptions = RANGE_OPTIONS;
  protected readonly range = signal<3 | 6 | 12>(3);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly points = signal<readonly DailyAttendancePoint[]>([]);

  protected readonly isEmpty = computed(() => this.points().length === 0);

  /** windowEnd is always today. */
  protected readonly windowEnd = new Date();

  /** windowStart = today − N months + 1 day, recomputed when range changes. */
  protected readonly windowStart = computed(() => {
    const end = new Date(this.windowEnd);
    end.setMonth(end.getMonth() - this.range());
    end.setDate(end.getDate() + 1);
    return end;
  });

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      this.sub?.unsubscribe();
      this.loading.set(true);
      this.errored.set(false);
      this.sub = this.stats.attendanceDaily(this.range()).subscribe({
        next: (pts) => {
          this.points.set(pts);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
    });
  }
}
