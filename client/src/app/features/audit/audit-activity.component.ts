import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { AuditEntry, AuditService } from '../../core/services/audit.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

// Owner-only academy activity log (#429 part 3).
@Component({
  selector: 'app-audit-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
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

  protected readonly entries = signal<readonly AuditEntry[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly total = signal<number>(0);
  protected readonly page = signal<number>(1);
  protected readonly perPage = signal<number>(20);

  // Filter signals — bound to inputs via ngModel.
  protected readonly actionFilter = signal<string>('');
  protected readonly fromFilter = signal<string>('');
  protected readonly toFilter = signal<string>('');

  protected readonly hasEntries = computed<boolean>(() => this.entries().length > 0);

  constructor() {
    this.refetch();
  }

  protected onFilterApply(): void {
    this.page.set(1);
    this.refetch();
  }

  protected onFilterReset(): void {
    this.actionFilter.set('');
    this.fromFilter.set('');
    this.toFilter.set('');
    this.page.set(1);
    this.refetch();
  }

  protected onPageChange(event: { page: number }): void {
    // PrimeNG paginator is 0-indexed; the API is 1-indexed.
    this.page.set(event.page + 1);
    this.refetch();
  }

  private refetch(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.auditService
      .list({
        action: this.actionFilter() || undefined,
        from: this.fromFilter() || undefined,
        to: this.toFilter() || undefined,
        page: this.page(),
        per_page: this.perPage(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.entries.set(page.data);
          this.total.set(page.meta.total);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
