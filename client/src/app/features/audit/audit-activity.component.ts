import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { EMPTY, Subject } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { AuditEntriesFilters, AuditEntry, AuditService } from '../../core/services/audit.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

// Owner-only academy activity log (#429 part 3).
@Component({
  selector: 'app-audit-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
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
