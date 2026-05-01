import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { VERSION } from '../../../environments/version';

export interface SubmitFeedbackPayload {
  /** 3..100 chars (server-side validated). */
  readonly subject: string;
  /** 10..2000 chars (server-side validated). */
  readonly description: string;
  /** Optional png/jpeg/webp, max 5 MB. */
  readonly image: File | null;
}

/**
 * In-app feedback submission (#311). The submission is fire-and-forget
 * from the SPA's perspective — the server queues an email to the
 * product owner; the response just confirms the queue accepted it
 * (HTTP 202). The form clears on success and the user can submit
 * another piece of feedback without leaving the page.
 *
 * **Why FormData even when there's no image.** Multipart works for
 * subject/description alone too, and using one transport for both
 * shapes keeps the server-side controller uniform (no "if image is
 * present, parse multipart; otherwise, parse JSON" branch). Angular's
 * HttpClient handles FormData boundary headers automatically — we
 * MUST NOT set Content-Type ourselves or the server can't parse the
 * boundary.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1`;

  submit(payload: SubmitFeedbackPayload): Observable<void> {
    const body = new FormData();
    body.append('subject', payload.subject);
    body.append('description', payload.description);
    // The build-time SPA version (or "dev" on hot-reload). Sent as a
    // body field rather than a header so a CDN strip / Cloudflare
    // header transformer can't lose it in transit.
    body.append('app_version', VERSION.tag);
    if (payload.image !== null) {
      body.append('image', payload.image, payload.image.name);
    }
    return this.http.post<void>(`${this.base}/feedback`, body);
  }
}
