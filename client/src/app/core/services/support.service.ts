import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * The four categories a support ticket can be filed under (#423).
 * Mirrors the `App\Enums\SupportTicketCategory` PHP enum on the
 * server — backed string values cross the API boundary verbatim.
 */
export type SupportTicketCategory = 'account' | 'billing' | 'bug' | 'other';

export interface SubmitSupportTicketPayload {
  /** 3..100 chars (server-side validated). */
  readonly subject: string;
  readonly category: SupportTicketCategory;
  /** 10..5000 chars (server-side validated). */
  readonly body: string;
}

export interface SupportTicketResponse {
  readonly id: number;
  readonly createdAt: string;
}

interface SupportTicketEnvelope {
  readonly data: { readonly id: number; readonly created_at: string };
}

/**
 * Support contact form (#423) — distinct from the in-app feedback
 * service (#311) because this endpoint expects a reply: the server
 * persists a `support_tickets` row AND queues an email with Reply-To
 * set to the user. Client side, the SPA renders a confirmation toast
 * and resets the form on success.
 *
 * **Why JSON, not multipart.** Unlike feedback (which carries an
 * optional binary image attachment), support is plain text — subject
 * + category + body. JSON keeps the wire format honest and the
 * server-side controller free of the image-parsing branch feedback
 * needs.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1`;

  submit(payload: SubmitSupportTicketPayload): Observable<SupportTicketResponse> {
    return this.http
      .post<SupportTicketEnvelope>(`${this.base}/support`, {
        subject: payload.subject,
        category: payload.category,
        body: payload.body,
      })
      .pipe(
        map((env) => ({
          id: env.data.id,
          createdAt: env.data.created_at,
        })),
      );
  }
}
