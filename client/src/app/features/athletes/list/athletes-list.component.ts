import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { Tooltip } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AcademyService } from '../../../core/services/academy.service';
import {
  Athlete,
  AthleteFilters,
  AthletePaidFilter,
  AthleteSortField,
  AthleteSortOrder,
  AthleteStatus,
  Belt,
  AthleteService,
} from '../../../core/services/athlete.service';
import { PaymentService } from '../../../core/services/payment.service';
import { BeltBadgeComponent } from '../../../shared/components/belt-badge/belt-badge.component';
import { AgeBadgeComponent } from '../../../shared/components/age-badge/age-badge.component';
import { ExpiringDocumentsWidgetComponent } from '../../../shared/components/expiring-documents-widget/expiring-documents-widget.component';
import { MonthlySummaryWidgetComponent } from '../../../shared/components/monthly-summary-widget/monthly-summary-widget.component';
import { PaidBadgeComponent } from '../../../shared/components/paid-badge/paid-badge.component';

interface SelectOption<T extends string> {
  label: string;
  value: T | '';
}

@Component({
  selector: 'app-athletes-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    ToastModule,
    ConfirmPopup,
    Tooltip,
    AgeBadgeComponent,
    BeltBadgeComponent,
    ExpiringDocumentsWidgetComponent,
    MonthlySummaryWidgetComponent,
    PaidBadgeComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './athletes-list.component.html',
  styleUrl: './athletes-list.component.scss',
})
export class AthletesListComponent implements OnInit {
  private readonly athleteService = inject(AthleteService);
  private readonly paymentService = inject(PaymentService);
  private readonly academyService = inject(AcademyService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  readonly athletes = signal<Athlete[]>([]);
  readonly totalRecords = signal(0);
  readonly loading = signal(true);

  selectedBelt = signal<Belt | ''>('');
  selectedStatus = signal<AthleteStatus | ''>('');
  selectedPaid = signal<AthletePaidFilter | ''>('');
  readonly sortField = signal<AthleteSortField | null>(null);
  readonly sortOrder = signal<AthleteSortOrder>('desc');

  /**
   * The paid badge + filter only make sense when the academy has configured
   * a monthly fee — otherwise there's no expectation of payment to assert
   * against. Reads from the cached `AcademyService.academy()` signal so we
   * never block rendering on an additional fetch (#105).
   */
  readonly hasMonthlyFee = computed(
    () => (this.academyService.academy()?.monthly_fee_cents ?? null) !== null,
  );

  /**
   * Short month abbreviation for the "Paid" column header (#282) — e.g.
   * "Apr". Derived once per component instance from the current date in
   * UTC (matches the server-side payment-month resolution everywhere
   * else in the SPA). A user keeping the page open across a month
   * boundary sees a slightly stale header until refresh — acceptable
   * trade-off for not adding a per-tick reactive timer just for a
   * column header.
   *
   * Locale: hard-coded `en-US` for now to match the existing
   * `monthLabel` derivation in `confirmTogglePaid()` and the SPA's
   * English-source dashboard. When the dashboard i18n PR-C lands
   * (#279), this can switch to the active LanguageService locale.
   */
  readonly currentMonthShort = new Date().toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

  /**
   * Full month + year for the per-row tooltip (#282) — e.g. "April 2026".
   * Same locale + timezone discipline as `currentMonthShort`. Combined
   * with the athlete's paid state in the template for a tooltip like
   * "April 2026 — Unpaid".
   */
  readonly currentMonthLong = new Date().toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  /**
   * Free-text name search. The signal mirrors the input control; the trimmed
   * value gets forwarded to the backend as `?q=...` when non-empty (#102).
   */
  readonly searchTerm = signal<string>('');

  /**
   * Each keystroke pushes here. The pipeline below debounces +
   * de-duplicates so a five-character "mario" sends one request, not five.
   * 200 ms is canon-small (Doherty < 400 ms) — feedback feels live.
   */
  private readonly searchInputSubject = new Subject<string>();

  private page = 1;

  readonly first = signal(0);

  constructor() {
    // Trim BEFORE distinctUntilChanged so "ma", "ma ", "ma" don't fire three
    // identical loads. The applySearch normalisation below is defense in depth
    // for direct callers (tests, future "Clear" affordance) — both layers
    // converge on the same canonical value in `searchTerm`.
    this.searchInputSubject
      .pipe(
        debounceTime(200),
        map((value) => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => this.applySearch(q));
  }

  // Order = IBJJF rank (kids → adults → senior coral/red) so the
  // dropdown reads bottom-up like a progression chart.
  readonly beltOptions: SelectOption<Belt>[] = [
    { label: 'All belts', value: '' },
    { label: 'Grey (kids)', value: 'grey' },
    { label: 'Yellow (kids)', value: 'yellow' },
    { label: 'Orange (kids)', value: 'orange' },
    { label: 'Green (kids)', value: 'green' },
    { label: 'White', value: 'white' },
    { label: 'Blue', value: 'blue' },
    { label: 'Purple', value: 'purple' },
    { label: 'Brown', value: 'brown' },
    { label: 'Black', value: 'black' },
    { label: 'Red & black (7°)', value: 'red-and-black' },
    { label: 'Red & white (8°)', value: 'red-and-white' },
    { label: 'Red (9°/10°)', value: 'red' },
  ];

  readonly statusOptions: SelectOption<AthleteStatus>[] = [
    { label: 'All statuses', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Inactive', value: 'inactive' },
  ];

  readonly paidOptions: SelectOption<AthletePaidFilter>[] = [
    { label: 'All', value: '' },
    { label: 'Paid', value: 'yes' },
    { label: 'Unpaid', value: 'no' },
  ];

  ngOnInit(): void {
    this.load();
  }

  onBeltChange(belt: Belt | ''): void {
    this.selectedBelt.set(belt);
    this.resetPage();
    this.load();
  }

  onStatusChange(status: AthleteStatus | ''): void {
    this.selectedStatus.set(status);
    this.resetPage();
    this.load();
  }

  onPaidChange(paid: AthletePaidFilter | ''): void {
    this.selectedPaid.set(paid);
    this.resetPage();
    this.load();
  }

  /**
   * Template binding: every keystroke pushes into the debounce pipeline.
   * `applySearch` is the side of the pipeline that actually mutates state
   * and fires a load — it's also exposed publicly so tests (and any future
   * non-debounced trigger like a "Clear" affordance) can call it directly.
   */
  onSearchInput(value: string): void {
    this.searchInputSubject.next(value);
  }

  applySearch(q: string): void {
    // Store the canonical (trimmed) value so the template's `searchTerm()`
    // truthiness check matches the actual filter sent on the wire — a
    // whitespace-only input is "no search", not a search-with-spaces.
    this.searchTerm.set(q.trim());
    this.resetPage();
    this.load();
  }

  onPageChange(event: { first: number; rows: number }): void {
    this.page = Math.floor(event.first / event.rows) + 1;
    this.first.set(event.first);
    this.load();
  }

  /**
   * 4-state cycle on the synthetic "Full name" column header (#196). The
   * column is `first_name + last_name` glued client-side, so a single
   * scalar sort is degenerate (ties between same-first-name athletes
   * sail through in arbitrary order). The cycle:
   *
   *   none/other → first asc → first desc → last asc → last desc → first asc
   *
   * The backend honours the matching `applyNameSort` tiebreak — primary
   * column orders, then the OTHER name field tiebreaks in the same
   * direction. See AthleteController.applyNameSort().
   *
   * The Belt column keeps the standard 2-state PrimeNG cycle via
   * `onSort()`; this method is wired only to the Full name <th>.
   */
  cycleFullNameSort(): void {
    const f = this.sortField();
    const o = this.sortOrder();

    let nextField: AthleteSortField;
    let nextOrder: AthleteSortOrder;
    if (f === 'first_name' && o === 'asc') {
      nextField = 'first_name';
      nextOrder = 'desc';
    } else if (f === 'first_name' && o === 'desc') {
      nextField = 'last_name';
      nextOrder = 'asc';
    } else if (f === 'last_name' && o === 'asc') {
      nextField = 'last_name';
      nextOrder = 'desc';
    } else {
      // Coming from any other state (null, belt, created_at, or last desc):
      // restart the cycle at first asc — the most common starting point
      // for "alphabetical by first name" expectations.
      nextField = 'first_name';
      nextOrder = 'asc';
    }

    this.sortField.set(nextField);
    this.sortOrder.set(nextOrder);
    this.resetPage();
    this.load();
  }

  /**
   * Compact two-character signifier for the Full name header — letter
   * indicates which name leads the sort (`F` first / `L` last), arrow
   * indicates direction. Returns null when the active sort isn't a name
   * sort, so the template can render a default neutral state.
   */
  readonly fullNameSortLabel = computed<string | null>(() => {
    const f = this.sortField();
    const o = this.sortOrder();
    if (f !== 'first_name' && f !== 'last_name') return null;
    const lead = f === 'first_name' ? 'F' : 'L';
    const arrow = o === 'asc' ? '↑' : '↓';
    return `${lead}${arrow}`;
  });

  /**
   * Plain-English tooltip for the Full name header — Norman § signifier:
   * the compact F↑/L↓ indicator carries the meaning at a glance, the
   * tooltip spells it out for the first-time user.
   */
  readonly fullNameSortTooltip = computed<string>(() => {
    const f = this.sortField();
    const o = this.sortOrder();
    if (f !== 'first_name' && f !== 'last_name') {
      return 'Click to sort by first name (A → Z)';
    }
    const lead = f === 'first_name' ? 'first name' : 'last name';
    const direction = o === 'asc' ? 'A → Z' : 'Z → A';
    return `Sorted by ${lead} (${direction}). Click to cycle.`;
  });

  /**
   * `aria-sort` value for the Full name <th>. WAI-ARIA only knows
   * `ascending` / `descending` / `none` — it doesn't differentiate which
   * field is the lead, so the screen reader gets the direction here and
   * the lead through the inner button's aria-label (which mirrors the
   * tooltip). Together they convey the full state to AT users (#199
   * follow-up to Copilot a11y review).
   */
  readonly fullNameAriaSort = computed<'ascending' | 'descending' | 'none'>(() => {
    const f = this.sortField();
    if (f !== 'first_name' && f !== 'last_name') return 'none';
    return this.sortOrder() === 'asc' ? 'ascending' : 'descending';
  });

  /**
   * Belt sort cycle (#210, follow-up to #205). Same pattern as the
   * Full-name column but with only 2 states (asc / desc), since Belt
   * isn't a synthetic column — there's no first-vs-last lead to choose,
   * just a direction. The cycle:
   *
   *   none/other → asc → desc → asc → ...
   *
   * Backend's `applyBeltSort` is rank-aware (white < blue < ... < black)
   * with stripes desc + last_name asc as stable tiebreakers. Direction
   * here is the rank direction.
   *
   * Replaces the old `pSortableColumn="belt"` + `<p-sortIcon>` pair so
   * the active visual reads from OUR signals — when the sort moves to
   * first/last_name, this column's arrow goes back to neutral instead
   * of staying highlighted via PrimeNG's stale internal state.
   */
  cycleBeltSort(): void {
    const f = this.sortField();
    const o = this.sortOrder();

    let nextOrder: AthleteSortOrder;
    if (f === 'belt' && o === 'asc') {
      nextOrder = 'desc';
    } else {
      // First click on the column or coming in from any other state
      // (null, name sort, etc.) → start at asc, the conventional default.
      nextOrder = 'asc';
    }

    this.sortField.set('belt');
    this.sortOrder.set(nextOrder);
    this.resetPage();
    this.load();
  }

  /**
   * Compact direction signifier for the Belt header. `↑` when asc,
   * `↓` when desc, `↕` when the sort is on a different column. Matches
   * the visual rhythm of the Full-name signifier.
   */
  readonly beltSortLabel = computed<string>(() => {
    if (this.sortField() !== 'belt') return '↕';
    return this.sortOrder() === 'asc' ? '↑' : '↓';
  });

  /** Plain-English tooltip — Norman § signifier. */
  readonly beltSortTooltip = computed<string>(() => {
    const f = this.sortField();
    if (f !== 'belt') {
      return 'Click to sort by belt rank (white → black)';
    }
    const direction = this.sortOrder() === 'asc' ? 'white → black' : 'black → white';
    return `Sorted by belt (${direction}). Click to flip.`;
  });

  /** WAI-ARIA sort state for the Belt <th>. */
  readonly beltAriaSort = computed<'ascending' | 'descending' | 'none'>(() => {
    if (this.sortField() !== 'belt') return 'none';
    return this.sortOrder() === 'asc' ? 'ascending' : 'descending';
  });

  goToNew(): void {
    void this.router.navigate(['/dashboard/athletes/new']);
  }

  goToEdit(athlete: Athlete): void {
    void this.router.navigate(['/dashboard/athletes', athlete.id, 'edit']);
  }

  goToDocuments(athlete: Athlete): void {
    void this.router.navigate(['/dashboard/athletes', athlete.id, 'documents']);
  }

  confirmDelete(event: Event, athlete: Athlete): void {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: `Delete ${athlete.first_name} ${athlete.last_name}?`,
      accept: () => this.delete(athlete),
    });
  }

  /**
   * Inline paid toggle on the athletes list (#182). Click the badge →
   * confirm popup anchored on the badge button → POST /payments to mark
   * paid, or DELETE /payments/{year}/{month} to mark unpaid. The local
   * `paid_current_month` flips optimistically on success — we don't
   * re-fetch the page because the only state that changed is the one
   * we just toggled.
   *
   * The confirm popup is the friction layer that prevents accidental
   * mis-clicks on a touch device (Krug + Norman: destructive-feeling
   * actions ask once). Both directions are confirmed — flipping a
   * paid-by-mistake row back to unpaid IS a write to the ledger that
   * an oncall should not regret.
   */
  confirmTogglePaid(event: MouseEvent, athlete: Athlete): void {
    // Use UTC year/month/label to align with the server's
    // `paid_current_month` derivation. The server runs in app
    // timezone (UTC); around month boundaries (e.g. 23:30 Italy
    // local on April 30 is May 1 UTC), local-clock arithmetic
    // would write a different (year, month) than the server reads
    // back, so the badge would show a confused state on the next
    // page load. UTC on both ends keeps the round-trip honest
    // (#259 Copilot review).
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const monthLabel = now.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const fullName = `${athlete.first_name} ${athlete.last_name}`;
    const willMarkPaid = !athlete.paid_current_month;
    const message = willMarkPaid
      ? `Mark ${fullName} paid for ${monthLabel}?`
      : `Mark ${fullName} unpaid for ${monthLabel}?`;

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message,
      accept: () => this.applyPaidToggle(athlete, year, month, willMarkPaid),
    });
  }

  private applyPaidToggle(athlete: Athlete, year: number, month: number, markPaid: boolean): void {
    // Single shared `void` observable — markPaid returns the created
    // payment row but the caller only cares about success/failure here,
    // so we collapse to `void` via map(() => undefined). Keeps the
    // `.subscribe({ next, error })` shape uniform on both branches
    // (TypeScript would otherwise reject the union of two differently-
    // typed observables on the same `.subscribe` call).
    const op$ = markPaid
      ? this.paymentService.markPaid(athlete.id, year, month).pipe(map(() => undefined))
      : this.paymentService.unmarkPaid(athlete.id, year, month);

    op$.subscribe({
      next: () => {
        // Optimistic local-state update — we replace just this row's
        // `paid_current_month` flag instead of reloading the whole
        // page. The signal swap forces OnPush to re-render the badge.
        this.athletes.update((rows) =>
          rows.map((a) => (a.id === athlete.id ? { ...a, paid_current_month: markPaid } : a)),
        );
        this.messageService.add({
          severity: 'success',
          summary: markPaid ? 'Marked paid' : 'Marked unpaid',
          detail: `${athlete.first_name} ${athlete.last_name} — ${month}/${year}`,
          life: 3000,
        });
      },
      error: (err: { status?: number }) => {
        // 422 means the academy never set monthly_fee_cents — UI shouldn't
        // have surfaced the action in the first place (gated on
        // `hasMonthlyFee()`), but if it slips through we explain.
        const detail =
          err.status === 422
            ? 'Set a monthly fee on the academy first to record payments.'
            : "Couldn't update the payment. Please try again.";
        this.messageService.add({ severity: 'error', summary: 'Error', detail, life: 4000 });
      },
    });
  }

  statusSeverity(status: AthleteStatus): 'success' | 'warn' | 'secondary' {
    switch (status) {
      case 'active':
        return 'success';
      case 'suspended':
        return 'warn';
      case 'inactive':
        return 'secondary';
    }
  }

  statusLabel(status: AthleteStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private resetPage(): void {
    this.page = 1;
    this.first.set(0);
  }

  private load(): void {
    this.loading.set(true);
    const filters: AthleteFilters = { page: this.page };
    const belt = this.selectedBelt();
    const status = this.selectedStatus();
    if (belt) filters.belt = belt;
    if (status) filters.status = status;
    const sort = this.sortField();
    if (sort) {
      filters.sortBy = sort;
      filters.sortOrder = this.sortOrder();
    }
    const q = this.searchTerm().trim();
    if (q) filters.q = q;
    // Gate `paid` on `hasMonthlyFee()` so a stale `selectedPaid` signal
    // doesn't keep filtering after the owner clears `monthly_fee_cents`
    // (the select itself disappears in that state, leaving the user with
    // no UI to reset it). Belt-and-braces: clearer to the backend, and
    // the empty-state hint stops blaming a filter the user can't see.
    const paid = this.hasMonthlyFee() ? this.selectedPaid() : '';
    if (paid) filters.paid = paid;

    this.athleteService
      .list(filters)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.athletes.set(res.data);
          this.totalRecords.set(res.meta.total);
        },
        error: () => {
          this.athletes.set([]);
          this.totalRecords.set(0);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Could not load athletes. Please try again.',
            life: 4000,
          });
        },
      });
  }

  private delete(athlete: Athlete): void {
    this.athleteService.delete(athlete.id).subscribe({
      next: () => {
        this.athletes.update((list) => list.filter((a) => a.id !== athlete.id));
        this.totalRecords.update((n) => n - 1);
        this.messageService.add({
          severity: 'success',
          summary: 'Deleted',
          detail: `${athlete.first_name} ${athlete.last_name} removed.`,
          life: 3000,
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Could not delete athlete. Please try again.',
          life: 4000,
        });
      },
    });
  }
}
