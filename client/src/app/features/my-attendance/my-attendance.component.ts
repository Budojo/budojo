import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AttendanceRecord, AttendanceService } from '../../core/services/attendance.service';

/**
 * Athlete-portal attendance history page (M7 PR-D slice 3). Read-only
 * descending list of the user's own training sessions, with a small
 * "month/year" summary at the top.
 *
 * V1 ships the unfiltered window (everything since the user's first
 * mat day). Date filters land in slice 4 (Payments) if/when the
 * design proves the need; for now the descending list is short
 * enough that visual scanning is the right UX.
 */
@Component({
  selector: 'app-my-attendance',
  standalone: true,
  imports: [TranslatePipe, DatePipe, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-attendance.component.html',
  styleUrl: './my-attendance.component.scss',
})
export class MyAttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly records = signal<readonly AttendanceRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noProfile = signal(false);

  /**
   * Last-30-days session count — a single number under the page
   * title that gives the athlete a quick "am I training consistently?"
   * answer without reading the whole list.
   */
  protected readonly last30Count = computed(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return this.records().filter((r) => r.attended_on >= cutoffStr).length;
  });

  ngOnInit(): void {
    this.attendanceService
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (records) => {
          if (records === null) {
            this.noProfile.set(true);
          } else {
            this.records.set(records);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }
}
