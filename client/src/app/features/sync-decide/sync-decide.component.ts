import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { SkeletonModule } from 'primeng/skeleton';
import { LanguageService } from '../../core/services/language.service';
import { ConflictDecision, deviceKind, SyncConflict } from '../../core/sync/conflicts';
import { HttpSyncServer } from '../../core/sync/http-sync-server';
import { SyncService } from '../../core/sync/sync.service';
import { AthleteIdentityComponent } from '../../shared/components/athlete-identity/athlete-identity.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CONFIRM_REJECT_BUTTON } from '../../shared/utils/confirm-buttons';
import { localeFor } from '../../shared/utils/locale';

/** What a write was, by its route: the label of the thing it changed. Listed, so the parity check sees every key. */
const WHAT: readonly (readonly [prefix: string, key: string])[] = [
  ['athletes.payments.', 'payment'],
  ['athletes.photo', 'photo'],
  ['athletes.promotions.', 'promotion'],
  ['athletes.documents.', 'document'],
  ['documents.', 'document'],
  ['attendance.', 'attendance'],
  ['me.attendance.', 'attendance'],
  ['lessons.topics.', 'lessonTopics'],
  ['lessons.notes.', 'lessonNotes'],
  ['academy.closures.', 'closure'],
  ['academy.', 'academy'],
  ['athletes.', 'athlete'],
  ['me.athlete.', 'athlete'],
];

/** The reasons, as keys: `unknown-route` is no key of its own. */
const REASONS: Record<SyncConflict['reason'], string> = {
  changed: 'changed',
  differs: 'differs',
  gone: 'gone',
  refused: 'refused',
  failed: 'failed',
  'unknown-route': 'unknownRoute',
};

/** The fields a conflict names that have a label; any other shows as it is named. */
const FIELDS = new Set([
  'first_name',
  'last_name',
  'email',
  'phone_national_number',
  'payment_method',
  'amount_cents',
  'paid_at',
  'period_months',
  'topic_ids',
  'notes',
  'label',
  'starts_on',
  'ends_on',
  'belt',
  'stripes',
  'name',
  'monthly_fee_cents',
  'address',
  'line1',
  'city',
  'postal_code',
  'status',
  'joined_at',
  'date_of_birth',
  'photo_path',
  'photo_sha256',
]);

const MONEY = new Set(['amount_cents', 'monthly_fee_cents', 'fee_override_cents']);
const PAYMENT_METHODS = new Set(['cash', 'transfer', 'pos', 'other']);

/** One conflict, as the screen shows it. */
interface ConflictView {
  conflict: SyncConflict;
  what: string;
  reason: string;
  /** The device whose write was set aside, and the other. */
  mine: 'pc' | 'phone';
  theirs: 'pc' | 'phone';
  /** A field and its two values, when the conflict is about one. */
  sides: { field: string; mine: string; theirs: string } | null;
}

/**
 * «Da decidere» (#2038, PRD § 6.4): the writes a rebase set aside, each a
 * question for the owner, on whichever device shows it. **Nothing is decided
 * without them** (§ 2). For each:
 * - what it was, and whom it is about (the athlete, with the belt);
 * - both sides, when it is about one field;
 * - **«Tieni quella del PC»**: what is here stays;
 * - **«Tieni quella del telefono»**: the set-aside write is sent again
 *   (`retry`), after a confirm that says what it replaces, when it can be;
 * - **«L'ho sistemata io»**: the owner fixed it by hand.
 *
 * Every answer is a journaled write: it reaches the other device too.
 */
@Component({
  selector: 'app-sync-decide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AthleteIdentityComponent,
    ButtonModule,
    ConfirmPopupModule,
    EmptyStateComponent,
    PageHeaderComponent,
    SkeletonModule,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './sync-decide.component.html',
  styleUrl: './sync-decide.component.scss',
})
export class SyncDecideComponent implements OnInit {
  private readonly server = inject(HttpSyncServer);
  private readonly sync = inject(SyncService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly conflicts = signal<SyncConflict[] | null>(null);
  protected readonly loadFailed = signal(false);
  /** The conflict an answer is being sent for. */
  protected readonly busy = signal<string | null>(null);
  /** Why the last «Tieni quella del …» did not go through, by conflict. */
  protected readonly errors = signal<Record<string, string>>({});
  /** What the screen reader hears after an answer. */
  protected readonly announcement = signal('');

  protected readonly views = computed<ConflictView[]>(() => {
    this.language.currentLang();
    return (this.conflicts() ?? []).map((conflict) => this.view(conflict));
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      this.conflicts.set(await this.server.conflicts());
    } catch {
      this.loadFailed.set(true);
      this.conflicts.set([]);
    }
  }

  protected deviceLabel(kind: 'pc' | 'phone'): string {
    return this.translate.instant(`sync.decide.device.${kind}`);
  }

  /** «Tieni quella del …» for the set-aside write: what it replaces, then the answer. */
  protected keepMine(event: Event, view: ConflictView): void {
    this.confirmation.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('sync.decide.confirmMine', {
        mine: this.deviceLabel(view.mine),
        theirs: this.deviceLabel(view.theirs),
      }),
      acceptLabel: this.translate.instant('sync.decide.keep', {
        device: this.deviceLabel(view.mine),
      }),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: CONFIRM_REJECT_BUTTON,
      accept: () => void this.answer(view.conflict, 'mine'),
    });
  }

  protected async answer(conflict: SyncConflict, decision: ConflictDecision): Promise<void> {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(conflict.id);
    this.errors.update((all) =>
      Object.fromEntries(Object.entries(all).filter(([id]) => id !== conflict.id)),
    );
    try {
      if (decision === 'mine' && conflict.retry !== null) {
        await this.server.retry(conflict.retry);
      }
      await this.server.decide(conflict.id, decision);
      this.conflicts.update((all) => (all ?? []).filter((one) => one.id !== conflict.id));
      this.announcement.set(this.translate.instant('sync.decide.decided'));
      void this.sync.countToDecide();
    } catch (error) {
      this.errors.update((all) => ({
        ...all,
        [conflict.id]: this.translate.instant('sync.decide.retryFailed', {
          message: messageOf(error),
        }),
      }));
    } finally {
      this.busy.set(null);
    }
  }

  private view(conflict: SyncConflict): ConflictView {
    const mine = deviceKind(conflict.device);
    return {
      conflict,
      what: this.what(conflict),
      reason: this.translate.instant(`sync.decide.reason.${REASONS[conflict.reason]}`),
      mine,
      theirs: mine === 'phone' ? 'pc' : 'phone',
      sides: this.sides(conflict),
    };
  }

  private what(conflict: SyncConflict): string {
    const key = WHAT.find(([prefix]) => conflict.route.startsWith(prefix))?.[1] ?? 'other';
    const body = conflict.entry.body ?? {};
    if (key === 'payment') {
      const year = Number(body['year']);
      const month = Number(body['month']);
      return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12
        ? this.translate.instant('sync.decide.what.payment', {
            month: new Intl.DateTimeFormat(this.locale(), {
              month: 'long',
              year: 'numeric',
            }).format(new Date(year, month - 1, 1)),
          })
        : this.translate.instant('sync.decide.what.paymentAny');
    }
    if (key === 'attendance' || key === 'lessonTopics' || key === 'lessonNotes') {
      const day = body['date'] ?? body['held_on'];
      if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(day)) {
        return this.translate.instant(`sync.decide.what.${key}`, { date: this.day(day) });
      }
      return this.translate.instant(
        key === 'attendance' ? 'sync.decide.what.attendanceAny' : 'sync.decide.what.other',
      );
    }
    return this.translate.instant(`sync.decide.what.${key}`);
  }

  /** The field and its two values: the set-aside write's, and what is here. */
  private sides(conflict: SyncConflict): ConflictView['sides'] {
    const field = conflict.detail.field;
    if (typeof field !== 'string') {
      return null;
    }
    let mine: unknown;
    if (conflict.reason === 'differs') {
      mine = conflict.detail.mine;
    } else if (conflict.reason === 'changed') {
      const body = conflict.entry.body ?? {};
      mine =
        field in body
          ? body[field]
          : (body['address'] as Record<string, unknown> | undefined)?.[field];
    } else {
      return null;
    }
    return {
      field: FIELDS.has(field) ? this.translate.instant(`sync.decide.field.${field}`) : field,
      mine: this.value(field, mine),
      theirs: this.value(field, conflict.detail.here),
    };
  }

  private value(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (Array.isArray(value)) {
      return field === 'topic_ids'
        ? this.translate.instant(
            value.length === 1 ? 'sync.decide.topicsOne' : 'sync.decide.topicsOther',
            { count: value.length },
          )
        : value.join(', ');
    }
    if (MONEY.has(field) && typeof value === 'number') {
      return new Intl.NumberFormat(this.locale(), { style: 'currency', currency: 'EUR' }).format(
        value / 100,
      );
    }
    if (field === 'payment_method' && typeof value === 'string' && PAYMENT_METHODS.has(value)) {
      return this.translate.instant(`payments.method.${value}`);
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value)) {
      return this.day(value);
    }
    return String(value);
  }

  private day(value: string): string {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(
      new Date(year, month - 1, day),
    );
  }

  private locale(): string {
    return localeFor(this.language.currentLang());
  }
}

function messageOf(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = (error.error as { message?: unknown } | null)?.message;
    return typeof message === 'string' ? message : `${error.status}`;
  }
  return error instanceof Error ? error.message : String(error);
}
