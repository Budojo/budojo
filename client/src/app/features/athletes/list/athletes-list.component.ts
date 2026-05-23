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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Menu, MenuModule } from 'primeng/menu';
import { PaginatorModule } from 'primeng/paginator';
import { Tooltip } from 'primeng/tooltip';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AcademyService } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import {
  Athlete,
  AthleteFilters,
  AthleteListStatus,
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
import { FilterSheetComponent } from '../../../shared/components/filter-sheet/filter-sheet.component';
import { ExpiringDocumentsWidgetComponent } from '../../../shared/components/expiring-documents-widget/expiring-documents-widget.component';
import { MonthlySummaryWidgetComponent } from '../../../shared/components/monthly-summary-widget/monthly-summary-widget.component';
import { UnpaidThisMonthWidgetComponent } from '../../../shared/components/unpaid-this-month-widget/unpaid-this-month-widget.component';
import { PaidBadgeComponent } from '../../../shared/components/paid-badge/paid-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { OnboardingChecklistComponent } from '../../onboarding/onboarding-checklist.component';
import { OnboardingService } from '../../../core/services/onboarding.service';

interface SelectOption<T extends string> {
  label: string;
  value: T | '';
}

@Component({
  selector: 'app-athletes-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
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
    ConfirmDialog,
    MenuModule,
    PaginatorModule,
    Tooltip,
    TranslatePipe,
    AgeBadgeComponent,
    FilterSheetComponent,
    BeltBadgeComponent,
    ExpiringDocumentsWidgetComponent,
    MonthlySummaryWidgetComponent,
    UnpaidThisMonthWidgetComponent,
    PaidBadgeComponent,
    OnboardingChecklistComponent,
    PageHeaderComponent,
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
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly onboardingService = inject(OnboardingService);

  readonly athletes = signal<Athlete[]>([]);
  readonly totalRecords = signal(0);

  // Owner-only route — the link always uses the owner shell.
  protected readonly PUBLIC_PROFILE_BASE = '/dashboard/u';

  /**
   * Translated count chip for <app-page-header>. Returns null while loading
   * or when the academy has zero athletes — the header collapses the chip
   * cleanly in those cases.
   */
  protected readonly totalCountLabel = computed<string | null>(() => {
    const total = this.totalRecords();
    if (this.loading() || total === 0) {
      return null;
    }
    const key = total === 1 ? 'athletes.list.totalCountOne' : 'athletes.list.totalCountOther';
    return this.translate.instant(key, { count: total });
  });
  readonly loading = signal(true);

  selectedBelt = signal<Belt | ''>('');
  selectedStatus = signal<AthleteListStatus | ''>('');
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
   * Current-month labels for the "Paid" column (#282). BOTH labels are
   * derived from a single `Date` instance (`_now`) so they can never
   * disagree across a UTC month boundary — Copilot caught this on #289:
   * two separate `new Date()` calls during initialization could legally
   * straddle midnight UTC and produce a header reading "Paid · Apr"
   * with a tooltip reading "May 2026 — Unpaid".
   *
   * Derived once per component instance for the date itself; the locale
   * is read from `LanguageService.currentLang()` so toggling EN ↔ IT
   * re-renders both surfaces in the active language.
   */
  private readonly _now = new Date();

  /**
   * NOTE: pinned to `en-US` (not `en-GB` from `localeFor`) for English
   * specifically because `month: 'short'` returns the 4-char "Sept"
   * under en-GB (modern Intl) — the paid-column header design relies
   * on a 3-char token ("Apr" / "Sep" / "Oct") for column-width stability.
   * `en-US` returns 3-char tokens for every month, including September.
   * Long-form month-name screens elsewhere DO use the shared
   * `localeFor()` helper (en-GB) to get day-first dates; only this
   * fixed-width 3-char-month spot opts out.
   */
  private readonly locale = computed<string>(() =>
    this.languageService.currentLang() === 'it' ? 'it-IT' : 'en-US',
  );

  readonly currentMonthShort = computed<string>(() =>
    this._now.toLocaleString(this.locale(), {
      month: 'short',
      timeZone: 'UTC',
    }),
  );

  readonly currentMonthLong = computed<string>(() =>
    this._now.toLocaleString(this.locale(), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
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

  // Belt → translation key map. Same exhaustive `Record<Belt, string>`
  // pattern as DailyAttendanceComponent (#339): adding a new Belt member
  // fails TS compilation here until the matching translation key is added.
  // Order is kept separate (IBJJF rank, kids → adults → senior coral/red)
  // because Record key order isn't a language guarantee.
  private readonly beltLabelKeys: Record<Belt, string> = {
    grey: 'belts.grey',
    yellow: 'belts.yellow',
    orange: 'belts.orange',
    green: 'belts.green',
    white: 'belts.white',
    blue: 'belts.blue',
    purple: 'belts.purple',
    brown: 'belts.brown',
    black: 'belts.black',
    'red-and-black': 'belts.redAndBlack',
    'red-and-white': 'belts.redAndWhite',
    red: 'belts.red',
  };

  private readonly beltOrder: readonly (Belt | '')[] = [
    '',
    'grey',
    'yellow',
    'orange',
    'green',
    'white',
    'blue',
    'purple',
    'brown',
    'black',
    'red-and-black',
    'red-and-white',
    'red',
  ];

  readonly beltOptions = computed<SelectOption<Belt>[]>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return this.beltOrder.map((value) => ({
      label:
        value === ''
          ? this.translate.instant('belts.all')
          : this.translate.instant(this.beltLabelKeys[value]),
      value,
    }));
  });

  // Same exhaustiveness pattern as belts. AthleteListStatus is the
  // load-bearing type — adding a new status case fails TS until a
  // matching key is added. The 'trashed' entry is a query-scope
  // toggle (server resolves it to `->onlyTrashed()`), not a stored
  // value on `athletes.status`.
  private readonly statusLabelKeys: Record<AthleteListStatus, string> = {
    active: 'statuses.active',
    suspended: 'statuses.suspended',
    inactive: 'statuses.inactive',
    trashed: 'statuses.trashed',
  };

  private readonly statusOrder: readonly (AthleteListStatus | '')[] = [
    '',
    'active',
    'suspended',
    'inactive',
    'trashed',
  ];

  readonly statusOptions = computed<SelectOption<AthleteListStatus>[]>(() => {
    this.languageService.currentLang();
    return this.statusOrder.map((value) => ({
      label:
        value === ''
          ? this.translate.instant('statuses.all')
          : this.translate.instant(this.statusLabelKeys[value]),
      value,
    }));
  });

  /**
   * True when the user picked "Cancellati" / "Deleted" in the status
   * filter — the list is in restore-picker mode and per-row actions
   * collapse to a single Restore CTA (#700).
   */
  readonly isTrashedMode = computed<boolean>(() => this.selectedStatus() === 'trashed');

  /**
   * Count of currently-active filters for the mobile filter-sheet
   * badge (#704). Excludes the free-text search — that one is
   * keyboard-driven and not collapsed into the sheet.
   */
  readonly activeFilterCount = computed<number>(() => {
    let count = 0;
    if (this.selectedBelt() !== '') count += 1;
    if (this.selectedStatus() !== '') count += 1;
    if (this.selectedPaid() !== '') count += 1;
    return count;
  });

  readonly paidOptions = computed<SelectOption<AthletePaidFilter>[]>(() => {
    this.languageService.currentLang();
    return [
      { label: this.translate.instant('athletes.list.paidOptions.all'), value: '' },
      { label: this.translate.instant('athletes.list.paidOptions.yes'), value: 'yes' },
      { label: this.translate.instant('athletes.list.paidOptions.no'), value: 'no' },
    ];
  });

  ngOnInit(): void {
    // Hydrate `selectedPaid` from the `paid` query param so the
    // unpaid-widget CTA (#803) — and any future deep-link / refresh
    // — lands with the filter applied. The subscription emits once
    // immediately with the current params, which replaces the
    // previous unconditional `this.load()` call.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const paid = params.get('paid');
      this.selectedPaid.set(paid === 'yes' || paid === 'no' ? paid : '');
      this.resetPage();
      this.load();
    });
    // Lazy-load onboarding state — only when the user hasn't already
    // dismissed/completed the tour. The component itself is the
    // visibility gate; a single HTTP call hydrates the state.
    if (!this.onboardingService.loaded()) {
      this.onboardingService.load().subscribe({
        // Silent on error — the checklist just won't render, which is
        // the no-op default anyway.
        error: () => {},
      });
    }
  }

  onBeltChange(belt: Belt | ''): void {
    this.selectedBelt.set(belt);
    this.resetPage();
    this.load();
  }

  onStatusChange(status: AthleteListStatus | ''): void {
    this.selectedStatus.set(status);
    this.resetPage();
    this.load();
  }

  /**
   * Confirm + execute a single-athlete restore (#700). Mirrors the
   * destroy confirm-popover pattern; copy is intentionally lighter
   * (no document-loss warning) because restore is non-destructive —
   * the popover exists to absorb a misclick.
   */
  confirmRestore(event: Event, athlete: Athlete): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: this.translate.instant('athletes.list.restoreConfirm.message', {
        name: `${athlete.first_name} ${athlete.last_name}`.trim(),
      }),
      acceptLabel: this.translate.instant('athletes.list.restoreConfirm.accept'),
      rejectLabel: this.translate.instant('athletes.list.restoreConfirm.reject'),
      acceptButtonProps: { severity: 'primary' },
      accept: () => this.restore(athlete),
    });
  }

  private restore(athlete: Athlete): void {
    this.athleteService.restore(athlete.id).subscribe({
      next: () => {
        // Drop the athlete from the trashed list — they're now active
        // and would no longer match the `?status=trashed` scope on a
        // fresh load. The toast confirms the action; the user can
        // switch the filter back to "All" / "Active" to see them.
        this.athletes.update((list) => list.filter((a) => a.id !== athlete.id));
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('athletes.list.restoreToast.successSummary'),
          life: 2500,
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.list.restoreToast.errorSummary'),
          detail: this.translate.instant('athletes.list.restoreToast.errorDetail'),
          life: 4000,
        });
      },
    });
  }

  onPaidChange(paid: AthletePaidFilter | ''): void {
    // Echo the dropdown choice back into the URL so refresh / share /
    // back-button preserve the active filter — and so the
    // `queryParamMap` subscription stays the single source of truth
    // for hydration. `queryParamsHandling: 'merge'` leaves the other
    // filter params (belt, status) untouched.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { paid: paid === '' ? null : paid },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * No-op handler bound to `(apply)` on the mobile filter-sheet (#704).
   * The sheet's `on*Change` handlers already fire a load on every
   * dropdown change, so "Apply" effectively means "close" — the
   * component's internal `onApply()` calls `closeSheet()` after
   * emitting. We still bind the output so Copilot doesn't flag an
   * unused emitter (and the contract stays explicit at the call site).
   */
  protected noop(): void {
    // intentionally empty — see method docblock
  }

  /**
   * "Reset" action on the mobile filter-sheet (#704). Clears every
   * dropdown in one shot and re-runs the load. The free-text search
   * box stays untouched — clearing it is its own dedicated affordance.
   */
  resetFilters(): void {
    this.selectedBelt.set('');
    this.selectedStatus.set('');
    this.selectedPaid.set('');
    this.resetPage();
    this.load();
    // Drop the `paid` query param from the URL so a refresh after
    // reset doesn't re-apply the filter the user just cleared
    // (#803, reviewer finding on PR #804). `replaceUrl: true` keeps
    // the back button from going to the half-reset state. We don't
    // re-trigger the queryParamMap subscription with a `null`-only
    // navigate when the param is already absent — Angular skips the
    // navigation as a no-op, no extra load() fires.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { paid: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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

  onPageChange(event: { first?: number; rows?: number }): void {
    // The <p-table>'s `(onPage)` and the <p-paginator>'s `(onPageChange)`
    // both emit `{ first, rows, page, pageCount }`. The PrimeNG typing
    // for the paginator declares `first` / `rows` as optional, so we
    // accept the broader shape and defensively default to 0/20 if a
    // future emitter ever omits them.
    const first = event.first ?? 0;
    const rows = event.rows ?? 20;
    this.page = Math.floor(first / rows) + 1;
    this.first.set(first);
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
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const f = this.sortField();
    const o = this.sortOrder();
    if (f !== 'first_name' && f !== 'last_name') {
      return this.translate.instant('athletes.list.tooltip.fullNameSortInitial');
    }
    const key =
      f === 'first_name'
        ? o === 'asc'
          ? 'athletes.list.tooltip.fullNameSortFirstAsc'
          : 'athletes.list.tooltip.fullNameSortFirstDesc'
        : o === 'asc'
          ? 'athletes.list.tooltip.fullNameSortLastAsc'
          : 'athletes.list.tooltip.fullNameSortLastDesc';
    return this.translate.instant(key);
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
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const f = this.sortField();
    if (f !== 'belt') {
      return this.translate.instant('athletes.list.tooltip.beltSortInitial');
    }
    return this.translate.instant(
      this.sortOrder() === 'asc'
        ? 'athletes.list.tooltip.beltSortAsc'
        : 'athletes.list.tooltip.beltSortDesc',
    );
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

  // ── Mobile card 3-dot menu (#670) ──────────────────────────────────────
  //
  // The mobile card layout collapses the inline pencil + trash buttons into
  // a single 3-dot menu trigger (Apple-minimalist pattern). Tapping the
  // trigger opens a popup `<p-menu>` whose model is built per-athlete each
  // time. Delete from the menu routes to a centered `<p-confirmDialog>`
  // instead of the desktop confirm-popup (no good anchor on mobile).
  @ViewChild('cardMenu') protected cardMenu?: Menu;
  protected readonly cardMenuItems = signal<MenuItem[]>([]);

  protected openCardMenu(event: Event, athlete: Athlete): void {
    // Build the menu model conditionally: the destructive Delete is
    // always present; Payments only if the academy tracks a monthly
    // fee AND this row isn't the owner-self row; Public profile only
    // when the linked user has a handle. The remaining quick-jumps
    // (Detail, Documents, Promotions, Edit) are always present —
    // each one is a single tap away from the deep-link the menu
    // hides today.
    const fullName = `${athlete.first_name} ${athlete.last_name}`;
    const items: MenuItem[] = [
      {
        label: this.translate.instant('athletes.list.tooltip.viewProfile'),
        icon: 'pi pi-id-card',
        command: () => this.goToDetail(athlete),
      },
      {
        label: this.translate.instant('athletes.list.tooltip.documents'),
        icon: 'pi pi-file',
        command: () => this.goToTab(athlete, 'documents'),
      },
    ];

    if (this.hasMonthlyFee() && !athlete.is_self) {
      items.push({
        label: this.translate.instant('athletes.list.tooltip.payments'),
        icon: 'pi pi-wallet',
        command: () => this.goToTab(athlete, 'payments'),
      });
    }

    items.push({
      label: this.translate.instant('athletes.list.tooltip.promotions'),
      icon: 'pi pi-trophy',
      command: () => this.goToTab(athlete, 'promotions'),
    });

    if (athlete.user_handle) {
      items.push({
        label: this.translate.instant('athletes.list.tooltip.publicProfile'),
        icon: 'pi pi-user',
        command: () => this.goToPublicProfile(athlete),
      });
    }

    items.push(
      {
        label: this.translate.instant('athletes.list.tooltip.edit'),
        icon: 'pi pi-pencil',
        command: () => this.goToEdit(athlete),
      },
      {
        label: this.translate.instant('athletes.list.tooltip.delete'),
        icon: 'pi pi-trash',
        styleClass: 'menu-item--danger',
        command: () => this.confirmDeleteFromCardMenu(athlete),
      },
    );

    // Suppress the unused-binding warning — the menu reads the name
    // when the screen-reader announces the open command on focus.
    void fullName;

    this.cardMenuItems.set(items);
    this.cardMenu?.toggle(event);
  }

  private goToDetail(athlete: Athlete): void {
    void this.router.navigate(['/dashboard/athletes', athlete.id]);
  }

  private goToTab(athlete: Athlete, tab: 'documents' | 'payments' | 'promotions'): void {
    void this.router.navigate(['/dashboard/athletes', athlete.id, tab]);
  }

  private goToPublicProfile(athlete: Athlete): void {
    if (athlete.user_handle) {
      void this.router.navigate(['/dashboard/u', athlete.user_handle]);
    }
  }

  /**
   * Mobile-card delete confirmation. Routes through the same
   * `delete(athlete)` handler as the desktop popup-anchored flow, but
   * uses a centered `<p-confirmDialog>` (keyed `athlete-delete-mobile`)
   * instead of `<p-confirmpopup>` because the menu item that triggers
   * this has no good anchor on a phone — the popup would render
   * offscreen or clipped.
   */
  protected confirmDeleteFromCardMenu(athlete: Athlete): void {
    this.confirmationService.confirm({
      key: 'athlete-delete-mobile',
      message: this.translate.instant('athletes.list.confirm.deleteMessage', {
        name: `${athlete.first_name} ${athlete.last_name}`,
      }),
      acceptLabel: this.translate.instant('athletes.list.confirm.deleteAccept'),
      rejectLabel: this.translate.instant('athletes.list.confirm.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.delete(athlete),
    });
  }

  confirmDelete(event: Event, athlete: Athlete): void {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: this.translate.instant('athletes.list.confirm.deleteMessage', {
        name: `${athlete.first_name} ${athlete.last_name}`,
      }),
      acceptLabel: this.translate.instant('athletes.list.confirm.deleteAccept'),
      rejectLabel: this.translate.instant('athletes.list.confirm.cancel'),
      acceptButtonProps: { severity: 'danger' },
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
    const monthLabel = now.toLocaleString(this.locale(), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const fullName = `${athlete.first_name} ${athlete.last_name}`;
    const willMarkPaid = !athlete.paid_current_month;
    const message = this.translate.instant(
      willMarkPaid
        ? 'athletes.list.confirm.markPaidMessage'
        : 'athletes.list.confirm.markUnpaidMessage',
      { name: fullName, month: monthLabel },
    );

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message,
      acceptLabel: this.translate.instant(
        willMarkPaid
          ? 'athletes.list.confirm.markPaidAccept'
          : 'athletes.list.confirm.markUnpaidAccept',
      ),
      rejectLabel: this.translate.instant('athletes.list.confirm.cancel'),
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
          summary: this.translate.instant(
            markPaid ? 'athletes.list.toast.markedPaid' : 'athletes.list.toast.markedUnpaid',
          ),
          detail: this.translate.instant(
            markPaid
              ? 'athletes.list.toast.markedPaidDetail'
              : 'athletes.list.toast.markedUnpaidDetail',
            {
              name: `${athlete.first_name} ${athlete.last_name}`,
              month,
              year,
            },
          ),
          life: 3000,
        });
      },
      error: (err: { status?: number }) => {
        // 422 means the academy never set monthly_fee_cents — UI shouldn't
        // have surfaced the action in the first place (gated on
        // `hasMonthlyFee()`), but if it slips through we explain.
        const detail = this.translate.instant(
          err.status === 422
            ? 'athletes.list.toast.paidErrorMissingFee'
            : 'athletes.list.toast.paidErrorGeneric',
        );
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.list.toast.errorSummary'),
          detail,
          life: 4000,
        });
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
    return this.translate.instant(this.statusLabelKeys[status]);
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
            summary: this.translate.instant('athletes.list.toast.errorSummary'),
            detail: this.translate.instant('athletes.list.toast.loadErrorDetail'),
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
          summary: this.translate.instant('athletes.list.toast.deletedSummary'),
          detail: this.translate.instant('athletes.list.toast.deletedDetail', {
            name: `${athlete.first_name} ${athlete.last_name}`,
          }),
          life: 3000,
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.list.toast.errorSummary'),
          detail: this.translate.instant('athletes.list.toast.deleteErrorDetail'),
          life: 4000,
        });
      },
    });
  }
}
