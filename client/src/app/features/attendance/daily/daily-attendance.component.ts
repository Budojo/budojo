import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { Athlete, AthleteService } from '../../../core/services/athlete.service';
import { AttendanceService } from '../../../core/services/attendance.service';

/**
 * YYYY-MM-DD from the LOCAL date components — NOT `toISOString()`, which
 * converts to UTC and can cross midnight in non-UTC timezones (e.g. a user
 * in Europe/Rome at 23:00 local time would land on tomorrow's UTC date).
 * Reused from the athlete form for the same canon reason.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-daily-attendance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonModule, DatePickerModule, SkeletonModule, Toast],
  providers: [MessageService],
  templateUrl: './daily-attendance.component.html',
  styleUrl: './daily-attendance.component.scss',
})
export class DailyAttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly athleteService = inject(AthleteService);
  private readonly messageService = inject(MessageService);

  /**
   * 7-day backfill window per PRD § P0.3. `minDate` / `maxDate` feed the
   * `<p-datepicker>` directly so the user can't pick a future date or an
   * out-of-window past date — eliminates the need for a redundant 422
   * round-trip.
   */
  protected readonly today = new Date();
  protected readonly minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  })();
  protected readonly maxDate = new Date();

  /**
   * `selectedDate` is bound via FormsModule `[(ngModel)]` to the date
   * picker. `<p-datepicker>` emits a Date, we convert to YYYY-MM-DD when
   * crossing the wire boundary (see loadDay).
   */
  protected readonly selectedDate = signal<Date>(new Date());

  /**
   * The full list of active athletes for the academy. Page 1 only for
   * MVP — typical dojos are < 20 active so this covers the case; if a
   * larger academy hits the limit we'll add load-more / pagination in
   * M4.2.5. There's a "showing 20 of N" hint at the foot of the list
   * to surface the limit explicitly.
   */
  protected readonly athletes = signal<Athlete[]>([]);
  protected readonly totalActiveAthletes = signal<number>(0);

  /**
   * athlete_id → record_id for each present athlete. The record_id is the
   * server-generated PK; we need it to fire a DELETE on un-mark. While a
   * mark is in flight we set the value to a sentinel (-1) so the row
   * renders as present optimistically; on success we swap in the real id.
   */
  protected readonly presentMap = signal<Map<number, number>>(new Map());

  protected readonly loading = signal<boolean>(false);

  /**
   * Set of athlete_ids whose mark/unmark is currently in flight. Used to
   * disable the row's tap handler — preventing double-tap during a slow
   * round-trip from spawning two POSTs that race.
   */
  protected readonly inflight = signal<Set<number>>(new Set());

  /**
   * Monotonic counter for `loadDay()` calls. A request whose captured
   * epoch no longer matches the current value is stale (the user clicked
   * the date picker again before the previous response landed) and its
   * tap() into our signals is a no-op. Mirrors AcademyService.epoch.
   */
  private loadEpoch = 0;

  /**
   * Tracks the most-recently-shown undo toast key so we can dismiss it
   * when a new mark/unmark fires. PRD § P0.3: a tap past the toast must
   * dismiss the previous one and (in the error path) replace it with the
   * failure toast — no stacked Undo buttons each tied to a different
   * record.
   */
  private lastToastKey: string | null = null;

  ngOnInit(): void {
    this.loadDay();
  }

  /**
   * Fetches the academy roster + the day's existing attendance, builds
   * the present-map. Re-runs on date-picker change.
   *
   * Epoch-gated against double-trigger: the user clicking the date
   * picker rapidly fires multiple loadDay() calls; each captures its
   * own epoch and only writes to the signals if its epoch is still
   * current. A late response from a previous date can no longer
   * clobber the freshly-selected date's state.
   */
  protected loadDay(): void {
    this.loading.set(true);
    const date = toLocalDateString(this.selectedDate());
    const epoch = ++this.loadEpoch;

    let pending = 2;
    const settle = (): void => {
      pending -= 1;
      if (pending === 0 && epoch === this.loadEpoch) {
        this.loading.set(false);
      }
    };

    this.athleteService.list({ status: 'active' }).subscribe({
      next: (page) => {
        if (epoch === this.loadEpoch) {
          this.athletes.set(page.data);
          this.totalActiveAthletes.set(page.meta.total);
        }
        settle();
      },
      error: () => {
        if (epoch === this.loadEpoch) {
          this.toastError('Could not load the athletes list.');
        }
        settle();
      },
    });

    this.attendanceService.getDaily(date).subscribe({
      next: (records) => {
        if (epoch === this.loadEpoch) {
          const map = new Map<number, number>();
          for (const r of records) {
            map.set(r.athlete_id, r.id);
          }
          this.presentMap.set(map);
        }
        settle();
      },
      error: () => {
        if (epoch === this.loadEpoch) {
          this.toastError("Could not load today's attendance.");
        }
        settle();
      },
    });
  }

  protected isPresent(athleteId: number): boolean {
    return this.presentMap().has(athleteId);
  }

  protected isInflight(athleteId: number): boolean {
    return this.inflight().has(athleteId);
  }

  /**
   * The single user-facing entry point. Routes to mark or unmark based on
   * current state. Disabled (no-op) while a request for this athlete is
   * already in flight.
   */
  protected togglePresent(athlete: Athlete): void {
    if (this.isInflight(athlete.id)) {
      return;
    }
    const existingRecordId = this.presentMap().get(athlete.id);
    if (existingRecordId !== undefined && existingRecordId > 0) {
      this.unmark(athlete, existingRecordId);
    } else {
      this.mark(athlete);
    }
  }

  /**
   * Optimistic mark. Adds a sentinel `-1` record-id so the row flips
   * to present immediately, then fires the POST. On success we swap in
   * the real record id; on error we roll back.
   *
   * `silent` skips the success toast — used when the caller is itself
   * an undo of a previous unmark (PRD § P0.3: "No new toast is emitted
   * for the undo itself").
   */
  private mark(athlete: Athlete, options: { silent?: boolean } = {}): void {
    const date = toLocalDateString(this.selectedDate());
    this.optimisticAdd(athlete.id, -1);
    this.markInflight(athlete.id, true);

    this.attendanceService.markBulk({ date, athlete_ids: [athlete.id] }).subscribe({
      next: (records) => {
        // The server returns the FULL "now present on this date" list for
        // the posted athletes; idempotent path returns the existing record.
        // Either way we want the record id for this athlete.
        const fresh = records.find((r) => r.athlete_id === athlete.id);
        if (fresh) {
          this.optimisticAdd(athlete.id, fresh.id);
          if (!options.silent) {
            this.toastUndo(`${athlete.first_name} ${athlete.last_name} marked present.`, () =>
              this.unmark(athlete, fresh.id, { silent: true }),
            );
          }
        }
        this.markInflight(athlete.id, false);
      },
      error: () => {
        this.optimisticRemove(athlete.id);
        this.markInflight(athlete.id, false);
        this.toastError(`Couldn't mark ${athlete.first_name} present. Try again.`);
      },
    });
  }

  /**
   * Optimistic unmark. Removes from the present-map immediately, fires
   * the DELETE, on error puts it back. `silent` skips the success toast
   * for the same Undo-of-undo reason as `mark()`.
   */
  private unmark(athlete: Athlete, recordId: number, options: { silent?: boolean } = {}): void {
    this.optimisticRemove(athlete.id);
    this.markInflight(athlete.id, true);

    this.attendanceService.delete(recordId).subscribe({
      next: () => {
        if (!options.silent) {
          this.toastUndo(`${athlete.first_name} ${athlete.last_name} un-marked.`, () =>
            this.mark(athlete, { silent: true }),
          );
        }
        this.markInflight(athlete.id, false);
      },
      error: () => {
        this.optimisticAdd(athlete.id, recordId);
        this.markInflight(athlete.id, false);
        this.toastError(`Couldn't un-mark ${athlete.first_name}. Try again.`);
      },
    });
  }

  protected onDateChanged(): void {
    // ngModel pushes the new Date into selectedDate(). Reload accordingly.
    this.loadDay();
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private optimisticAdd(athleteId: number, recordId: number): void {
    const next = new Map(this.presentMap());
    next.set(athleteId, recordId);
    this.presentMap.set(next);
  }

  private optimisticRemove(athleteId: number): void {
    const next = new Map(this.presentMap());
    next.delete(athleteId);
    this.presentMap.set(next);
  }

  private markInflight(athleteId: number, on: boolean): void {
    const next = new Set(this.inflight());
    if (on) {
      next.add(athleteId);
    } else {
      next.delete(athleteId);
    }
    this.inflight.set(next);
  }

  private toastUndo(summary: string, undo: () => void): void {
    // PRD § P0.3: a new mark/unmark dismisses the previous Undo toast
    // and an error replaces a success toast — no stacked actionable
    // Undos each tied to a different record. messageService.clear()
    // wipes any previous toast (we only ever surface one at a time).
    this.dismissPreviousToast();
    const key = `attendance-undo-${Date.now()}`;
    this.lastToastKey = key;
    this.messageService.add({
      key, // referenced by clear() to dismiss when the next toast arrives
      severity: 'success',
      summary,
      // The custom toast template (see html) reads .data.undo and renders
      // a button that calls it. PrimeNG dismisses the toast on its own
      // after `life` ms; the user has 5 seconds to act.
      data: { undo },
      life: 5000,
    });
  }

  private toastError(summary: string): void {
    this.dismissPreviousToast();
    this.messageService.add({
      severity: 'error',
      summary,
      life: 4000,
    });
  }

  private dismissPreviousToast(): void {
    if (this.lastToastKey !== null) {
      this.messageService.clear(this.lastToastKey);
      this.lastToastKey = null;
    }
  }
}
