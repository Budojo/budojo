import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * The five categories a support ticket can be filed under (#423 + the
 * post-v1.17 consolidation that folded the legacy /feedback flow into
 * support). Mirrors the `App\Enums\SupportTicketCategory` PHP enum on
 * the server — backed string values cross the API boundary verbatim.
 */
export type SupportTicketCategory = 'account' | 'billing' | 'bug' | 'feedback' | 'other';

export interface SubmitSupportTicketPayload {
  /** 3..100 chars (server-side validated). */
  readonly subject: string;
  readonly category: SupportTicketCategory;
  /** 10..5000 chars (server-side validated). */
  readonly body: string;
  /** Optional screenshot, ≤ 5 MB, png/jpeg/webp (server-side validated). */
  readonly image: File | null;
}

export interface SupportTicketResponse {
  readonly id: number;
  readonly createdAt: string;
}

interface SupportTicketEnvelope {
  readonly data: { readonly id: number; readonly created_at: string };
}

/**
 * Single contact / support form. The server persists a
 * `support_tickets` row AND queues an email with Reply-To set to the
 * user. Client renders a confirmation toast and resets the form on
 * success.
 *
 * **Multipart wire shape.** The body is `multipart/form-data` so the
 * optional screenshot can ride alongside the text fields. When no
 * image is selected the multipart still works — the server's
 * FormRequest treats `image` as nullable. Going multipart-by-default
 * (rather than branching JSON-vs-multipart on `image !== null`) keeps
 * the server-side controller uniform.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1`;

  submit(payload: SubmitSupportTicketPayload): Observable<SupportTicketResponse> {
    const form = new FormData();
    form.append('subject', payload.subject);
    form.append('category', payload.category);
    form.append('body', payload.body);
    if (payload.image !== null) {
      form.append('image', payload.image);
    }

    return this.http.post<SupportTicketEnvelope>(`${this.base}/support`, form).pipe(
      map((env) => ({
        id: env.data.id,
        createdAt: env.data.created_at,
      })),
    );
  }
}
