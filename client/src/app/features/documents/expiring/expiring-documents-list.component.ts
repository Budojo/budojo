import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
import {
  DocumentService,
  DocumentType,
  ExpiringDocument,
} from '../../../core/services/document.service';
import { ExpiryStatusBadgeComponent } from '../../../shared/components/expiry-status-badge/expiry-status-badge.component';
import { triggerBrowserDownload } from '../../../shared/utils/download';

/**
 * Cross-athlete list of documents that are expired OR expiring within
 * 30 days. The deep-link target of the dashboard widget.
 *
 * Uses the same `listExpiring()` call as the widget. The full-page view
 * adds per-row detail (athlete identity linking back to the athlete's
 * documents page, document metadata, a download affordance, expiry status
 * badge) vs. the widget's count-only surface.
 *
 * P1 "replace document" shortcut was flagged out of scope in the M3 PRD
 * and deferred — the Download button is the only row action today.
 */
@Component({
  selector: 'app-expiring-documents-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonModule,
    SkeletonModule,
    TableModule,
    ToastModule,
    Tooltip,
    ExpiryStatusBadgeComponent,
  ],
  providers: [MessageService],
  templateUrl: './expiring-documents-list.component.html',
  styleUrl: './expiring-documents-list.component.scss',
})
export class ExpiringDocumentsListComponent implements OnInit {
  private readonly documentService = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);

  readonly documents = signal<ExpiringDocument[]>([]);
  readonly loading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly count = computed<number>(() => this.documents().length);

  private readonly typeLabels: Record<DocumentType, string> = {
    id_card: 'ID card',
    medical_certificate: 'Medical certificate',
    insurance: 'Insurance',
    other: 'Other',
  };

  labelFor(doc: ExpiringDocument): string {
    return this.typeLabels[doc.type];
  }

  athleteNameFor(doc: ExpiringDocument): string {
    return `${doc.athlete.first_name} ${doc.athlete.last_name}`;
  }

  ngOnInit(): void {
    this.documentService
      .listExpiring(30)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (docs) => {
          this.documents.set(docs);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }

  download(doc: ExpiringDocument): void {
    this.documentService.download(doc).subscribe({
      next: (blob) => triggerBrowserDownload(blob, doc.original_name),
      error: () => {
        // Norman feedback: silence on a failed download makes the button look
        // broken. A toast surfaces the error without blocking the page.
        this.messageService.add({
          severity: 'error',
          summary: 'Download failed',
          detail: `Could not download ${doc.original_name}. Please try again.`,
          life: 4000,
        });
      },
    });
  }
}
