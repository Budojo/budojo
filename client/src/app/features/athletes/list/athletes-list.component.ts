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

  readonly beltOptions: SelectOption<Belt>[] = [
    { label: 'All belts', value: '' },
    { label: 'White', value: 'white' },
    { label: 'Blue', value: 'blue' },
    { label: 'Purple', value: 'purple' },
    { label: 'Brown', value: 'brown' },
    { label: 'Black', value: 'black' },
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
   * PrimeNG p-table emits `{ field, order }` on header click.
   * `order` is 1 (asc) or -1 (desc). We map to our `'asc' | 'desc'` and
   * fire a fresh load. Re-clicking the same column flips the order.
   *
   * `stripes` is NOT in the allowlist (#101): it's a within-belt tiebreaker
   * only, applied automatically by the backend when sort_by=belt. Allowing
   * it as a primary sort would let a 4-stripe blue belt appear above a
   * 0-stripe black belt — never the right ordering.
   */
  onSort(event: { field?: string; order?: number }): void {
    const allowed: AthleteSortField[] = ['first_name', 'last_name', 'belt', 'created_at'];
    const field = event.field;
    if (!field || !(allowed as string[]).includes(field)) return;

    this.sortField.set(field as AthleteSortField);
    this.sortOrder.set(event.order === 1 ? 'asc' : 'desc');
    this.resetPage();
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
