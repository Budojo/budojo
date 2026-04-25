import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { Tooltip } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  Athlete,
  AthleteFilters,
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
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './athletes-list.component.html',
  styleUrl: './athletes-list.component.scss',
})
export class AthletesListComponent implements OnInit {
  private readonly athleteService = inject(AthleteService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  readonly athletes = signal<Athlete[]>([]);
  readonly totalRecords = signal(0);
  readonly loading = signal(true);

  selectedBelt = signal<Belt | ''>('');
  selectedStatus = signal<AthleteStatus | ''>('');
  readonly sortField = signal<AthleteSortField | null>(null);
  readonly sortOrder = signal<AthleteSortOrder>('desc');

  private page = 1;

  readonly first = signal(0);

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

  onPageChange(event: { first: number; rows: number }): void {
    this.page = Math.floor(event.first / event.rows) + 1;
    this.first.set(event.first);
    this.load();
  }

  /**
   * PrimeNG p-table emits `{ field, order }` on header click.
   * `order` is 1 (asc) or -1 (desc). We map to our `'asc' | 'desc'` and
   * fire a fresh load. Re-clicking the same column flips the order.
   */
  onSort(event: { field?: string; order?: number }): void {
    const allowed: AthleteSortField[] = [
      'first_name',
      'last_name',
      'belt',
      'stripes',
      'joined_at',
      'created_at',
    ];
    const field = event.field;
    if (!field || !(allowed as string[]).includes(field)) return;

    this.sortField.set(field as AthleteSortField);
    this.sortOrder.set(event.order === 1 ? 'asc' : 'desc');
    this.resetPage();
    this.load();
  }

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
