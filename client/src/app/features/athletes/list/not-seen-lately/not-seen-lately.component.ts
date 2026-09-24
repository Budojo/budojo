import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { Menu, MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { AthleteService } from '../../../../core/services/athlete.service';
import { LanguageService } from '../../../../core/services/language.service';
import {
  StatsService,
  type AtRiskList,
  type AtRiskRow,
  type AtRiskTier,
} from '../../../../core/services/stats.service';
import { AthleteIdentityComponent } from '../../../../shared/components/athlete-identity/athlete-identity.component';
import { ContactActionsComponent } from '../../../../shared/components/contact-actions/contact-actions.component';
import {
  CONFIRM_ACCEPT_DESTRUCTIVE,
  CONFIRM_REJECT_BUTTON,
} from '../../../../shared/utils/confirm-buttons';
import { relativeDay } from '../../../../shared/utils/relative-day';

/** What the section says when there is nobody to list. */
type EmptyKind = 'healthy' | 'no-history' | 'no-attendance';

const TIER_KEYS: Record<AtRiskTier, string> = {
  gone: 'athletes.list.atRisk.tier.gone',
  quiet: 'athletes.list.atRisk.tier.quiet',
  dropping: 'athletes.list.atRisk.tier.dropping',
};

/**
 * The existing chip severities, most severe first (#1729): `gone` reads as the
 * worst. No fourth palette — the same danger / warn / neutral the alerts and
 * the coverage chips already speak.
 */
const TIER_SEVERITY: Record<AtRiskTier, 'danger' | 'warn' | 'secondary'> = {
  gone: 'danger',
  quiet: 'warn',
  dropping: 'secondary',
};

/**
 * "Non si vedono da un po'" on the roster (#1729) — the screen that makes the
 * at-risk endpoint (#1728) worth having.
 *
 * On the roster because the owner opens it several times a day: a retention
 * list on a page nobody otherwise visits is read twice and then forgotten.
 * Beside the alerts in spirit — these specific people need something from you
 * — and actionable in place, because the point is not to learn that Marco is
 * drifting, it is to message Marco.
 *
 * **Renders what it is given.** The tier and the four counts are the
 * server's; recomputing a ratio here would be a second copy of the rule. It
 * asks once, on the roster's first load, never on a filter or a page change.
 * A failing request renders nothing: the roster is what the owner came for.
 */
@Component({
  selector: 'app-not-seen-lately',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslatePipe,
    ConfirmPopup,
    MenuModule,
    TagModule,
    Tooltip,
    AthleteIdentityComponent,
    ContactActionsComponent,
  ],
  // Its own ConfirmationService: a `p-confirmpopup` whose service comes from
  // somewhere else never opens (see the photo card).
  providers: [ConfirmationService],
  templateUrl: './not-seen-lately.component.html',
  styleUrl: './not-seen-lately.component.scss',
})
export class NotSeenLatelyComponent implements OnInit {
  private readonly stats = inject(StatsService);
  private readonly athletes = inject(AthleteService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  /** An athlete marked inactive from here — the roster reloads its table. */
  readonly markedInactive = output<number>();

  protected readonly list = signal<AtRiskList | null>(null);
  protected readonly expanded = signal(true);
  protected readonly menuModel = signal<MenuItem[]>([]);

  protected readonly rows = computed(() => this.list()?.data ?? []);

  /** Only meaningful with no rows: which of the three empty answers is true. */
  protected readonly emptyKind = computed<EmptyKind>(() => {
    const meta = this.list()?.meta;
    if (!meta || meta.sessions_available === 0) return 'no-attendance';
    return meta.sessions_available < meta.sessions_needed ? 'no-history' : 'healthy';
  });

  protected readonly countLabel = computed(() => {
    this.languageService.currentLang();
    const count = this.rows().length;
    return this.translate.instant(
      count === 1 ? 'athletes.list.atRisk.countOne' : 'athletes.list.atRisk.countOther',
      { count },
    );
  });

  ngOnInit(): void {
    this.stats
      .atRisk()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.list.set(list),
        // Non-blocking, like the roster's alerts: the section simply is not
        // there, and the roster it sits on stays whole.
        error: () => this.list.set(null),
      });
  }

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  protected tierLabel(tier: AtRiskTier): string {
    return this.translate.instant(TIER_KEYS[tier]);
  }

  protected tierSeverity(tier: AtRiskTier): 'danger' | 'warn' | 'secondary' {
    return TIER_SEVERITY[tier];
  }

  /**
   * Why, in words, from the server's numbers: the four counts for a drop, a
   * distance for an absence. Arguable either way — "at risk" alone is not.
   */
  protected reason(row: AtRiskRow): string {
    if (row.tier === 'dropping') {
      return this.translate.instant('athletes.list.atRisk.reasonDropping', {
        recent: row.recent_attended,
        recentTotal: row.recent_sessions,
        baseline: row.baseline_attended,
        baselineTotal: row.baseline_sessions,
      });
    }
    return row.last_attended_on
      ? this.translate.instant('athletes.list.atRisk.reasonAbsent', {
          when: relativeDay(row.last_attended_on, this.translate),
        })
      : this.translate.instant('athletes.list.atRisk.reasonNever');
  }

  protected fullName(row: AtRiskRow): string {
    return `${row.athlete.first_name} ${row.athlete.last_name}`;
  }

  protected openMenu(event: Event, row: AtRiskRow, menu: Menu): void {
    this.menuModel.set(this.markInactiveItems(row, event.currentTarget as HTMLElement));
    menu.toggle(event);
  }

  /**
   * The overflow's one item. The confirm anchors to the ⋯ that opened the
   * menu: the menu item itself is gone by the time the popup draws.
   */
  protected markInactiveItems(row: AtRiskRow, anchor: HTMLElement): MenuItem[] {
    return [
      {
        label: this.translate.instant('athletes.list.atRisk.markInactive'),
        icon: 'pi pi-user-minus',
        command: () => this.confirmMarkInactive(row, anchor),
      },
    ];
  }

  private confirmMarkInactive(row: AtRiskRow, anchor: HTMLElement): void {
    const name = this.fullName(row);
    this.confirmation.confirm({
      target: anchor,
      message: this.translate.instant('athletes.list.atRisk.markInactiveConfirm', { name }),
      acceptLabel: this.translate.instant('athletes.list.atRisk.markInactiveAccept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: CONFIRM_ACCEPT_DESTRUCTIVE,
      rejectButtonProps: CONFIRM_REJECT_BUTTON,
      accept: () => this.markInactive(row),
    });
  }

  private markInactive(row: AtRiskRow): void {
    const name = this.fullName(row);
    this.athletes.update(row.athlete.id, { status: 'inactive' }).subscribe({
      next: () => {
        // Off this list, and the roster reloads: with the inactive hidden,
        // the row would otherwise stay on screen and be clicked twice.
        this.list.update((list) =>
          list ? { ...list, data: list.data.filter((r) => r.athlete.id !== row.athlete.id) } : list,
        );
        this.markedInactive.emit(row.athlete.id);
        this.messages.add({
          severity: 'success',
          summary: this.translate.instant('athletes.list.atRisk.markInactiveToast', { name }),
          life: 2500,
        });
      },
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: this.translate.instant('athletes.list.atRisk.markInactiveError', { name }),
        }),
    });
  }
}
