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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
    TranslatePipe,
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
  private readonly translate = inject(TranslateService);

  readonly documents = signal<ExpiringDocument[]>([]);
  readonly loading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly count = computed<number>(() => this.documents().length);

  // Static map (DocumentType → translation key) keeps the keys greppable and
  // forces TS to flag any new DocumentType case missing a translation, per
  // the dynamic-key rule in client/CLAUDE.md § i18n.
  private readonly typeKeys: Record<DocumentType, string> = {
    id_card: 'documents.types.id_card',
    medical_certificate: 'documents.types.medical_certificate',
    insurance: 'documents.types.insurance',
    other: 'documents.types.other',
  };

  typeKeyFor(doc: ExpiringDocument): string {
    return this.typeKeys[doc.type];
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
          summary: this.translate.instant('documents.expiringList.toast.errorSummary'),
          detail: this.translate.instant('documents.expiringList.toast.errorDetail', {
            filename: doc.original_name,
          }),
          life: 4000,
        });
      },
    });
  }
}
