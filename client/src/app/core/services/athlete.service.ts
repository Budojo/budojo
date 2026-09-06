import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
// Address types live in academy.service for now (#72a); re-imported here
// instead of duplicated. If a third owner shows up the types should move
// to a dedicated `address.types.ts` and both services should import from
// there — Rule of Three for the extraction trigger.
import { Address } from './academy.service';
import { FeeTier } from './fee-tier.service';
import { environment } from '../../../environments/environment';

export type Belt =
  // IBJJF Youth belts (#230).
  | 'grey'
  | 'yellow'
  | 'orange'
  | 'green'
  // IBJJF Adult belts.
  | 'white'
  | 'blue'
  | 'purple'
  | 'brown'
  | 'black'
  // IBJJF senior ranks beyond black (#229) — 7°+ graus get their own
  // colour. 1°-6° on black are tracked via `stripes`, not enum cases.
  | 'red-and-black'
  | 'red-and-white'
  | 'red';

/**
 * Stripes ceiling per belt — single source of truth on the FE side
 * (mirrors `App\Enums\Belt::maxStripes()` on the server). Black has
 * 6 graus (1°-6°); every other belt caps at 4. Used by the form
 * picker to render only valid options for the selected belt.
 */
export const MAX_STRIPES_PER_BELT: Record<Belt, number> = {
  grey: 4,
  yellow: 4,
  orange: 4,
  green: 4,
  white: 4,
  blue: 4,
  purple: 4,
  brown: 4,
  black: 6,
  'red-and-black': 4,
  'red-and-white': 4,
  red: 4,
};
export type AthleteStatus = 'active' | 'suspended' | 'inactive';

/**
 * Filter token for the athletes-list `?status=` query (#700). Extends
 * `AthleteStatus` with the special-cased `'trashed'` value that the
 * server resolves into a `->onlyTrashed()` query scope (the restore
 * picker UI). Lives separately from `AthleteStatus` because trashed
 * is NEVER a stored value on `athletes.status` — it's a view mode.
 */
export type AthleteListStatus = AthleteStatus | 'trashed';

export interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  /**
   * E.164 prefix including the leading `+`, e.g. `+39`. Always paired with
   * `phone_national_number` — both are null OR both carry a value (#75).
   */
  phone_country_code: string | null;
  /**
   * Unformatted national digits, e.g. `3331234567`. Always paired with
   * `phone_country_code`. Display formatting (spacing, parentheses) is the
   * caller's concern.
   */
  phone_national_number: string | null;
  /**
   * Contact links (#162) — three independently nullable URLs. The SPA
   * renders these as external links on the athlete detail page; the
   * form accepts each independently. Optional on this interface for
   * fixture-compat (the wire shape always includes them from #162 on).
   */
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  date_of_birth: string | null;
  belt: Belt;
  stripes: number;
  status: AthleteStatus;
  joined_at: string;
  /**
   * Public handle of the user this athlete row is linked to. Null when:
   *   - the athlete hasn't been linked to a user yet (V1 athletes
   *     created without an invite flow);
   *   - the linked user hasn't set a handle.
   * The athletes-list shows the "view public profile" icon only when
   * this is non-null.
   */
  user_handle?: string | null;
  /**
   * Linked-user avatar URL (#983). Null when the athlete row has no
   * linked user OR the user hasn't uploaded an avatar yet. The
   * athletes-list renders a circular `pi pi-user` placeholder in that
   * case so every row gets the same visual rhythm.
   */
  user_avatar_url?: string | null;
  /**
   * The athlete's own photo (#1357), independent of any linked user account.
   *
   * That independence is the point: `athlete_accounts` is absent from the
   * desktop runtime, so before this an athlete on the shipped build could never
   * have a picture at all. Carries a `?v=` cache-buster, because a
   * same-format replacement writes to the same path and the browser would
   * otherwise keep serving the old bitmap.
   */
  photo_url?: string | null;
  /**
   * Structured address (#72b). `null` means no address on file. Same
   * read/write asymmetry as Academy: writes require every field except
   * `line2`; reads may carry nulls for legacy rows backfilled from a
   * pre-#72 freeform column (athletes had no freeform column historically,
   * but the type is shared with Academy so the asymmetry is uniform).
   */
  address: Address | null;
  created_at: string;
  /**
   * Derived server-side: true iff a row exists in `athlete_payments` for
   * the current calendar month. Marked optional to keep existing test
   * fixtures and Cypress mocks compiling — the wire shape ALWAYS includes
   * it from #104 onward; #105 (paid badge + filter) tightens to required.
   */
  paid_current_month?: boolean;
  /**
   * The athlete's spendable carnet today (#1364), or `null` when they hold
   * none — the roster renders its balance chip from this without a per-row
   * call. When more than one is spendable this is the one expiring soonest,
   * i.e. the one the next session will be charged against. Optional for the
   * same fixture-compat reason as `paid_current_month`.
   */
  active_carnet?: {
    readonly id: number;
    readonly code: string;
    readonly remaining_entries: number;
    readonly expires_at: string;
  } | null;
  /**
   * Owner-as-athlete flag (#748). True iff the row was created via the
   * caller's own `POST /api/v1/me/athlete` enrollment — i.e. this
   * athlete *is* an academy staff member training in their own academy.
   * The SPA renders an `Owner` chip + hides the payment column + the
   * regular Delete CTA on these rows. Optional to keep pre-#748 mocks
   * and fixtures compiling; the wire shape includes it on every athlete
   * resource from #748 onward.
   */
  is_self?: boolean;
  /**
   * The single invitation row the SPA renders on the athlete-detail
   * card (#467, M7 PR-B-UI). Read-only projection — never carries the
   * raw token / hash. `null` when there's no active row OR on the
   * index endpoint (the server only loads the relation on `show`).
   * Optional to keep pre-#467 fixtures and Cypress mocks compiling.
   */
  invitation?: AthleteInvitationSummary | null;
  /**
   * Which line of the academy's price list this athlete is on (#1381), or
   * `null` when they are on none — the case for every athlete until someone
   * is moved onto a tier.
   */
  fee_tier?: FeeTier | null;
  /**
   * What this athlete actually pays each month: their tier's amount if they
   * are on one, the academy's flat fee otherwise. Resolved server-side so the
   * SPA never re-derives the fallback and the two can't disagree. `null` means
   * no fee applies and a payment cannot be recorded.
   */
  monthly_fee_cents?: number | null;
  /**
   * How many months this athlete's payments cover (#1382): 1 monthly, 3
   * quarterly, 6 half-yearly, 12 annual. Optional for fixture-compat; readers
   * treat a missing value as monthly, which is what every athlete is.
   */
  billing_period_months?: number;
  /**
   * What is paying for this athlete's current month (#1402), resolved
   * server-side by `App\Support\MonthCoverage` — the fee's period if one
   * covers it, otherwise a spendable carnet, otherwise nothing.
   *
   * Read this rather than re-deriving it: which cover wins when both apply is
   * a domain rule (the fee, since #1380), and a second implementation on the
   * client is how the roster and the ledger come to disagree. Optional for
   * fixture-compat; readers fall back to `paid_current_month`.
   */
  payment_coverage?: PaymentCoverage;
}

/** The shapes `payment_coverage` takes. Mirrors `App\Enums\PaymentCoverage`. */
export type PaymentCoverage =
  'monthly' | 'quarterly' | 'half_yearly' | 'annual' | 'carnet' | 'none';

export interface AthleteMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface AthleteListResponse {
  data: Athlete[];
  meta: AthleteMeta;
}

export type AthleteSortField = 'first_name' | 'last_name' | 'belt' | 'joined_at' | 'created_at';

export type AthleteSortOrder = 'asc' | 'desc';

export type AthletePaidFilter = 'yes' | 'no';

export interface AthleteFilters {
  belt?: Belt;
  status?: AthleteListStatus;
  page?: number;
  sortBy?: AthleteSortField;
  sortOrder?: AthleteSortOrder;
  /**
   * Free-text name search forwarded to the backend as `?q=...`. Tokens are
   * AND-matched across first_name and last_name — see OpenAPI spec for the
   * exact semantics. Whitespace-only values should be stripped before this
   * field is set.
   */
  q?: string;
  /**
   * `yes` filters down to athletes who have paid for the current calendar
   * month; `no` to those who haven't. Server-side filter (#105) because the
   * list is paginated — a client-side sweep would only see the current 20
   * rows. Hidden in the UI when the academy hasn't configured a fee.
   */
  paid?: AthletePaidFilter;
}

/**
 * Payload accepted by POST /api/v1/athletes and PUT /api/v1/athletes/{id}.
 * Dates are ISO date strings in YYYY-MM-DD format.
 * On update, all fields are optional (partial update).
 */
export interface AthletePayload {
  first_name: string;
  last_name: string;
  email?: string | null;
  /**
   * Structured phone (#75) — both country code and national number must be
   * sent together (or both omitted/null). The backend cross-validates the
   * pair against libphonenumber.
   */
  phone_country_code?: string | null;
  phone_national_number?: string | null;
  /**
   * Contact links (#162) — three independently nullable URLs. Each field
   * may be sent on create or update; `null` clears it.
   */
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  date_of_birth?: string | null;
  belt: Belt;
  stripes: number;
  status: AthleteStatus;
  joined_at: string;
  /**
   * Structured address (#72b). Three-way semantics:
   *   - omit the key → no change (server leaves the existing row untouched)
   *   - `null` → delete the existing morph row
   *   - `Address` object → upsert (create or replace in place)
   */
  address?: Address | null;
  /**
   * Which price tier the athlete is on (#1381). `null` puts them back on the
   * academy's flat fee; omitting the key leaves the tier untouched.
   */
  fee_tier_id?: number | null;
  /** How many months each payment covers (#1382): 1, 3, 6 or 12. */
  billing_period_months?: number;
}

export type AthleteUpdatePayload = Partial<AthletePayload>;

interface AthleteResponse {
  data: Athlete;
}

/**
 * Lifecycle state of an athlete invitation row (#445, M7 PR-B). The
 * server derives this from the (accepted_at, revoked_at, expires_at)
 * triplet — the four states are pairwise mutually exclusive.
 */
export type AthleteInvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface AthleteInvitation {
  id: number;
  athlete_id: number;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  last_sent_at: string | null;
  state: AthleteInvitationState;
}

interface AthleteInvitationResponse {
  data: AthleteInvitation;
}

/**
 * Wire-shape of the read-side projection embedded in `AthleteResource`
 * (#467, M7 PR-B-UI). Lighter than `AthleteInvitation` — only the
 * fields the athlete-detail card needs to render the three states
 * ("no invite", "pending", "accepted"). Never carries the token or
 * its hash. `null` when there's no active row (revoked / expired
 * audit history is filtered server-side).
 */
export interface AthleteInvitationSummary {
  id: number;
  state: 'pending' | 'accepted';
  sent_at: string | null;
  expires_at: string;
  accepted_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class AthleteService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/athletes`;

  list(filters: AthleteFilters = {}): Observable<AthleteListResponse> {
    let params = new HttpParams();
    if (filters.belt) params = params.set('belt', filters.belt);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.sortBy) params = params.set('sort_by', filters.sortBy);
    if (filters.sortOrder) params = params.set('sort_order', filters.sortOrder);
    if (filters.q) params = params.set('q', filters.q);
    if (filters.paid) params = params.set('paid', filters.paid);
    return this.http.get<AthleteListResponse>(this.base, { params });
  }

  get(id: number): Observable<Athlete> {
    return this.http.get<AthleteResponse>(`${this.base}/${id}`).pipe(map((res) => res.data));
  }

  create(payload: AthletePayload): Observable<Athlete> {
    return this.http.post<AthleteResponse>(this.base, payload).pipe(map((res) => res.data));
  }

  update(id: number, payload: AthleteUpdatePayload): Observable<Athlete> {
    return this.http
      .put<AthleteResponse>(`${this.base}/${id}`, payload)
      .pipe(map((res) => res.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * Restore a previously soft-deleted athlete (#700). Returns the
   * refreshed `Athlete` so the caller can swap the row back into the
   * list without a refetch. Backend 404s on a non-trashed id, so the
   * UI flow that triggers this only ever fires from the trashed-list
   * surface.
   */
  /**
   * `POST /api/v1/athletes/{id}/photo` (multipart, #1357).
   *
   * Stores the original bytes — there is no server-side resize, because the
   * PHP image ships GD with PNG support only. The UI frames it with CSS
   * `object-fit: cover`, exactly as the user-avatar flow does.
   *
   * Returns the refreshed athlete, so the caller swaps the row in without a
   * refetch. The `photo_url` carries a `?v=` cache-buster: a same-format
   * replacement writes to the same path, and without it the browser would keep
   * showing the picture that was just replaced.
   */
  uploadPhoto(athleteId: number, file: File): Observable<Athlete> {
    const form = new FormData();
    form.append('photo', file);

    return this.http
      .post<AthleteResponse>(`${this.base}/${athleteId}/photo`, form)
      .pipe(map((res) => res.data));
  }

  /**
   * `DELETE /api/v1/athletes/{id}/photo`.
   *
   * Idempotent on the server: removing a photo that is not there still answers
   * 200 with `photo_url: null`, so the caller does not have to gate the call on
   * knowing whether one exists.
   */
  removePhoto(athleteId: number): Observable<Athlete> {
    return this.http
      .delete<AthleteResponse>(`${this.base}/${athleteId}/photo`)
      .pipe(map((res) => res.data));
  }

  restore(id: number): Observable<Athlete> {
    return this.http
      .post<AthleteResponse>(`${this.base}/${id}/restore`, {})
      .pipe(map((res) => res.data));
  }

  /**
   * Send (or refresh) an invitation for the athlete to log into the
   * SPA (#445, M7 PR-B). The server creates the row on first call;
   * subsequent calls re-use the same pending row (bumping
   * `last_sent_at` + replacing the token hash) so the owner clicking
   * twice doesn't spawn parallel invites.
   */
  invite(athleteId: number): Observable<AthleteInvitation> {
    return this.http
      .post<AthleteInvitationResponse>(`${this.base}/${athleteId}/invite`, {})
      .pipe(map((res) => res.data));
  }

  /**
   * Resend a pending invitation. Wire-shape identical to `invite()`
   * but the dedicated `/resend` URL gives the SPA UI an unambiguous
   * second button + lets a future audit hook tell first-send from
   * resend at the routing layer.
   */
  resendInvite(athleteId: number): Observable<AthleteInvitation> {
    return this.http
      .post<AthleteInvitationResponse>(`${this.base}/${athleteId}/invite/resend`, {})
      .pipe(map((res) => res.data));
  }

  /**
   * Revoke a pending invitation (sets `revoked_at`; the row stays as
   * audit trail). Idempotent server-side — calling on an already-
   * terminal invite is a no-op.
   */
  revokeInvite(athleteId: number, invitationId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${athleteId}/invitations/${invitationId}`);
  }

  /**
   * Change an athlete's email — owner-side (#476). The server branches
   * on the athlete's lifecycle state:
   *
   * - `direct`      → no invitation and no linked user — `athletes.email`
   *                   mutated immediately, no mail.
   * - `invite_swap` → active invitation existed for the OLD email;
   *                   it's been revoked, the athletes row updated, and
   *                   a fresh invitation queued to the NEW email.
   * - `pending`     → the athlete is a logged-in user; a pending
   *                   email-change row was created and a verification
   *                   link queued. `athletes.email` stays as-is until
   *                   the athlete clicks the link.
   *
   * The caller branches the toast copy on `mode`.
   */
  changeEmail(athleteId: number, newEmail: string): Observable<{ mode: AthleteEmailChangeMode }> {
    return this.http
      .post<{ data: { mode: AthleteEmailChangeMode } }>(`${this.base}/${athleteId}/email`, {
        email: newEmail,
      })
      .pipe(map((res) => res.data));
  }

  /**
   * Belt + stripe promotion history for the owner-facing timeline
   * (post-v2.9.0). Paginated 20/page, newest-first. Wire shape
   * mirrors `AthletePromotion` in docs/api/v1.yaml.
   */
  promotions(athleteId: number, page = 1): Observable<AthletePromotionPage> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<AthletePromotionPage>(`${this.base}/${athleteId}/promotions`, { params });
  }
}

export interface AthletePromotion {
  readonly id: number;
  readonly kind: 'belt' | 'stripe';
  readonly from_belt: Belt | null;
  readonly to_belt: Belt | null;
  readonly from_stripes: number | null;
  readonly to_stripes: number | null;
  /** Belt at the moment of the event — lets the SPA render context on stripe rows. */
  readonly belt_at_event: Belt | null;
  readonly recorded_at: string;
  /** Nullable to defend against hard-deleted User rows (rare; User soft-deletes only). */
  readonly recorded_by: {
    readonly id: number;
    readonly full_name: string;
  } | null;
}

export interface AthletePromotionPage {
  readonly data: readonly AthletePromotion[];
  readonly meta: {
    readonly current_page: number;
    readonly per_page: number;
    readonly total: number;
    readonly last_page: number;
  };
}

/**
 * State discriminator returned from `POST /athletes/{id}/email` (#476).
 * Mirrors the `mode` key on the server's response envelope.
 */
export type AthleteEmailChangeMode = 'direct' | 'invite_swap' | 'pending';
