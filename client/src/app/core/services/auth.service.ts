import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AcademyService } from './academy.service';
import { environment } from '../../../environments/environment';

export interface User {
  id: number;
  name: string;
  email: string;
  /** ISO-8601 timestamp; null until the user clicks the verify link. */
  email_verified_at: string | null;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
}

export interface AuthResponse {
  data: User;
  token: string;
}

interface MeResponse {
  data: User;
}

const TOKEN_KEY = 'auth_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly academyService = inject(AcademyService);
  private readonly base = `${environment.apiBase}/api/v1/auth`;

  readonly isLoggedIn = signal<boolean>(!!localStorage.getItem(TOKEN_KEY));

  /**
   * Cached current user. Hydrated by `loadCurrentUser()` on bootstrap and
   * refreshed by `register()` / `login()` (both return the user envelope).
   * Components subscribe directly — the verification pillola in the topbar
   * and the profile page read this signal.
   */
  readonly user = signal<User | null>(null);

  /** True if the cached user has confirmed their email. */
  readonly isEmailVerified = computed(() => {
    const u = this.user();
    return u !== null && u.email_verified_at !== null;
  });

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private storeToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.isLoggedIn.set(true);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.isLoggedIn.set(false);
    this.user.set(null);
    this.academyService.clear();
  }

  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/register`, payload).pipe(
      tap((res) => {
        this.storeToken(res.token);
        this.user.set(res.data);
      }),
    );
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/login`, payload).pipe(
      tap((res) => {
        this.storeToken(res.token);
        this.user.set(res.data);
      }),
    );
  }

  /**
   * Hydrate `user` from `GET /auth/me`. Call on bootstrap when a token is
   * already in localStorage so the SPA can render verification state without
   * waiting for the next register/login.
   */
  loadCurrentUser(): Observable<User> {
    return this.http.get<MeResponse>(`${this.base}/me`).pipe(
      tap((res) => this.user.set(res.data)),
      map((res) => res.data),
    );
  }

  /**
   * `POST /auth/forgot-password` (M5 PR-A). Always succeeds with 202
   * regardless of whether the email is registered — the server keeps
   * the response identical to defeat account enumeration. Throttled
   * server-side to 6 requests per minute per IP; the form should still
   * disable submit briefly to avoid double-clicks.
   */
  forgotPassword(payload: ForgotPasswordPayload): Observable<void> {
    return this.http.post<void>(`${this.base}/forgot-password`, payload);
  }

  /**
   * `POST /auth/reset-password` (M5 PR-A). The `token` + `email` come
   * from the email's reset URL (`/auth/reset-password?token=...&email=...`);
   * `password` + `password_confirmation` come from the form. 200 on
   * success, 422 on token-invalid / token-expired / mismatched
   * confirmation — the server collapses every failure mode to a 422
   * with an `errors.email` payload, so the form should surface a single
   * "the link is invalid or has expired" message rather than trying to
   * differentiate.
   */
  resetPassword(payload: ResetPasswordPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/reset-password`, payload);
  }

  /**
   * `POST /email/verification-notification`. Server rate-limits to one call
   * per minute per user; components owning a CTA should additionally surface
   * a 60s cooldown so a frantic user doesn't hit the 429 path repeatedly.
   */
  resendVerificationEmail(): Observable<void> {
    return this.http.post<void>(
      `${environment.apiBase}/api/v1/email/verification-notification`,
      {},
    );
  }

  /**
   * GDPR Art. 20 — data portability (#222). Downloads the authenticated
   * user's full dataset, either as a JSON file or as a ZIP that bundles
   * the JSON plus document binaries. Server enforces a 1-call-per-minute
   * throttle.
   *
   * Returns the Blob + filename parsed from `Content-Disposition`; the
   * caller (typically the profile page) is responsible for triggering
   * the actual browser download via an anchor + `URL.createObjectURL`.
   */
  exportMyData(format: 'json' | 'zip' = 'zip'): Observable<{ blob: Blob; filename: string }> {
    const url = `${environment.apiBase}/api/v1/me/export${format === 'zip' ? '?format=zip' : ''}`;
    return this.http.get(url, { responseType: 'blob', observe: 'response' }).pipe(
      map((res) => ({
        blob: res.body as Blob,
        filename: parseContentDispositionFilename(res.headers.get('Content-Disposition'), format),
      })),
    );
  }
}

/**
 * Pulls `filename="..."` out of a Content-Disposition header. Falls back
 * to a format-aware sensible default when the header is missing or
 * malformed — JSON exports stay `.json`, ZIP exports stay `.zip`.
 */
function parseContentDispositionFilename(header: string | null, format: 'json' | 'zip'): string {
  const fallback = format === 'zip' ? 'budojo-export.zip' : 'budojo-export.json';
  if (header === null) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}
