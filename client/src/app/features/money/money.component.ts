import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { Athlete, AthleteService } from '../../core/services/athlete.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { LanguageService } from '../../core/services/language.service';
import { AthleteIdentityComponent } from '../../shared/components/athlete-identity/athlete-identity.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { monthKey } from '../../shared/utils/months';
import { MatMoney } from '../attendance/daily/pay/mat-money';
import { MoneyRow } from '../attendance/daily/pay/money-rows';
import { monthOf, yearMonthOf } from '../attendance/daily/pay/pay-chip';
import { PayRecorded, PaySheetComponent } from '../attendance/daily/pay/pay-sheet.component';

/** How many active athletes the list reads: the server's cap, as the check-in. */
const ROSTER_SIZE = 200;

/**
 * «Soldi» (#2132, PRD § 6.1): who still has to pay, on the phone.
 *
 * The people on the mat today come first: they are the ones you can ask
 * tonight. A row names this month, and the months behind beside it
 * («anche agosto»). Tapping it opens the check-in's payment sheet at the
 * oldest month owed; once nothing is owed the row leaves, and the toast's
 * undo puts it back. Everything is read from the phone's own server, as the
 * check-in reads it, so the two screens agree on who owes.
 */
@Component({
  selector: 'app-money',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    SkeletonModule,
    Toast,
    AthleteIdentityComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    PaySheetComponent,
  ],
  providers: [MessageService, MatMoney],
  templateUrl: './money.component.html',
  styleUrl: './money.component.scss',
})
export class MoneyComponent implements OnInit {
  private readonly athletes = inject(AthleteService);
  private readonly attendance = inject(AttendanceService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly money = inject(MatMoney);

  /** The active roster; `null` until it answers. */
  private readonly roster = signal<readonly Athlete[] | null>(null);
  /** Who is marked present today, in any class. */
  private readonly presentToday = signal<ReadonlySet<number>>(new Set());
  private readonly rosterFailed = signal<boolean>(false);
  /** Either list failed: without the arrears «paid up» could be a lie. */
  protected readonly errored = computed<boolean>(() => this.rosterFailed() || this.money.failed());

  protected readonly rows = computed(() => {
    const roster = this.roster();
    return roster === null ? null : this.money.whoOwes(roster, this.presentToday());
  });

  protected readonly count = computed<number>(() => {
    const rows = this.rows();
    return rows === null ? 0 : rows.tonight.length + rows.others.length;
  });

  /** Tonight's people, then everyone else, each under its own heading key. */
  protected readonly groups = computed(() => {
    const rows = this.rows();
    return [
      { key: 'tonight', heading: 'money.tonight', rows: rows?.tonight ?? [] },
      { key: 'others', heading: 'money.others', rows: rows?.others ?? [] },
    ];
  });

  /** Headings only when the list is split: one list needs no name. */
  protected readonly split = computed<boolean>(() => {
    const rows = this.rows();
    return rows !== null && rows.tonight.length > 0 && rows.others.length > 0;
  });

  protected readonly paying = signal<{ athlete: Athlete; month: string } | null>(null);
  private paidFrom: number | null = null;

  private readonly thisYear = new Date().getFullYear();

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.rosterFailed.set(false);
    this.roster.set(null);
    // By surname, as the PC's arrears list: a list to find a name in.
    this.athletes
      .list({ status: 'active', perPage: ROSTER_SIZE, sortBy: 'last_name', sortOrder: 'asc' })
      .subscribe({
        next: (page) => this.roster.set(page.data),
        error: () => this.rosterFailed.set(true),
      });
    // Without today's register the list is still right, only not split.
    this.attendance.getDaily(todayIso()).subscribe({
      next: (records) => this.presentToday.set(new Set(records.map((r) => r.athlete_id))),
      error: () => this.presentToday.set(new Set()),
    });
    this.money.load();
  }

  /** «ottobre», with the year when it is not this one. */
  protected monthName(month: string): string {
    this.languageService.currentLang();
    const { year, month: n } = yearMonthOf(month);
    const word = this.translate.instant(monthKey(n));
    return year === this.thisYear ? word : `${word} ${year}`;
  }

  /** «anche agosto», «anche luglio e agosto», «anche maggio e altri 3 mesi». */
  protected alsoLabel(row: MoneyRow): string {
    const [first, second] = row.also;
    if (first === undefined) return '';
    if (second === undefined) {
      return this.translate.instant('money.also1', { month: this.monthName(first) });
    }
    if (row.also.length === 2) {
      return this.translate.instant('money.also2', {
        first: this.monthName(first),
        second: this.monthName(second),
      });
    }
    return this.translate.instant('money.alsoMany', {
      first: this.monthName(first),
      count: row.also.length - 1,
    });
  }

  protected rowAria(row: MoneyRow): string {
    const months = [this.monthName(row.lead), this.alsoLabel(row)].filter(Boolean).join(', ');
    return this.translate.instant('money.rowAria', {
      name: `${row.athlete.first_name} ${row.athlete.last_name}`,
      months,
    });
  }

  protected openPay(row: MoneyRow): void {
    this.paidFrom = row.athlete.id;
    this.paying.set({ athlete: row.athlete, month: row.oldest });
  }

  protected closePay(): void {
    this.paying.set(null);
  }

  /**
   * The sheet closed with the keyboard inside it: back to the row, or, once
   * the row has left the list, to the first row still there.
   */
  protected returnFocusFromPay(): void {
    const id = this.paidFrom;
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && active.closest('.pay-sheet-dialog') !== null;
    if (id === null || (active !== null && active !== document.body && !inside)) return;
    const root = this.host.nativeElement;
    const target =
      root.querySelector<HTMLElement>(`[data-cy="money-row-${id}"]`) ??
      root.querySelector<HTMLElement>('[data-cy^="money-row-"]');
    target?.focus();
  }

  /**
   * Recorded: the row moves on or leaves, and the toast can take it back. Not
   * a payment the server already held: undoing that would delete one this
   * screen never made.
   */
  protected onPaid({ athlete, payment, created }: PayRecorded): void {
    this.paying.set(null);
    navigator.vibrate?.(15);
    const name = `${athlete.first_name} ${athlete.last_name}`;
    this.messageService.clear();
    if (!created) {
      this.messageService.add({
        severity: 'info',
        summary: this.translate.instant('attendance.daily.pay.toast.already', { name }),
        life: 4000,
      });
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('attendance.daily.pay.toast.recorded', { name }),
      data: {
        undo: () =>
          this.money.undo(athlete, payment).subscribe({
            next: () => this.messageService.clear(),
            error: () => {
              this.messageService.clear();
              this.messageService.add({
                severity: 'error',
                summary: this.translate.instant('attendance.daily.pay.toast.undoError'),
                life: 5000,
              });
            },
          }),
      },
      life: 5000,
    });
  }
}

/** Today as the API takes it, from the local clock: `2026-10-06`. */
function todayIso(): string {
  const now = new Date();
  return `${monthOf(now)}-${String(now.getDate()).padStart(2, '0')}`;
}
