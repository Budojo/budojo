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
import { Menu, MenuModule } from 'primeng/menu';
import { PaginatorModule } from 'primeng/paginator';
import { Tooltip } from 'primeng/tooltip';
import { Popover } from 'primeng/popover';
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
  type PaymentCoverage,
} from '../../../core/services/athlete.service';
import { PaymentService } from '../../../core/services/payment.service';
import { RuntimeService } from '../../../core/services/runtime.service';
import { AthleteIdentityComponent } from '../../../shared/components/athlete-identity/athlete-identity.component';
import { BeltBadgeComponent } from '../../../shared/components/belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../../../shared/components/user-avatar/user-avatar.component';
import { AgeBadgeComponent } from '../../../shared/components/age-badge/age-badge.component';
import { FilterSheetComponent } from '../../../shared/components/filter-sheet/filter-sheet.component';
import { UnpaidThisMonthWidgetComponent } from '../../../shared/components/unpaid-this-month-widget/unpaid-this-month-widget.component';
import { PaidBadgeComponent } from '../../../shared/components/paid-badge/paid-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconButtonComponent } from '../../../shared/components/icon-button/icon-button.component';
import { OnboardingChecklistComponent } from '../../onboarding/onboarding-checklist.component';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { academyChargesAFee } from '../../../shared/utils/academy-fee';
import {
  countScheduledTrainingDays,
  countScheduledTrainingDaysBetween,
  schedulesForAcademy,
} from '../../../shared/utils/attendance-rate';
import { DocumentService } from '../../../core/services/document.service';
import { BELT_KEYS, BELT_ORDER } from '../../../shared/utils/i18n-enum-keys';
import { localeFor } from '../../../shared/utils/locale';
import { CarnetService } from '../../../core/services/carnet.service';

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
    MenuModule,
    PaginatorModule,
    Tooltip,
    Popover,
    TranslatePipe,
    AgeBadgeComponent,
    FilterSheetComponent,
    BeltBadgeComponent,
    AthleteIdentityComponent,
    UserAvatarComponent,
    UnpaidThisMonthWidgetComponent,
    PaidBadgeComponent,
    OnboardingChecklistComponent,
    PageHeaderComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    IconButtonComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './athletes-list.component.html',
  styleUrl: './athletes-list.component.scss',
})
export class AthletesListComponent implements OnInit {
  private readonly athleteService = inject(AthleteService);
  private readonly paymentService = inject(PaymentService);
  private readonly carnetService = inject(CarnetService);
  private readonly academyService = inject(AcademyService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  /**
   * The public profile lives behind `capabilityGuard('community')`, and the
   * desktop runtime has no capabilities at all — so every affordance leading
   * there has to ask first, or it offers a control the guard will refuse
   * (#1349).
   */
  protected readonly runtime = inject(RuntimeService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly onboardingService = inject(OnboardingService);
  private readonly documentService = inject(DocumentService);

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
  /**
   * True when the most recent roster load failed. Drives the inline
   * <app-error-state> banner — the audit flagged the old scroll-away toast
   * as the worst "load failed" shape (#1033 / #1037). Reset on each load.
   */
  readonly loadError = signal(false);

  selectedBelt = signal<Belt | ''>('');
  /**
   * Which statuses the list is showing (#1403).
   *
   * `'active'` rather than `''` is the default now: the roster answers "who
   * trains here", and someone who left is not part of that answer. `''` still
   * means all, and is what the eye toggle switches to.
   */
  selectedStatus = signal<AthleteListStatus | ''>('active');
  selectedPaid = signal<AthletePaidFilter | ''>('');
  /**
   * Rank first, highest first (#1457).
   *
   * The roster used to open in insertion order, which is an answer to
   * "who did I type in last" — a question nobody asks. Belt is what an
   * instructor sorts people by, so that is where the list starts.
   */
  readonly sortField = signal<AthleteSortField | null>('belt');
  readonly sortOrder = signal<AthleteSortOrder>('desc');

  /**
   * The paid badge + filter only make sense when the academy charges
   * something — a flat fee or a price tier (#1381); otherwise there's no
   * expectation of payment to assert against. Reads from the cached
   * `AcademyService.academy()` signal so we never block rendering on an
   * additional fetch (#105).
   */
  readonly hasMonthlyFee = computed(() => academyChargesAFee(this.academyService.academy()));

  /**
   * Rows where a current-month payment is not expected, and the Paid cell
   * shows an em-dash instead of a toggle:
   *
   *   - the owner training in their own academy (#750) — no payment ledger;
   *   - an inactive athlete (#805) — surfacing "Unpaid" there
   *     conflated "no payment recorded" with "owes";
   *   - nobody resolved a fee for them (#1381) — on an academy priced only
   *     by tier, an athlete on no tier owes nothing, and offering the toggle
   *     would send the owner into a 422.
   *
   * `monthly_fee_cents` is absent on pre-#1381 payloads, and `undefined` is
   * read as "a fee applies" so old fixtures and cached responses keep the
   * toggle they have always had.
   */
  paymentNotExpected(athlete: Athlete): boolean {
    return (
      athlete.is_self === true || athlete.status !== 'active' || athlete.monthly_fee_cents === null
    );
  }

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

  // The key map and the rank order both come from `i18n-enum-keys` (#1443).
  // This file used to carry private copies of each; the shared ones are the
  // same two literals, and two of them is how a new belt gets added to one
  // and not the other. Only the leading `''` is local — it is the "all
  // belts" option, which belongs to this dropdown and not to the enum.
  private readonly beltOrder: readonly (Belt | '')[] = ['', ...BELT_ORDER];

  readonly beltOptions = computed<SelectOption<Belt>[]>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    return this.beltOrder.map((value) => ({
      label:
        value === ''
          ? this.translate.instant('belts.all')
          : this.translate.instant(BELT_KEYS[value]),
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
    inactive: 'statuses.inactive',
    trashed: 'statuses.trashed',
  };

  private readonly statusOrder: readonly (AthleteListStatus | '')[] = [
    '',
    'active',
    'inactive',
    'trashed',
  ];

  /**
   * True when the user picked "Cancellati" / "Deleted" in the status
   * filter — the list is in restore-picker mode and per-row actions
   * collapse to a single Restore CTA (#700).
   */
  readonly isTrashedMode = computed<boolean>(() => this.selectedStatus() === 'trashed');

  /**
   * Whether the list is showing anyone who is not active (#1403).
   *
   * Derived from the filter rather than held beside it, which is what stops
   * the eye and the dropdown from being able to disagree: picking "Suspended"
   * from the menu opens the eye, and closing the eye goes back to active. Two
   * controls, one piece of state.
   */
  readonly showingInactive = computed<boolean>(() => this.selectedStatus() !== 'active');

  /**
   * The eye is hidden in the restore picker (#700). That is a mode, not a
   * status, and offering "also show the non-active" inside a list of deleted
   * athletes is a question with no meaning.
   */
  readonly canToggleInactive = computed<boolean>(() => !this.isTrashedMode());

  /**
   * Count of currently-active filters for the mobile filter-sheet
   * badge (#704). Excludes the free-text search — that one is
   * keyboard-driven and not collapsed into the sheet.
   */
  readonly activeFilterCount = computed<number>(() => {
    let count = 0;
    if (this.selectedBelt() !== '') count += 1;
    // The default is `active`, so that is what counts as "no filter" now.
    if (this.selectedStatus() !== 'active') count += 1;
    // Payment is deliberately NOT counted any more (#1446): the sheet no
    // longer contains that control — it moved to the shared row beside the
    // eye, where it renders on the phone too and shows its own state. A
    // badge counting a filter the sheet does not display sends the user to
    // open a sheet that has nothing to do with it. `resetFilters()` leaves
    // it alone for the same reason.
    return count;
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
    this.loadAlerts();
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
   * The eye (#1403): show everyone, or only the actives.
   *
   * It writes the same signal the dropdown does — it is a shortcut for two of
   * its values, not a second switch layered on top.
   */
  toggleInactive(): void {
    this.onStatusChange(this.showingInactive() ? 'active' : '');
  }

  /**
   * In and out of the restore picker (#1426).
   *
   * The one job the status select did that the eye does not: "who did I
   * delete" is a different question from "who trains here", not a wider
   * answer to it — so it gets its own control rather than a value buried in
   * a filter menu. Leaving it returns to the default list, not to whatever
   * the eye was showing before, because the two are independent views and
   * restoring someone is a finished errand.
   */
  toggleTrashed(): void {
    this.onStatusChange(this.isTrashedMode() ? 'active' : 'trashed');
  }

  /** True for a row the eye revealed: rendered muted, with its status named. */
  protected isNotActive(athlete: Athlete): boolean {
    return athlete.status !== 'active';
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
   * Empty-state "Clear filters" CTA target (#1090 reviewer). Unlike
   * `resetFilters()` — which preserves the search box because the mobile
   * filter-sheet has its own dedicated search affordance (#704) — this
   * action clears EVERYTHING that could have narrowed the user into the
   * filtered-empty branch, search included. Without this distinction the
   * CTA dead-ends a user who arrived there via a search term.
   */
  protected clearAllFiltersAndSearch(): void {
    this.searchTerm.set('');
    // Payment too, unlike the sheet's own Reset (#1446): this CTA is the way
    // out of a filtered-empty list, so leaving one filter standing would
    // dead-end the user it exists to rescue. Routed through `onPaidChange`
    // so the URL — the source of truth for this one — is cleared with it.
    this.onPaidChange('');
    this.resetFilters();
  }

  /**
   * "Reset" action on the mobile filter-sheet (#704). Clears every
   * dropdown in one shot and re-runs the load. The free-text search
   * box stays untouched — clearing it is its own dedicated affordance.
   *
   * So is the payment filter, since #1446 moved it out of the sheet and onto
   * the control row: a Reset that silently cleared a filter the sheet never
   * showed would change the list for a reason the user cannot see.
   */
  resetFilters(): void {
    this.selectedBelt.set('');
    // Back to the default, not to "everyone" (#1403): reset means "the list I
    // started from", and that list is the actives.
    this.selectedStatus.set('active');
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
   * 4-state cycle on the Attendance column (#1447).
   *
   * The same shape as `cycleFullNameSort` above, and for the same reason:
   * this is one column carrying two related scalars, so a single sort would
   * only ever answer half of what the column shows. The cycle:
   *
   *   none/other → month desc → month asc → total desc → total asc → month desc
   *
   * **Descending first**, unlike the name column. "Who trains most" is the
   * question a count column is opened with — every leaderboard the user has
   * ever seen starts at the top, and Jakob's law says not to be the one that
   * does not. Names start at A because that is the convention there.
   */
  cycleAttendanceSort(): void {
    const f = this.sortField();
    const o = this.sortOrder();

    let nextField: AthleteSortField;
    let nextOrder: AthleteSortOrder;
    if (f === 'attendance_month' && o === 'desc') {
      nextField = 'attendance_month';
      nextOrder = 'asc';
    } else if (f === 'attendance_month' && o === 'asc') {
      nextField = 'attendance_total';
      nextOrder = 'desc';
    } else if (f === 'attendance_total' && o === 'desc') {
      nextField = 'attendance_total';
      nextOrder = 'asc';
    } else {
      // Any other state — null, belt, a name, or total asc — restarts the
      // cycle at the most-this-month view.
      nextField = 'attendance_month';
      nextOrder = 'desc';
    }

    this.sortField.set(nextField);
    this.sortOrder.set(nextOrder);
    this.resetPage();
    this.load();
  }

  /** True while either attendance sort is the active one. */
  private isAttendanceSort(field: AthleteSortField | null): boolean {
    return field === 'attendance_month' || field === 'attendance_total';
  }

  /**
   * Compact signifier for the Attendance header, mirroring the name column's
   * `F↑` / `L↓`: the letter says which number leads (`M` this month, `T`
   * total), the arrow says the direction. Null when the sort is elsewhere, so
   * the template can fall back to the neutral `↕`.
   */
  readonly attendanceSortLabel = computed<string | null>(() => {
    const f = this.sortField();
    if (!this.isAttendanceSort(f)) return null;
    const lead = f === 'attendance_month' ? 'M' : 'T';
    return `${lead}${this.sortOrder() === 'asc' ? '↑' : '↓'}`;
  });

  /** Plain English for what the signifier abbreviates. Same pairing as the name header. */
  readonly attendanceSortTooltip = computed<string>(() => {
    this.languageService.currentLang();
    const f = this.sortField();
    const o = this.sortOrder();
    if (!this.isAttendanceSort(f)) {
      return this.translate.instant('athletes.list.tooltip.attendanceSortInitial');
    }
    const key =
      f === 'attendance_month'
        ? o === 'desc'
          ? 'athletes.list.tooltip.attendanceSortMonthDesc'
          : 'athletes.list.tooltip.attendanceSortMonthAsc'
        : o === 'desc'
          ? 'athletes.list.tooltip.attendanceSortTotalDesc'
          : 'athletes.list.tooltip.attendanceSortTotalAsc';
    return this.translate.instant(key);
  });

  /** Same contract as `fullNameAriaSort` — direction here, lead in the aria-label. */
  readonly attendanceAriaSort = computed<'ascending' | 'descending' | 'none'>(() => {
    if (!this.isAttendanceSort(this.sortField())) return 'none';
    return this.sortOrder() === 'asc' ? 'ascending' : 'descending';
  });

  /**
   * Whether this server sends attendance numbers at all.
   *
   * `null`/absent means the payload never carried them — a pre-#1447 server,
   * or any endpoint other than the index. Rendering "0" in that case would
   * report that nobody has ever trained, which is a different and much worse
   * lie than showing nothing.
   *
   * **Latched, not derived from the current page.** Reading `athletes()` on
   * every render made the column a property of the rows on screen rather than
   * of the server: it vanished whenever a search or a filter came back empty
   * — including while an attendance sort was active, which left the sort
   * running with no control to turn it off — and again on every skeleton
   * render, so the table shifted sideways each time the roster reloaded.
   * Once a payload proves the server sends the counts, that stays true.
   */
  private readonly attendanceCountsSeen = signal(false);
  readonly hasAttendanceCounts = this.attendanceCountsSeen.asReadonly();

  /**
   * Whether THIS athlete's row carries counts. A different question from
   * `hasAttendanceCounts` above, which asks it of the server once: the
   * column is decided for the whole table, but a card renders per athlete.
   *
   * A method rather than `!= null` in the template — the template lint rule
   * forbids loose equality, and spelling out both halves at the call site
   * reads worse than naming the question.
   */
  protected hasAttendance(athlete: Athlete): boolean {
    return athlete.attendance_month_count !== null && athlete.attendance_month_count !== undefined;
  }

  /**
   * The academy's schedule history, resolved once per render pass.
   *
   * Every denominator below reads it, and it is the same value for every row
   * — pulling it out keeps 20 rows from re-deriving the same back-compat
   * bridge twenty times.
   */
  private readonly schedules = computed(() => schedulesForAcademy(this.academyService.academy()));

  /**
   * Sessions the academy has actually held this month, capped at today.
   * `null` when nobody has configured `training_days` — then the cell falls
   * back to bare counts, the same way the summary widget does.
   */
  private readonly scheduledThisMonth = computed<number | null>(() => {
    const now = new Date();
    return countScheduledTrainingDays(this.schedules(), now.getFullYear(), now.getMonth() + 1);
  });

  /**
   * The day the current season began (#1484), as the server resolved it.
   *
   * Not computed here from `season_start_month`: the boundary rule ("March
   * belongs to the season that started last September") already exists in
   * `App\Support\Season`, and a second copy of it in TypeScript is a second
   * chance to get the off-by-one wrong — in a place where being wrong means
   * the numerator and the denominator measure different windows and the
   * fraction quietly lies.
   *
   * `null` while the academy is still loading; the cell then shows bare
   * counts, exactly as it does when no schedule is configured.
   */
  private readonly seasonStart = computed<Date | null>(() => {
    const iso = this.academyService.academy()?.season_start;
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  /** The season's name for the tooltip — `2025/26`. */
  protected readonly seasonLabel = computed<string>(
    () => this.academyService.academy()?.season_label ?? '',
  );

  /**
   * Sessions held this season, floored at the day THIS athlete joined — a
   * different window per row.
   *
   * Both bounds matter, and for the same reason. The season bound is the
   * point of #1484: a lifetime total answers a question about the gym's
   * history rather than about this year. The joining bound is what keeps that
   * honest per row — someone who arrived in November cannot have attended
   * September's sessions, and dividing by them reports the academy's calendar
   * as if it were their record.
   *
   * Memoised on `joined_at`: the schedule and the season are shared, so two
   * athletes who joined the same day have the same denominator, and the walk
   * is one day at a time.
   *
   * The memo lives inside a `computed` WITH the inputs it was built from, so
   * a new academy discards it. As a bare field it outlived them: the academy
   * arrives over HTTP, the first rows can render before it does, and every
   * `null` computed against an absent schedule was then served forever.
   */
  private readonly seasonDenominators = computed(() => ({
    schedules: this.schedules(),
    seasonStart: this.seasonStart(),
    cache: new Map<string, number | null>(),
  }));

  private scheduledSince(joinedAt: string): number | null {
    const { schedules, seasonStart, cache } = this.seasonDenominators();

    const cached = cache.get(joinedAt);
    if (cached !== undefined) return cached;

    const [y, m, d] = joinedAt.split('-').map(Number);
    const joined = new Date(y, m - 1, d);
    const from = seasonStart !== null && seasonStart > joined ? seasonStart : joined;

    const value = countScheduledTrainingDaysBetween(schedules, from, new Date());
    cache.set(joinedAt, value);
    return value;
  }

  /**
   * Whether this athlete's window starts later than the season's — i.e. they
   * joined mid-year, and their two numbers cover less of it than everyone
   * else's. The tooltip says so; without that the row reads as a low
   * attendance rate rather than a short membership.
   */
  protected joinedMidSeason(athlete: Athlete): boolean {
    const season = this.seasonStart();
    if (season === null) return false;
    const [y, m, d] = athlete.joined_at.split('-').map(Number);
    return new Date(y, m - 1, d) > season;
  }

  /**
   * The two fractions the Sessions cell renders (#1455): attended over held,
   * this month above, the season below (#1484 — it was the athlete's whole
   * history until then).
   *
   * A bare count answers "how often" but not "out of how many", and those are
   * different questions — three sessions is everything in a month with three,
   * and nothing in a month with twelve. `scheduled: null` means the academy
   * has no schedule on file, and the cell then shows the counts alone rather
   * than inventing a denominator.
   */
  protected sessions(athlete: Athlete): {
    monthAttended: number;
    monthScheduled: number | null;
    totalAttended: number;
    totalScheduled: number | null;
  } {
    return {
      monthAttended: athlete.attendance_month_count ?? 0,
      monthScheduled: this.scheduledThisMonth(),
      totalAttended: athlete.attendance_total_count ?? 0,
      totalScheduled: this.scheduledSince(athlete.joined_at),
    };
  }

  /**
   * One line of the cell, as text: `"5/6"`, or `"5"` when there is no
   * denominator to divide by.
   *
   * Composed here rather than in the template because the template cannot
   * hold `{{ a }}/{{ b }}` without the formatter inserting whitespace around
   * the slash — it renders as `5 /6`, which reads as two numbers again and
   * undoes the whole point of the fraction.
   */
  protected sessionsLine(attended: number, scheduled: number | null): string {
    return scheduled === null ? String(attended) : `${attended}/${scheduled}`;
  }

  /**
   * The lower line's tooltip (#1484).
   *
   * The line used to say "Since they joined", and the number under it now
   * counts a single season — so the tooltip has to carry both the window and,
   * for anyone who arrived after it opened, the fact that their window is
   * shorter than the season's. Without the second half a February arrival
   * reads as an athlete who misses most sessions, when the truth is that most
   * of the season happened before they existed.
   */
  protected sessionsTooltip(athlete: Athlete): string {
    this.languageService.currentLang();
    // No academy yet: an empty string renders no tooltip at all, which is
    // the honest answer — better than naming a season we cannot name.
    const season = this.seasonLabel();
    if (!season) return '';

    if (!this.joinedMidSeason(athlete)) {
      return this.translate.instant('athletes.list.attendance.tooltipTotal', { season });
    }

    const [y, m, d] = athlete.joined_at.split('-').map(Number);
    return this.translate.instant('athletes.list.attendance.tooltipTotalJoined', {
      season,
      joined: new Date(y, m - 1, d).toLocaleDateString(
        localeFor(this.languageService.currentLang()),
        { day: 'numeric', month: 'long', year: 'numeric' },
      ),
    });
  }

  /** One label for both stacked lines — the layout alone does not say which is which. */
  protected sessionsAria(athlete: Athlete): string {
    this.languageService.currentLang();
    const s = this.sessions(athlete);
    if (s.monthScheduled === null || s.totalScheduled === null) {
      return this.translate.instant('athletes.list.attendance.cellAriaCounts', {
        monthAttended: s.monthAttended,
        totalAttended: s.totalAttended,
      });
    }
    return this.translate.instant('athletes.list.attendance.cellAria', {
      monthAttended: s.monthAttended,
      monthScheduled: s.monthScheduled,
      totalAttended: s.totalAttended,
      totalScheduled: s.totalScheduled,
    });
  }

  /**
   * Roster alerts (#1456), replacing the full-width banner that used to sit
   * above the table.
   *
   * Same request the widget made — the composite documents-health envelope —
   * read as two groups rather than one number, so the panel can say what
   * needs doing rather than only how much of it there is.
   */
  protected readonly alertsMissing = signal<number>(0);
  protected readonly alertsExpiring = signal<number>(0);
  protected readonly alertCount = computed<number>(
    () => this.alertsMissing() + this.alertsExpiring(),
  );

  private loadAlerts(): void {
    this.documentService
      .fetchDocumentsHealth()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          // Both arrays defaulted: `missing_medical_certificate` arrived with
          // #881, so a response predating it — or any caller that only fills
          // `data` — would otherwise throw inside a subscribe callback and
          // take the whole roster down with it. The alerts are the least
          // important thing on this page; they must not be able to break it.
          this.alertsExpiring.set(resp.data?.length ?? 0);
          this.alertsMissing.set(resp.missing_medical_certificate?.length ?? 0);
        },
        // Non-blocking: a failed health check must not cost the reader the
        // roster it came for. The button simply stays at zero.
        error: () => {},
      });
  }

  protected goToExpiringDocuments(): void {
    void this.router.navigate(['/dashboard/documents/expiring']);
  }

  /**
   * The table cell's "6 · 214", read out in full — the separator between the
   * two numbers is `aria-hidden`, so without this a screen reader announces
   * "6 214" and leaves the listener to guess which is which.
   */
  protected attendanceAria(athlete: Athlete): string {
    this.languageService.currentLang();
    return this.translate.instant('athletes.list.attendance.aria', {
      month: athlete.attendance_month_count ?? 0,
      total: athlete.attendance_total_count ?? 0,
    });
  }

  /**
   * The card's label, which says the month and stops there.
   *
   * A separate string rather than the one above: the card deliberately does
   * not show the all-time count, and announcing a number that is not on the
   * card describes a different screen to the person who cannot see this one.
   */
  protected attendanceAriaMonth(athlete: Athlete): string {
    this.languageService.currentLang();
    return this.translate.instant('athletes.list.attendance.ariaMonth', {
      month: athlete.attendance_month_count ?? 0,
    });
  }

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

    // desc ⇄ asc, two states (#1457). The third "off" leg went with the
    // default: belt is now what the roster opens on, so "stop sorting by
    // belt" would drop the reader back into insertion order — a state that
    // exists only as an accident of how rows were typed in, and one nobody
    // would choose on purpose.
    //
    // The sort still moves away from belt, just not from this button: the
    // Full name and Sessions headers take it, and this one goes neutral and
    // returns to descending when pressed again.
    if (f === 'belt') {
      this.sortOrder.set(o === 'desc' ? 'asc' : 'desc');
    } else {
      // Coming back from a name or sessions sort — highest rank first, the
      // same order the page opens on.
      this.sortField.set('belt');
      this.sortOrder.set('desc');
    }

    this.resetPage();
    this.load();
  }

  /** Plain-English tooltip — Norman § signifier. Says what the NEXT press does. */
  readonly beltSortTooltip = computed<string>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    if (this.sortField() !== 'belt') {
      return this.translate.instant('athletes.list.tooltip.beltSortInitial');
    }
    return this.translate.instant(
      this.sortOrder() === 'asc'
        ? 'athletes.list.tooltip.beltSortAsc'
        : 'athletes.list.tooltip.beltSortDesc',
    );
  });

  /**
   * all → paid → unpaid → all (#1446).
   *
   * Routed through `onPaidChange` deliberately: the URL is the source of
   * truth for this filter and the signal is set by the `queryParamMap`
   * subscription, so reading `selectedPaid()` back immediately after this
   * returns the OLD value. Compute the next state from the current one
   * BEFORE handing over, never after.
   */
  cyclePaid(): void {
    const current = this.selectedPaid();
    const next: AthletePaidFilter | '' = current === '' ? 'yes' : current === 'yes' ? 'no' : '';
    this.onPaidChange(next);
  }

  /** The button carries its current state as a word, not only as a colour. */
  readonly paidCycleLabel = computed<string>(() => {
    this.languageService.currentLang();
    const paid = this.selectedPaid();
    if (paid === 'yes') return this.translate.instant('athletes.list.paidOptions.yes');
    if (paid === 'no') return this.translate.instant('athletes.list.paidOptions.no');
    return this.translate.instant('athletes.list.paidFilter.any');
  });

  /**
   * The belt as words, for the spine's tooltip on the desktop row (#1443).
   *
   * With the Belt column gone the spine is the only belt on that row, and a
   * 9px stripe does not separate brown from black — nor the two corals —
   * for everyone. The name stays reachable here and on the spine's own
   * `aria-label`; the mobile card still writes it out in full.
   */
  beltName(athlete: Athlete): string {
    this.languageService.currentLang();
    return this.translate.instant(BELT_KEYS[athlete.belt]);
  }

  /**
   * The payment button's glyph, which carries the STATE and not just the
   * subject. Below 768px the label is hidden to keep the control row on one
   * line, so on a phone this icon and the highlight are the whole signal —
   * a wallet that never changed shape would leave "paid" and "unpaid"
   * distinguishable by colour alone.
   */
  readonly paidCycleIcon = computed<string>(() => {
    const paid = this.selectedPaid();
    if (paid === 'yes') return 'pi-check-circle';
    if (paid === 'no') return 'pi-times-circle';
    return 'pi-wallet';
  });

  /** Same contract as the belt tooltip: what the next press does. */
  readonly paidCycleTooltip = computed<string>(() => {
    this.languageService.currentLang();
    const paid = this.selectedPaid();
    if (paid === 'yes') return this.translate.instant('athletes.list.tooltip.paidCyclePaid');
    if (paid === 'no') return this.translate.instant('athletes.list.tooltip.paidCycleUnpaid');
    return this.translate.instant('athletes.list.tooltip.paidCycleAll');
  });

  goToNew(): void {
    void this.router.navigate(['/dashboard/athletes/new']);
  }

  /** The bulk path to the same place (#1346). */
  goToImport(): void {
    void this.router.navigate(['/dashboard/athletes/import']);
  }

  goToEdit(athlete: Athlete): void {
    void this.router.navigate(['/dashboard/athletes', athlete.id, 'edit']);
  }

  // ── Mobile card 3-dot menu (#670) ──────────────────────────────────────
  //
  // The mobile card layout collapses the inline row of icon actions into a
  // single 3-dot menu trigger (Apple-minimalist pattern). Tapping the
  // trigger opens a popup `<p-menu>` whose model is built per-athlete each
  // time. Delete used to route from here through a centered
  // `<p-confirmDialog>`; it now lives in the danger zone on the edit page
  // instead (#1430), so this menu no longer offers it.
  @ViewChild('cardMenu') protected cardMenu?: Menu;
  protected readonly cardMenuItems = signal<MenuItem[]>([]);

  /**
   * The payment cell's own popup (#1402). Separate instance from the card
   * menu: they can both be reachable on a phone at the same time, and sharing
   * one would make the second open steal the first's anchor.
   */
  @ViewChild('paymentMenu') protected paymentMenu?: Menu;
  protected readonly paymentMenuItems = signal<MenuItem[]>([]);

  /**
   * What is paying for this athlete's month (#1402), as the roster shows it.
   *
   * Read from the server rather than re-derived: the rule about which cover
   * wins lives in `App\Support\MonthCoverage`, and a second implementation
   * here is how the roster and the ledger come to disagree. `undefined` is a
   * pre-#1402 payload, which falls back to the boolean the column used to be.
   */
  protected coverageOf(athlete: Athlete): PaymentCoverage {
    return athlete.payment_coverage ?? (athlete.paid_current_month ? 'monthly' : 'none');
  }

  /** "Mensile", "Trimestrale", "Carnet · 8", "Non pagato". */
  protected coverageLabel(athlete: Athlete): string {
    const coverage = this.coverageOf(athlete);

    if (coverage === 'carnet') {
      return this.translate.instant('athletes.list.coverage.carnet', {
        count: athlete.active_carnet?.remaining_entries ?? 0,
      });
    }

    return this.translate.instant(`athletes.list.coverage.${coverage}`);
  }

  /**
   * The chip's leading glyph (#1444) — what is paying, as a shape.
   *
   * The instructor reads this column by scanning it, not by reading it, and
   * "Mensile / Trimestrale / Semestrale / Annuale" are four different words
   * for the same answer. A note gives all four one silhouette, a ticket
   * separates the carnet from them, and a cross is the only row that wants
   * something. It is also the channel that survives when colour does not:
   * paid and unpaid stop being a green/amber pair the eye has to resolve.
   *
   * This is the one status chip in the app that carries an icon — see
   * `docs/design/README.md` § Iconography for the rule it is an exception to
   * and the test a future chip has to pass to join it.
   */
  protected coverageIcon(athlete: Athlete): string {
    const coverage = this.coverageOf(athlete);

    if (coverage === 'none') return 'pi pi-times-circle';

    return coverage === 'carnet' ? 'pi pi-ticket' : 'pi pi-money-bill';
  }

  /**
   * `none` is the only state that asks for something, so it is the only one
   * that gets warning tone. Everything else is settled and reads as settled.
   */
  protected coverageSeverity(athlete: Athlete): 'success' | 'warn' | 'secondary' {
    const coverage = this.coverageOf(athlete);

    if (coverage === 'none') return 'warn';

    return coverage === 'carnet' ? 'secondary' : 'success';
  }

  /**
   * The cell's menu (#1402), built per row from what is already true of it.
   *
   * Offering "undo the payment" to someone who has none, or "sell a carnet" in
   * an academy that does not sell them, is a menu teaching the reader to
   * ignore half of it.
   */
  protected openPaymentMenu(event: MouseEvent, athlete: Athlete): void {
    const coverage = this.coverageOf(athlete);
    const items: MenuItem[] = [];

    if (coverage === 'none') {
      items.push({
        label: this.translate.instant('athletes.list.payMenu.markPaid'),
        icon: 'pi pi-check',
        command: () => this.confirmTogglePaid(event, athlete),
      });
    } else if (coverage !== 'carnet') {
      // Only a fee payment can be undone from here. A carnet is undone by
      // deleting the carnet, which is a different act with its own warning
      // about the sessions it covers.
      items.push({
        label: this.translate.instant('athletes.list.payMenu.undoPaid'),
        icon: 'pi pi-undo',
        command: () => this.confirmTogglePaid(event, athlete),
      });
    }

    if (this.sellsCarnets()) {
      items.push({
        label: this.translate.instant('athletes.list.payMenu.sellCarnet'),
        icon: 'pi pi-ticket',
        command: () => this.confirmSellCarnet(event, athlete),
      });
    }

    items.push({
      label: this.translate.instant('athletes.list.payMenu.openPayments'),
      icon: 'pi pi-wallet',
      command: () => this.goToTab(athlete, 'payments'),
    });

    this.paymentMenuItems.set(items);
    this.paymentMenu?.toggle(event);
  }

  /** True when the academy has both halves of a carnet offering configured. */
  protected readonly sellsCarnets = computed<boolean>(() => {
    const academy = this.academyService.academy();

    return (
      (academy?.carnet_price_cents ?? null) !== null && (academy?.carnet_entries ?? null) !== null
    );
  });

  /**
   * Sell a carnet from the roster (#1402) — a confirmation, not a dialog.
   *
   * The dated sale, where the owner back-dates a transcription, stays on the
   * athlete's Payments tab where the date pickers are. What belongs here is
   * the case that is one gesture in real life: someone hands over the money at
   * the door and the pack starts today.
   */
  protected confirmSellCarnet(event: MouseEvent, athlete: Athlete): void {
    const academy = this.academyService.academy();
    const message = this.translate.instant('athletes.list.confirm.sellCarnetMessage', {
      name: `${athlete.first_name} ${athlete.last_name}`,
      price: this.formatAmount(academy?.carnet_price_cents ?? 0),
      entries: academy?.carnet_entries ?? 0,
    });

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message,
      acceptLabel: this.translate.instant('athletes.list.confirm.sellCarnetAccept'),
      rejectLabel: this.translate.instant('athletes.list.confirm.cancel'),
      accept: () => this.sellCarnet(athlete),
    });
  }

  private sellCarnet(athlete: Athlete): void {
    this.carnetService.sell(athlete.id).subscribe({
      next: () => {
        this.load();
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('athletes.list.toast.carnetSoldSummary'),
          detail: this.translate.instant('athletes.list.toast.carnetSoldDetail', {
            name: `${athlete.first_name} ${athlete.last_name}`,
          }),
          life: 3000,
        });
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.list.toast.errorSummary'),
          detail: this.translate.instant('athletes.list.toast.carnetSoldError'),
          life: 4000,
        }),
    });
  }

  /** Locale-aware currency, the same shape every other amount in the app uses. */
  private formatAmount(cents: number): string {
    return (cents / 100).toLocaleString(this.locale(), { style: 'currency', currency: 'EUR' });
  }

  protected openCardMenu(event: Event, athlete: Athlete): void {
    // Build the menu model conditionally:
    //   - Attendance / Documents / Promotions / Edit: always present. Delete
    //     moved to the danger zone on the edit page (#1430) — not offered
    //     from this menu any more.
    //   - Payments: only when the academy tracks a monthly fee AND the row
    //     isn't the owner-self row (the self row hides payments by design).
    //   - Public profile: only when the linked user has a handle.
    //
    // Icon mapping follows the desktop convention (Jakob's law — same
    // glyph = same destination): `pi pi-id-card` is the canonical
    // public-profile signifier (see desktop `.athletes-page__public-
    // profile-link` at athletes-list.component.html). Internal-detail
    // tabs each get their own glyph.
    const items: MenuItem[] = [
      {
        label: this.translate.instant('athletes.list.tooltip.attendance'),
        // Jakob's law — the attendance tab on the detail (athlete-
        // detail.component.html) carries `pi pi-calendar`; using the
        // same glyph in the kebab keeps signifier parity across the
        // journey. `pi-check-square` stays reserved for the
        // transactional "mark today" flow elsewhere in the SPA.
        icon: 'pi pi-calendar',
        command: () => this.goToTab(athlete, 'attendance'),
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
        // Jakob's law — the payments tab on the detail
        // (athlete-detail.component.html) carries `pi pi-euro`.
        // Matching glyph keeps signifier parity across kebab→tab.
        // The athlete-portal sidebar still uses `pi-wallet`; that
        // surface is the remaining outlier (normalisation in a
        // follow-up sweep).
        icon: 'pi pi-euro',
        command: () => this.goToTab(athlete, 'payments'),
      });
    }

    items.push({
      label: this.translate.instant('athletes.list.tooltip.promotions'),
      icon: 'pi pi-trophy',
      command: () => this.goToTab(athlete, 'promotions'),
    });

    if (this.publicProfileHandle(athlete) !== null) {
      items.push({
        label: this.translate.instant('athletes.list.tooltip.publicProfile'),
        icon: 'pi pi-id-card',
        command: () => this.goToPublicProfile(athlete),
      });
    }

    items.push({
      label: this.translate.instant('athletes.list.tooltip.edit'),
      icon: 'pi pi-pencil',
      command: () => this.goToEdit(athlete),
    });

    this.cardMenuItems.set(items);
    this.cardMenu?.toggle(event);
  }

  private goToTab(
    athlete: Athlete,
    tab: 'attendance' | 'documents' | 'payments' | 'promotions',
  ): void {
    void this.router.navigate(['/dashboard/athletes', athlete.id, tab]);
  }

  /**
   * The handle to link to, or null when there is nothing to link to.
   *
   * Two reasons produce null and they are deliberately one answer: the athlete
   * has no user account, or this runtime has no `community` capability. The
   * public profile lives behind `capabilityGuard('community')`, and the desktop
   * build has no capabilities at all — so offering the control there shows one
   * the guard will refuse, bouncing the click to the dashboard (#1349).
   *
   * One method rather than the condition repeated at each of the three layouts
   * plus the action sheet, because the fourth site is the one that gets missed.
   */
  /**
   * The picture to show for a row: the athlete's own photo first, the linked
   * account's avatar second, nothing third (the initials circle).
   *
   * That order is the point of #1357. `athlete_accounts` is absent from the
   * desktop runtime, so `user_avatar_url` is always null there — before the
   * athlete had a photo of its own, every row on the shipped build fell back
   * to initials with no way to change it.
   */
  protected avatarFor(athlete: Athlete): string | null {
    return athlete.photo_url ?? athlete.user_avatar_url ?? null;
  }

  protected publicProfileHandle(athlete: Athlete): string | null {
    if (!this.runtime.has()('community')) {
      return null;
    }

    return athlete.user_handle ?? null;
  }

  private goToPublicProfile(athlete: Athlete): void {
    if (athlete.user_handle) {
      void this.router.navigate(['/dashboard/u', athlete.user_handle]);
    }
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

    // Say what the click actually does (#1382). On a quarterly athlete this
    // records — or removes — three months at three times the fee, and
    // "April 2026" alone would be a quietly false description of a €165
    // receipt. Norman: show the consequence before the act.
    const period = this.periodCaptionFor(year, month, athlete.billing_period_months ?? 1);
    const message =
      period !== null
        ? this.translate.instant(
            willMarkPaid
              ? 'athletes.list.confirm.markPaidPeriodMessage'
              : 'athletes.list.confirm.markUnpaidPeriodMessage',
            { name: fullName, period },
          )
        : this.translate.instant(
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

  /**
   * "February – April 2026" for a period longer than a month, `null` for the
   * monthly case where the month name alone already says it.
   *
   * Undoing is not symmetric with marking: the server removes whichever
   * period *covers* the current month, which may have started earlier than
   * this caption suggests. The athlete's configured period is the closest
   * honest description available from the roster, which carries no payment
   * rows — the per-athlete payments tab, which does, names the real range.
   */
  private periodCaptionFor(year: number, month: number, periodMonths: number): string | null {
    if (periodMonths <= 1) return null;

    const name = (offset: number): string =>
      new Date(Date.UTC(year, month - 1 + offset, 1)).toLocaleString(this.locale(), {
        month: 'long',
        timeZone: 'UTC',
      });
    const endYear = new Date(Date.UTC(year, month - 1 + periodMonths - 1, 1)).getUTCFullYear();

    return `${name(0)} – ${name(periodMonths - 1)} ${endYear}`;
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

  statusSeverity(status: AthleteStatus): 'success' | 'secondary' {
    switch (status) {
      case 'active':
        return 'success';
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

  /** Retry hook for the error-state banner — re-issues the roster load. */
  protected reload(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(false);
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

    // Re-ask for the academy alongside the roster (#1484). It answers from
    // cache and costs nothing on all but one day a year — the exception is
    // the day the season rolls over, when the cached `season_start` is a
    // season out of date. Without this the count on the wire would be the new
    // season's while the denominator beside it stayed the old one's.
    this.academyService
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => {} });

    this.athleteService
      .list(filters)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.athletes.set(res.data);
          this.totalRecords.set(res.meta.total);
          // One-way latch — see `attendanceCountsSeen`. An empty page proves
          // nothing about the server, so it must not un-prove what an earlier
          // page already showed.
          if (res.data.some((a) => this.hasAttendance(a))) {
            this.attendanceCountsSeen.set(true);
          }
        },
        error: () => {
          this.athletes.set([]);
          this.totalRecords.set(0);
          // Inline banner instead of a toast: a load failure must persist
          // on screen until the user retries, not scroll away (#1033 /
          // #1037, client canon § Norman feedback).
          this.loadError.set(true);
        },
      });
  }

  // delete(athlete) moved to the danger zone on the edit page (#1430) — the
  // roster no longer offers it, on either surface.
}
