import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { Document, DocumentService } from '../../core/services/document.service';

/**
 * Athlete-portal documents list (M7 PR-D slice 5). Read-only — V1
 * shows what's on file (ID card, medical certificate, insurance,
 * other), each with its expiry date when set. Athletes cannot
 * upload from here yet; that's a deliberate V2 surface decision
 * (identity verification, content scanning, replace policy).
 */
@Component({
  selector: 'app-my-documents',
  standalone: true,
  imports: [TranslatePipe, DatePipe, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-documents.component.html',
  styleUrl: './my-documents.component.scss',
})
export class MyDocumentsComponent implements OnInit {
  private readonly documentService = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly documents = signal<readonly Document[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noProfile = signal(false);

  ngOnInit(): void {
    this.documentService
      .listMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (response === null) {
            this.noProfile.set(true);
          } else {
            this.documents.set(response.data);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }

  /**
   * Whether `expires_at` is on or before today (in local time).
   * Builds the comparison from local YYYY-MM-DD components rather
   * than relying on Date arithmetic to avoid UTC day shift in
   * non-UTC TZs (same lesson as MyAttendance).
   */
  protected isExpired(expiresAt: string | null): boolean {
    if (expiresAt === null) return false;
    const today = new Date();
    const todayStr =
      `${today.getFullYear()}-` +
      `${String(today.getMonth() + 1).padStart(2, '0')}-` +
      `${String(today.getDate()).padStart(2, '0')}`;
    return expiresAt.slice(0, 10) < todayStr;
  }

  /**
   * Convert the wire `YYYY-MM-DD` to a local Date so DatePipe doesn't
   * shift the day on non-UTC clients.
   */
  protected toLocalDate(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
}
