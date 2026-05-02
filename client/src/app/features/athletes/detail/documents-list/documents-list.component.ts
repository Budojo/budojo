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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  Document,
  DocumentService,
  DocumentType,
} from '../../../../core/services/document.service';
import { ExpiryStatusBadgeComponent } from '../../../../shared/components/expiry-status-badge/expiry-status-badge.component';
import { triggerBrowserDownload } from '../../../../shared/utils/download';
import { UploadDocumentDialogComponent } from '../upload-document-dialog/upload-document-dialog.component';

const TOGGLE_STORAGE_KEY = 'documents.showCancelled';

@Component({
  selector: 'app-documents-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmPopup,
    SkeletonModule,
    TableModule,
    TagModule,
    ToastModule,
    ToggleSwitchModule,
    Tooltip,
    ExpiryStatusBadgeComponent,
    UploadDocumentDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './documents-list.component.html',
  styleUrl: './documents-list.component.scss',
})
export class DocumentsListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documentService = inject(DocumentService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly documents = signal<Document[]>([]);
  readonly loading = signal(true);
  readonly athleteId = signal<number | null>(null);
  readonly showCancelled = signal<boolean>(readTogglePersisted());
  readonly uploadDialogOpen = signal(false);

  readonly activeCount = computed(() => this.documents().filter((d) => !d.deleted_at).length);
  readonly cancelledCount = computed(() => this.documents().filter((d) => !!d.deleted_at).length);

  private readonly typeLabels: Record<DocumentType, string> = {
    id_card: 'ID card',
    medical_certificate: 'Medical certificate',
    insurance: 'Insurance',
    other: 'Other',
  };

  /** Presentational helper — used by the template to avoid typing issues on p-table's `let-doc`. */
  labelFor(doc: Document): string {
    return this.typeLabels[doc.type];
  }

  ngOnInit(): void {
    // Parent route is /athletes/:id — we read the id from the parent route params
    // so this component stays dumb about URL structure above it.
    const parentParams = this.route.parent?.paramMap;
    if (!parentParams) return;

    parentParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) return;
      const id = Number(idParam);
      if (!Number.isFinite(id)) return;
      this.athleteId.set(id);
      this.load();
    });
  }

  onToggleCancelled(value: boolean): void {
    this.showCancelled.set(value);
    // Persisted in localStorage so returning to the page keeps the user's
    // last-chosen view (Doherty: feels "remembered" instead of resetting).
    writeTogglePersisted(value);
    this.load();
  }

  cancelledOn(doc: Document): string | null {
    if (!doc.deleted_at) return null;
    // Render the first 10 chars of ISO timestamp → YYYY-MM-DD, server already
    // emits ISO-8601 so no timezone conversion needed for a calendar date.
    return doc.deleted_at.slice(0, 10);
  }

  confirmDelete(event: MouseEvent, doc: Document): void {
    // Krug "forgiveness for mistakes": destructive action always confirms.
    // Anchor the popup on the clicked button via `currentTarget` — PrimeNG
    // renders nested elements inside `<p-button>` so `event.target` could
    // resolve to an inner span/icon and misplace the popup.
    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('athletes.detail.documents.confirm.deleteMessage', {
        name: doc.original_name,
      }),
      acceptLabel: this.translate.instant('athletes.detail.documents.confirm.deleteAccept'),
      rejectLabel: this.translate.instant('athletes.detail.documents.confirm.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.delete(doc),
    });
  }

  openUploadDialog(): void {
    this.uploadDialogOpen.set(true);
  }

  onUploaded(doc: Document): void {
    // Prepend optimistically — the server-created Document is the authoritative
    // value, no refetch needed for the row. The toggle state (active-only vs
    // include cancelled) doesn't matter here because uploaded docs are always
    // active, so the new row is always visible.
    this.documents.update((list) => [doc, ...list]);
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('athletes.detail.documents.toast.uploadedSummary'),
      detail: doc.original_name,
      life: 3000,
    });
  }

  download(doc: Document): void {
    // Norman feedback: download manifesto. HttpClient path so the auth interceptor
    // attaches the Bearer token (plain <a href> wouldn't, our endpoint needs auth).
    this.documentService.download(doc).subscribe({
      next: (blob) => triggerBrowserDownload(blob, doc.original_name),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.detail.documents.toast.downloadErrorSummary'),
          detail: this.translate.instant('athletes.detail.documents.toast.downloadErrorDetail'),
          life: 4000,
        });
      },
    });
  }

  private load(): void {
    const athleteId = this.athleteId();
    if (athleteId === null) return;

    this.loading.set(true);
    this.documentService
      .list(athleteId, { includeCancelled: this.showCancelled() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => this.documents.set(res.data),
        error: () => {
          this.documents.set([]);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.documents.toast.loadErrorSummary'),
            detail: this.translate.instant('athletes.detail.documents.toast.loadErrorDetail'),
            life: 4000,
          });
        },
      });
  }

  private delete(doc: Document): void {
    // Optimistic UI (Doherty Threshold < 400ms perceived delay): remove from
    // the list immediately. If the server fails, restore and show a toast.
    const previous = this.documents();
    this.documents.update((list) => list.filter((d) => d.id !== doc.id));

    this.documentService.delete(doc.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('athletes.detail.documents.toast.deletedSummary'),
          detail: this.translate.instant('athletes.detail.documents.toast.deletedDetail', {
            name: doc.original_name,
          }),
          life: 3000,
        });
        // If the toggle is on we might want to show the new tombstone — refetch
        // to pick up the just-cancelled row with its deleted_at timestamp.
        if (this.showCancelled()) this.load();
      },
      error: () => {
        // Rollback optimistic removal.
        this.documents.set(previous);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.detail.documents.toast.deleteErrorSummary'),
          detail: this.translate.instant('athletes.detail.documents.toast.deleteErrorDetail'),
          life: 4000,
        });
      },
    });
  }
}

function readTogglePersisted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(TOGGLE_STORAGE_KEY) === '1';
}

function writeTogglePersisted(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(TOGGLE_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(TOGGLE_STORAGE_KEY);
  }
}
