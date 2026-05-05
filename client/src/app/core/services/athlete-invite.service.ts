import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Pre-fill snapshot returned by `GET /api/v1/athlete-invite/{token}/preview`
 * (#445, M7 PR-C). The shape is intentionally flat — only what the SPA needs
 * to render the accept form. Nothing here exposes data the URL holder couldn't
 * already infer if the token is valid.
 */
export interface AthleteInvitePreview {
  first_name: string;
  last_name: string;
  email: string;
  academy_name: string;
  expires_at: string;
}

interface AthleteInvitePreviewResponse {
  data: AthleteInvitePreview;
}

/**
 * Wire shape of the accept response (#445, M7 PR-C). Mirrors the
 * `/auth/login` and `/auth/register` envelopes: a Sanctum bearer token
 * plus the freshly-created user, ready for the SPA to drop in.
 */
export interface AthleteInviteAcceptResponse {
  data: {
    token: string;
    user: {
      id: number;
      name: string;
      email: string;
      role: 'owner' | 'athlete';
    };
  };
}

export interface AthleteInviteAcceptPayload {
  password: string;
  password_confirmation: string;
  accept_privacy: true;
  accept_terms: true;
}

/**
 * Public endpoint client for the athlete invitation accept flow.
 * Lives outside `auth.service.ts` because the flow is mechanically
 * distinct: no email + password input (email is dictated by the
 * server-bound row), no `/me` bootstrap, just token-in-URL ↔ token-out.
 */
@Injectable({ providedIn: 'root' })
export class AthleteInviteService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/athlete-invite`;

  preview(token: string): Observable<AthleteInvitePreview> {
    return this.http
      .get<AthleteInvitePreviewResponse>(`${this.base}/${token}/preview`)
      .pipe(map((res) => res.data));
  }

  accept(
    token: string,
    payload: AthleteInviteAcceptPayload,
  ): Observable<AthleteInviteAcceptResponse['data']> {
    return this.http
      .post<AthleteInviteAcceptResponse>(`${this.base}/${token}/accept`, payload)
      .pipe(map((res) => res.data));
  }
}
