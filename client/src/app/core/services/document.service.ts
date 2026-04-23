import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  /** Set on tombstones (soft-deleted docs). Null / absent on active ones. */
  deleted_at?: string | null;
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

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';

  list(athleteId: number, options: DocumentListOptions = {}): Observable<DocumentListResponse> {
    let params = new HttpParams();
    if (options.includeCancelled) {
      params = params.set('trashed', '1');
    }
    return this.http.get<DocumentListResponse>(
      `${this.base}/athletes/${athleteId}/documents`,
      { params },
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${id}`);
  }

  /**
   * Build the authenticated download URL for a document. The auth interceptor
   * attaches the Bearer token to every outgoing request, so a plain <a href>
   * or a `window.open()` from the browser WILL NOT authenticate — the caller
   * must either use an HttpClient.get stream or a solution that forwards the
   * token. For M3.2 we surface this URL in the UI as an anchor that triggers
   * an HttpClient GET which honours the interceptor.
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
