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
import { SkeletonModule } from 'primeng/skeleton';
import { DocumentService, ExpiringDocument } from '../../../core/services/document.service';

/**
 * Dashboard widget: a single glanceable signal about document health.
 *
 * - Fetches `GET /api/v1/documents/expiring?days=30` on init
 * - Shows the count of documents that are expired OR expiring in the next
 *   30 days, cross-athlete
 * - Wrapped in a native `<a routerLink>` to the full expiring list so the
 *   whole tile is keyboard-navigable without a custom (click) + tabindex
 *   dance (Jakob's Law: links look like links, behave like links)
 * - On fetch error, falls back to a muted "Couldn't check" state so the
 *   widget never blocks the underlying page (it is a companion, not a gate)
 *
 * Self-contained by design — the parent drops <app-expiring-documents-widget/>
 * and the component owns its own fetch + state. Trade-off: slightly harder
 * to test than a pure presentational component, but the parent stays
 * ignorant about document concerns.
 */
@Component({
  selector: 'app-expiring-documents-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SkeletonModule],
  templateUrl: './expiring-documents-widget.component.html',
  styleUrl: './expiring-documents-widget.component.scss',
})
export class ExpiringDocumentsWidgetComponent implements OnInit {
  private readonly documentService = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);

  /** Raw payload, kept so tests can inspect the fetched rows if needed. */
  readonly documents = signal<ExpiringDocument[]>([]);
  readonly loading = signal<boolean>(true);
  readonly errored = signal<boolean>(false);

  readonly count = computed<number>(() => this.documents().length);

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
          // Non-blocking: a failed health check shouldn't wreck the page.
          // The tile shows a muted fallback instead of an error banner.
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
