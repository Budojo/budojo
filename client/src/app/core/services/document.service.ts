import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DocumentType = 'id_card' | 'medical_certificate' | 'insurance' | 'other';

export interface Document {
  id: number;
  athlete_id: number;
  type: DocumentType;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  issued_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string | null;
  /**
   * Soft-delete marker. **Always present** in the API response:
   * `null` on active documents, ISO-8601 timestamp on tombstones
   * (returned only when the list endpoint is called with `includeCancelled: true`).
   */
  deleted_at: string | null;
}

export interface DocumentMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface DocumentListResponse {
  data: Document[];
  meta?: DocumentMeta;
}

export interface DocumentListOptions {
  /** When true, soft-deleted documents are included as tombstones. */
  includeCancelled?: boolean;
}

/**
 * Shape returned by `GET /api/v1/documents/expiring`. Extends the base
 * `Document` with the eager-loaded athlete identity — the endpoint
 * always includes it (backend calls `->with('athlete')`), so the list
 * view and widget can render the athlete name without chaining a
 * second lookup per row. Only the fields needed for cross-athlete
 * display are surfaced; full athlete details still live under
 * `/api/v1/athletes/:id`.
 */
export interface ExpiringDocument extends Document {
  athlete: {
    id: number;
    first_name: string;
    last_name: string;
  };
}

/**
 * Athlete summary used in the `missing_medical_certificate` array of
 * the `/documents/expiring` envelope (#881). Active athletes with no
 * live (non-trashed) medical certificate row — same risk surface as
 * an expired one.
 */
export interface AthleteMissingMedicalCertificate {
  id: number;
  first_name: string;
  last_name: string;
}

/**
 * Composite envelope returned by `GET /api/v1/documents/expiring`.
 * Carries both the expiring documents and the "missing entirely"
 * athletes so the dashboard widget can render one combined count.
 */
export interface ExpiringDocumentsResponse {
  data: ExpiringDocument[];
  missing_medical_certificate: AthleteMissingMedicalCertificate[];
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1`;

  /**
   * Upload a new document for the given athlete. `body` is a pre-built
   * `FormData` — the caller assembles the multipart fields (`type`, `file`,
   * optional `issued_at`, `expires_at`, `notes`) so the service stays
   * transport-agnostic. Angular HttpClient auto-sets the multipart
   * `Content-Type` boundary when the body is a `FormData` instance; we
   * must NOT attach our own `Content-Type` header or the server won't
   * be able to parse the boundary.
   */
  upload(athleteId: number, body: FormData): Observable<Document> {
    return this.http
      .post<{ data: Document }>(`${this.base}/athletes/${athleteId}/documents`, body)
      .pipe(map((res) => res.data));
  }

  /**
   * Cross-athlete query of documents that are expired OR expiring within
   * `days` days. Used by the dashboard widget and the full expiring list
   * view. Backend enforces a max days ceiling and a hard result cap; we
   * just forward `days` and consume whatever comes back.
   */
  listExpiring(days: number = 30): Observable<ExpiringDocument[]> {
    const params = new HttpParams().set('days', String(days));
    return this.http
      .get<{ data: ExpiringDocument[] }>(`${this.base}/documents/expiring`, { params })
      .pipe(map((res) => res.data));
  }

  /**
   * Full documents-health snapshot (#881): expiring documents AND
   * active athletes missing a medical certificate. The widget consumes
   * this composite shape; `listExpiring()` above stays for callers
   * that only want the expiring list.
   */
  fetchDocumentsHealth(days: number = 30): Observable<ExpiringDocumentsResponse> {
    const params = new HttpParams().set('days', String(days));
    return this.http.get<ExpiringDocumentsResponse>(`${this.base}/documents/expiring`, { params });
  }

  /**
   * Athlete-portal read-only document list (M7 PR-D slice 5). Returns
   * the auth athlete's documents (or `null` on 404 — no athlete
   * profile linked, which the component renders as the no-profile
   * state without subscribing to an error path).
   */
  listMine(): Observable<DocumentListResponse | null> {
    return this.http
      .get<DocumentListResponse>(`${this.base}/me/documents`)
      .pipe(
        catchError((err: HttpErrorResponse) =>
          err.status === 404 ? of<DocumentListResponse | null>(null) : throwError(() => err),
        ),
      );
  }

  list(athleteId: number, options: DocumentListOptions = {}): Observable<DocumentListResponse> {
    let params = new HttpParams();
    if (options.includeCancelled) {
      params = params.set('trashed', '1');
    }
    return this.http.get<DocumentListResponse>(`${this.base}/athletes/${athleteId}/documents`, {
      params,
    });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${id}`);
  }

  /**
   * Build the download URL for a document. The auth interceptor attaches
   * the Bearer token to every outgoing HttpClient request, so a plain
   * `<a href>` or a `window.open()` WILL NOT authenticate — callers must
   * use an HttpClient-based flow (e.g. `download()` below, which returns
   * a Blob and honours the interceptor). This method exists as the single
   * source of truth for the path; both `download()` and any future
   * consumer rely on it.
   */
  downloadUrl(id: number): string {
    return `${this.base}/documents/${id}/download`;
  }

  /**
   * Download a document via HttpClient (so the auth interceptor attaches the
   * Bearer token) and trigger a browser download. Returns an Observable of
   * the Blob so the caller can handle errors.
   */
  download(doc: Pick<Document, 'id' | 'original_name'>): Observable<Blob> {
    return this.http.get(this.downloadUrl(doc.id), { responseType: 'blob' });
  }
}
