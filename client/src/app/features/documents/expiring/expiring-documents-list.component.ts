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
  AthleteMissingMedicalCertificate,
  DocumentService,
  DocumentType,
  ExpiringDocument,
} from '../../../core/services/document.service';
import { ExpiryStatusBadgeComponent } from '../../../shared/components/expiry-status-badge/expiry-status-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { triggerBrowserDownload } from '../../../shared/utils/download';

/**
 * Cross-athlete view of open document issues — both the expiring
 * documents and the active athletes who don't have a medical
 * certificate on file (#891). Deep-link target of the dashboard
 * widget that surfaces the same combined count.
 *
 * Consumes the composite `fetchDocumentsHealth()` envelope so the two
 * lists land in one request: the user sees what the widget summarised,
 * not just half of it.
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
    PageHeaderComponent,
    ErrorStateComponent,
    EmptyStateComponent,
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
  readonly missingCerts = signal<readonly AthleteMissingMedicalCertificate[]>([]);
  readonly loading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly count = computed<number>(() => this.documents().length);
  readonly missingCount = computed<number>(() => this.missingCerts().length);
  readonly allClear = computed<boolean>(() => this.count() === 0 && this.missingCount() === 0);

  /**
   * Combined count chip for <app-page-header>. Renders one segment per
   * axis ("3 expiring · 2 no certificate") or a single segment when only
   * one axis is populated. Null while loading or on error.
   */
  protected readonly expiringCountLabel = computed<string | null>(() => {
    if (this.loading() || this.errored()) {
      return null;
    }
    const expiring = this.count();
    const missing = this.missingCount();
    const segments: string[] = [];
    if (expiring > 0) {
      segments.push(
        this.translate.instant('documents.expiringList.countExpiring', { count: expiring }),
      );
    }
    if (missing > 0) {
      segments.push(
        this.translate.instant('documents.expiringList.countMissing', { count: missing }),
      );
    }
    return segments.length === 0 ? null : segments.join(' · ');
  });

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

  missingAthleteNameFor(a: AthleteMissingMedicalCertificate): string {
    return `${a.first_name} ${a.last_name}`;
  }

  ngOnInit(): void {
    this.documentService
      .fetchDocumentsHealth(30)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (envelope) => {
          this.documents.set(envelope.data);
          // Defensive `?? []`: most Cypress mocks predate #891 and only
          // return `{ data: [] }`. The runtime envelope from a real API
          // call always carries the key, so this branch fires only
          // under stubbed E2E intercepts.
          this.missingCerts.set(envelope.missing_medical_certificate ?? []);
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
