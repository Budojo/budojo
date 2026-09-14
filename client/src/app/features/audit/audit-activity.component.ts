import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { PaginatorModule } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { EMPTY, Subject } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { AuditEntriesFilters, AuditEntry, AuditService } from '../../core/services/audit.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LocaleDatePipe } from '../../shared/pipes/locale-date.pipe';

/**
 * Owner-only academy activity log (#429 part 3).
 *
 * **The log speaks the product's language, not the code's** (#1631). Every
 * row used to print the raw action key — `athlete.deleted`, in monospace —
 * and the filter's placeholder taught that vocabulary as the way to search
 * your own history. The map below is the whole vocabulary the server can
 * write (the five `Observers/Audit/*` classes); anything outside it renders
 * as the raw key with the same tooltip, which is what a new action added
 * server-side should look like until someone gives it a sentence.
 */
const ACTION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'academy.updated': 'audit.actions.academyUpdated',
  'athlete.created': 'audit.actions.athleteCreated',
  'athlete.updated': 'audit.actions.athleteUpdated',
  'athlete.deleted': 'audit.actions.athleteDeleted',
  'carnet.created': 'audit.actions.carnetCreated',
  'carnet.updated': 'audit.actions.carnetUpdated',
  'carnet.deleted': 'audit.actions.carnetDeleted',
  'document.uploaded': 'audit.actions.documentUploaded',
  'document.deleted': 'audit.actions.documentDeleted',
  'payment.created': 'audit.actions.paymentCreated',
  'payment.updated': 'audit.actions.paymentUpdated',
  'payment.deleted': 'audit.actions.paymentDeleted',
};
@Component({
  selector: 'app-audit-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LocaleDatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
    SelectModule,
    PaginatorModule,
    SkeletonModule,
    TooltipModule,
  ],
  templateUrl: './audit-activity.component.html',
  styleUrl: './audit-activity.component.scss',
})
export class AuditActivityComponent {
  private readonly auditService = inject(AuditService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);

  protected readonly entries = signal<readonly AuditEntry[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly total = signal<number>(0);
  protected readonly page = signal<number>(1);
  protected readonly perPage = signal<number>(20);

  // Reactive form (client/CLAUDE.md § "Reactive Forms, not template-
  // driven, for anything beyond a two-field filter" — three fields here).
  protected readonly filterForm = this.fb.nonNullable.group({
    action: '',
    from: '',
    to: '',
  });

  protected readonly hasEntries = computed<boolean>(() => this.entries().length > 0);

  /** The filter's options, in the order they read: everything, then the map. */
  protected readonly actionOptions = computed<{ label: string; value: string }[]>(() => {
    this.language.currentLang();
    return [
      { label: this.translate.instant('audit.filters.actionAll') as string, value: '' },
      ...Object.entries(ACTION_LABEL_KEYS)
        .map(([value, key]) => ({ label: this.translate.instant(key) as string, value }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  });

  /** The sentence for an action, or the raw key when we have none. */
  protected actionLabel(action: string): string {
    this.language.currentLang();
    const key = ACTION_LABEL_KEYS[action];
    return key === undefined ? action : (this.translate.instant(key) as string);
  }

  /** True while the row is showing a key rather than a sentence. */
  protected isRawAction(action: string): boolean {
    return ACTION_LABEL_KEYS[action] === undefined;
  }

  /**
   * The actor, only when it is not the person reading. On a single-owner
   * build every row was "Matteo Bonanno → …", which is a column of the same
   * name and an arrow that reads as a transfer (#1631).
   */
  protected otherActor(entry: AuditEntry): string | null {
    const me = this.auth.user()?.id ?? null;
    if (entry.actor_user_id === null || entry.actor_user_id === me) return null;
    return entry.actor_label;
  }

  // switchMap drops the previous in-flight request when a new filter
  // or page lands — a rapid double-tap on Apply can't leak the stale
  // response over the fresh one.
  private readonly fetches$ = new Subject<AuditEntriesFilters>();

  constructor() {
    this.fetches$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.errored.set(false);
        }),
        // catchError inside the inner observable keeps the outer
        // stream alive — a single error must not silently disable
        // every subsequent refetch until the page reloads.
        switchMap((filters) =>
          this.auditService.list(filters).pipe(
            catchError(() => {
              this.errored.set(true);
              this.loading.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.entries.set(response.data);
        this.total.set(response.meta.total);
        this.loading.set(false);
      });
    this.refetch();
  }

  protected onFilterApply(): void {
    this.page.set(1);
    this.refetch();
  }

  protected onFilterReset(): void {
    this.filterForm.reset({ action: '', from: '', to: '' });
    this.page.set(1);
    this.refetch();
  }

  protected onPageChange(event: { page?: number }): void {
    // PrimeNG paginator is 0-indexed; the API is 1-indexed.
    this.page.set((event.page ?? 0) + 1);
    this.refetch();
  }

  private refetch(): void {
    const { action, from, to } = this.filterForm.getRawValue();
    this.fetches$.next({
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
      page: this.page(),
      per_page: this.perPage(),
    });
  }
}
