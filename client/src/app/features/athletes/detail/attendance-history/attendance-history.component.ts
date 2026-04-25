import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { SkeletonModule } from 'primeng/skeleton';
import { Athlete, AthleteService } from '../../../../core/services/athlete.service';
import { AttendanceRecord, AttendanceService } from '../../../../core/services/attendance.service';
import { YearMonth, buildCalendarGrid, shiftMonth } from './calendar-grid';

/**
 * YYYY-MM-DD from local components — same canon as the daily check-in surface;
 * `toISOString()` would shift to UTC and round-trip the wrong calendar day.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstOfMonth(ym: YearMonth): string {
  return toLocalDateString(new Date(ym.year, ym.month - 1, 1));
}

function lastOfMonth(ym: YearMonth): string {
  return toLocalDateString(new Date(ym.year, ym.month, 0));
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

@Component({
  selector: 'app-attendance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, PopoverModule, SkeletonModule],
  templateUrl: './attendance-history.component.html',
  styleUrl: './attendance-history.component.scss',
})
export class AttendanceHistoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly athleteService = inject(AthleteService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('notesPopover') private notesPopover?: Popover;

  protected readonly athlete = signal<Athlete | null>(null);
  protected readonly records = signal<AttendanceRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly activeNotes = signal<string | null>(null);

  protected readonly visible = signal<YearMonth>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  protected readonly attendedDates = computed(
    () => new Set(this.records().map((r) => r.attended_on)),
  );
  protected readonly attendedCount = computed(() => this.records().length);

  protected readonly weeks = computed(() => {
    const ym = this.visible();
    return buildCalendarGrid(ym.year, ym.month);
  });

  protected readonly monthLabel = computed(() => {
    const ym = this.visible();
    const d = new Date(ym.year, ym.month - 1, 1);
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });

  protected readonly canGoPrev = computed(() => {
    const a = this.athlete();
    if (!a) return false;
    const createdAt = new Date(a.created_at);
    const createdYM: YearMonth = {
      year: createdAt.getFullYear(),
      month: createdAt.getMonth() + 1,
    };
    return compareYearMonth(this.visible(), createdYM) > 0;
  });

  protected readonly canGoNext = computed(() => {
    const now = new Date();
    const todayYM: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
    return compareYearMonth(this.visible(), todayYM) < 0;
  });

  ngOnInit(): void {
    const parentParams = this.route.parent?.paramMap;
    if (!parentParams) return;
    parentParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) return;
      const id = Number(idParam);
      if (!Number.isFinite(id)) return;
      this.loadAll(id);
    });
  }

  prevMonth(): void {
    if (!this.canGoPrev()) return;
    this.shiftAndReload(-1);
  }

  nextMonth(): void {
    if (!this.canGoNext()) return;
    this.shiftAndReload(1);
  }

  protected dayKey(day: number): string {
    const ym = this.visible();
    return `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  openNotesFor(event: Event, key: string): void {
    const record = this.records().find((r) => r.attended_on === key);
    if (!record || !record.notes) {
      this.activeNotes.set(null);
      return;
    }
    this.activeNotes.set(record.notes);
    this.notesPopover?.show(event);
  }

  private loadAll(athleteId: number): void {
    this.loading.set(true);
    forkJoin({
      athlete: this.athleteService.get(athleteId),
      records: this.attendanceService.getAthleteHistory(athleteId, {
        from: firstOfMonth(this.visible()),
        to: lastOfMonth(this.visible()),
      }),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ athlete, records }) => {
          this.athlete.set(athlete);
          this.records.set(records);
        },
        error: () => {
          this.records.set([]);
        },
      });
  }

  private shiftAndReload(delta: number): void {
    this.visible.set(shiftMonth(this.visible(), delta));
    const a = this.athlete();
    if (!a) return;
    this.loading.set(true);
    this.attendanceService
      .getAthleteHistory(a.id, {
        from: firstOfMonth(this.visible()),
        to: lastOfMonth(this.visible()),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (records) => this.records.set(records),
        error: () => this.records.set([]),
      });
  }
}
