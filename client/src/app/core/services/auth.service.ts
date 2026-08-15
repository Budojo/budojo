import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, tap } from 'rxjs';
import { AcademyService } from './academy.service';
import { TokenStorageService } from './token-storage.service';
import { environment } from '../../../environments/environment';

/**
 * Persona discriminator on the SPA side (#445, M7). Mirrors the
 * `App\Enums\UserRole` backing values verbatim. `owner` is the
 * default for every public-register user; `athlete` is set only via
 * the M7 invite-accept flow.
 */
export type UserRole = 'owner' | 'athlete';

export interface User {
  id: number;
  /**
   * Given name (#479). Required by the server (`first_name` NOT NULL,
   * default '' covers the migration backfill). The SPA uses this on
   * its own for greeting surfaces ("Hi Mario") — the welcome topbar
   * chip, mail bodies, etc.
   */
  first_name: string;
  /**
   * Family name (#479). Required. May legitimately be empty for a
   * single-token migrated row that hasn't been edited yet.
   */
  last_name: string;
  /**
   * Server-derived `first_name + ' ' + last_name`, trimmed. The SPA
   * renders this anywhere the legacy `name` field used to land
   * (sidebar greeting fallback, account menu, audit lines).
   */
  full_name: string;
  /**
   * Instagram-style user-chosen handle (#479). Globally unique,
   * lowercase, 3-30 chars, `[a-z0-9_.]`, must start with a letter,
   * no consecutive dots, no leading/trailing dot. Null until the user
   * opts in via the profile page; never auto-generated.
   */
  handle: string | null;
  email: string;
  /**
   * Persona discriminator (#445). The SPA reads this to branch the
   * post-login destination + the route guards. Optional in the
   * type only for backward compatibility with cached / fixture
   * envelopes that predate the field; the server's `UserResource`
   * always emits it.
   */
  role?: UserRole;
  /** ISO-8601 timestamp; null until the user clicks the verify link. */
  email_verified_at: string | null;
  /**
   * Public URL of the user's uploaded avatar (#411). `null` when none has
   * been uploaded yet — the SPA renders an initials placeholder in that
   * case. The server stores the original bytes (no resize) and the SPA
   * renders the image inside a fixed circular frame via CSS `object-fit`,
   * so the URL is safe to drop into any slot from a 32px chip up to the
   * profile card. Required on the wire (the server's `UserResource`
   * always emits the key, null or string) — typing it required here turns
   * a future contract regression into a compile-time failure instead of a
   * silent `undefined → null` fallback.
   */
  avatar_url: string | null;
  /**
   * Pending email change row (#476). Non-null when the user has
   * requested an email change but hasn't clicked the verification
   * link yet — `email` above is still the OLD address until the click
   * confirms. The wire shape carries a partial mask (`j***@e***.com`),
   * not the full candidate: defence in depth against shoulder-surfing
   * the destination from the same inbox the change is being audited
   * to. Optional in the type so pre-#476 fixtures / Cypress mocks
   * continue to compile; the server's `UserResource` always emits the
   * key (null or object).
   */
  pending_email_change?: {
    new_email_partial: string;
    expires_at: string;
  } | null;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
  /**
   * Terms-of-Service acceptance gate (#420). Always sent as `true`;
   * the SPA's `Validators.requiredTrue` blocks submit while the box
   * is unticked. The server's `RegisterRequest` enforces the
   * `accepted` rule independently and stamps `users.terms_accepted_at`
   * on success.
   */
  terms_accepted: true;
}

export interface LoginPayload {
  email: string;
  password: string;
  /**
   * Optional second-factor (TOTP or backup code) sent with the
   * login. Absent on the first attempt; the server replies 422
   * with `message: "two_factor_required"` if the account has 2FA
   * active, and the SPA retries with this field populated.
   */
  two_factor_code?: string;
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

export interface ChangePasswordPayload {
  current_password: string;
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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly academyService = inject(AcademyService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly base = `${environment.apiBase}/api/v1/auth`;

  readonly isLoggedIn = signal<boolean>(this.tokenStorage.get() !== null);

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
    return this.tokenStorage.get();
  }

  private storeToken(token: string): void {
    this.tokenStorage.set(token);
    this.isLoggedIn.set(true);
  }

  /**
   * Drop a Sanctum bearer token issued by a flow that lives outside
   * the standard register/login pipeline (#445, M7 PR-C — the
   * athlete-invite accept flow). Public wrapper around `storeToken`
   * so the calling component can hydrate the SPA's auth state without
   * the service needing knowledge of every alternate auth path.
   * After call, the next `loadCurrentUser()` populates the user
   * envelope identically to a normal login.
   */
  adoptIssuedToken(token: string): void {
    this.storeToken(token);
  }

  logout(): void {
    // Revoke the token on the server (#1227) — a stored desktop credential
    // must not stay valid after sign-out — then clear locally regardless of
    // the result: the user asked to leave, and a network blip must not trap
    // them signed in. finalize() runs on success and error alike.
    this.http
      .post(`${this.base}/logout`, {})
      .pipe(finalize(() => this.clearSession()))
      .subscribe({ error: () => undefined });
  }

  private clearSession(): void {
    this.tokenStorage.clear();
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
   * `POST /api/v1/me/avatar` (multipart, #411). Stores the original
   * uploaded image (no server-side resize — the SPA renders inside a
   * fixed circular frame via CSS `object-fit`). Same-extension replace
   * overwrites in place; different-extension replace unlinks the
   * previous file. The response is the full `User` envelope, so we
   * swap the cached `user` signal in `tap()` — every consumer (header
   * chip, profile page, dashboard sidebar's future avatar slot) sees
   * the new URL on the next tick. The `avatar_url` carries a `?v=...`
   * cache-buster so a same-path replace forces the browser to re-fetch.
   */
  uploadAvatar(file: File): Observable<User> {
    const form = new FormData();
    form.append('avatar', file);
    return this.http.post<MeResponse>(`${environment.apiBase}/api/v1/me/avatar`, form).pipe(
      tap((res) => this.user.set(res.data)),
      map((res) => res.data),
    );
  }

  /**
   * `DELETE /api/v1/me/avatar`. Server is idempotent — calling it when no
   * avatar exists still returns 200 with `avatar_url: null`, so the SPA
   * doesn't have to gate the call on `avatar_url` being set client-side.
   */
  removeAvatar(): Observable<User> {
    return this.http.delete<MeResponse>(`${environment.apiBase}/api/v1/me/avatar`).pipe(
      tap((res) => this.user.set(res.data)),
      map((res) => res.data),
    );
  }

  /**
   * `PATCH /api/v1/me` (#463 + #479) — self-edit on the authenticated
   * user's profile. Three editable fields after #479: `first_name`,
   * `last_name`, `handle`. Email change is the dedicated `/me/email-
   * change` flow (#476).
   *
   * `handle` accepts `null` to clear, a valid IG-style string to set,
   * or the current value (no-op edit). The server lowercases and
   * validates uniqueness; the rule rejects mixed-case input so the
   * SPA-side handle input must lowercase as the user types.
   *
   * Response is the full `User` envelope (mirroring `/auth/me`), so
   * we swap the cached `user` signal in `tap()` — every consumer
   * (header chip via initials fallback, profile card, future
   * surfaces) sees the new shape on the next change-detection tick.
   */
  updateProfile(payload: {
    first_name: string;
    last_name: string;
    handle: string | null;
  }): Observable<User> {
    return this.http.patch<MeResponse>(`${environment.apiBase}/api/v1/me`, payload).pipe(
      tap((res) => this.user.set(res.data)),
      map((res) => res.data),
    );
  }

  /**
   * `POST /api/v1/me/password` (#409) — rotates the password from inside
   * the app. The server re-authenticates with `current_password` before
   * applying the change; on success it revokes every other Sanctum
   * token belonging to the user but preserves THIS token, so the SPA
   * stays logged in. 422 on wrong current password (`errors.current_password`)
   * or same-as-old / weak / mismatched new (`errors.password`).
   */
  changePassword(payload: ChangePasswordPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiBase}/api/v1/me/password`,
      payload,
    );
  }

  /**
   * `POST /api/v1/me/email-change` (#476) — request a change to the
   * authenticated user's login email. The server creates a
   * `pending_email_changes` row and queues two mails (verification to
   * the new address, audit notification to the old). The CACHED USER
   * SIGNAL IS NOT MUTATED HERE: until the verification link is
   * clicked the live email is unchanged, so swapping the SPA-side
   * cache would lie to every consumer (header chip, profile row,
   * dashboard sidebar). The pending pillola surfaces from the
   * `pending_email_change` block on the next `/auth/me` round-trip
   * (or directly via `loadCurrentUser()`).
   */
  requestEmailChange(newEmail: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.apiBase}/api/v1/me/email-change`, {
      email: newEmail,
    });
  }

  /**
   * `DELETE /api/v1/me/email-change` (#476) — drop an outstanding
   * pending row. Idempotent server-side. After cancelling, hydrate
   * the cached user signal so the pillola disappears in the same
   * tick (no stale UI).
   */
  cancelPendingEmailChange(): Observable<void> {
    return this.http
      .delete<void>(`${environment.apiBase}/api/v1/me/email-change`)
      .pipe(tap(() => this.loadCurrentUser().subscribe()));
  }

  /**
   * `POST /api/v1/email-change/{token}/verify` (#476) — public
   * confirmation endpoint. The click on the verification link IS the
   * auth (no Sanctum bearer required). On success the server applies
   * the change and returns 200; on expired / consumed / unknown
   * tokens it returns 410 with `{message: 'invalid_or_expired_link'}`.
   *
   * Deliberately does NOT auto-login the user (server-side decision
   * for #476): the verify component renders a confirmed panel and
   * bounces to `/auth/login` so the user signs in with the new
   * address. Conservative anti-leak choice — a verification URL
   * found in a stranger's inbox cannot grant a session.
   */
  verifyEmailChange(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiBase}/api/v1/email-change/${token}/verify`,
      {},
    );
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
