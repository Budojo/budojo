import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Onboarding step keys — mirrors `App\Support\OnboardingStep` on the
 * server. Order here is the SPA's display order in the "Getting
 * started" checklist on the dashboard home.
 *
 * Keep in lock-step with the server enum: the request validator there
 * uses the same set as a `Rule::in(...)` allowlist, and the
 * `onboarding.service.spec.ts` parity check fails when the two drift.
 */
export const ONBOARDING_STEPS = [
  'add_athlete',
  'log_attendance',
  'mark_payment',
  'upload_document',
  'view_stats',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

interface OnboardingState {
  readonly dismissed_at: string | null;
  readonly completed_steps: readonly OnboardingStep[];
  readonly available_steps: readonly OnboardingStep[];
}

interface ShowResponse {
  readonly data: OnboardingState;
}
interface StepResponse {
  readonly data: { readonly completed_steps: readonly OnboardingStep[] };
}
interface DismissResponse {
  readonly data: { readonly dismissed_at: string | null };
}

/**
 * Onboarding state surface (#424). Backs the first-run guided tour
 * overlay + the persistent "Getting started" checklist on the
 * dashboard home.
 *
 * Two-level state — `dismissed_at` permanently retires the tour
 * (irreversible from the SPA — re-enrolment would require a future
 * "show me the tour again" admin endpoint, out of scope today), and
 * `completedSteps` is the rolling list of ticked checklist items.
 *
 * The signals are exposed read-only via the `state` computed, so
 * dashboard components and the tour overlay can both subscribe
 * without holding a write reference.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/onboarding`;

  private readonly _dismissedAt = signal<string | null>(null);
  private readonly _completedSteps = signal<readonly OnboardingStep[]>([]);
  private readonly _loaded = signal<boolean>(false);

  readonly dismissedAt = this._dismissedAt.asReadonly();
  readonly completedSteps = this._completedSteps.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  /**
   * True when the tour overlay should render: the user has not
   * dismissed the tour AND has not yet completed every step. Once
   * any of the two conditions flips, the overlay disappears for
   * the rest of the session.
   */
  readonly tourActive = computed(() => {
    if (this._dismissedAt() !== null) {
      return false;
    }
    const completed = new Set<string>(this._completedSteps());
    return ONBOARDING_STEPS.some((s) => !completed.has(s));
  });

  /**
   * Same condition as `tourActive` for now — the checklist
   * disappears under the same rules. Kept as a separate computed
   * so a future "hide tour but keep checklist" toggle has a
   * single surface to flip.
   */
  readonly checklistVisible = this.tourActive;

  /** Number of steps the user has ticked off (0-5). */
  readonly progress = computed(() => this._completedSteps().length);

  load(): Observable<OnboardingState> {
    return this.http.get<ShowResponse>(this.base).pipe(
      tap((r) => {
        this._dismissedAt.set(r.data.dismissed_at);
        this._completedSteps.set(r.data.completed_steps);
        this._loaded.set(true);
      }),
      map((r) => r.data),
    );
  }

  completeStep(step: OnboardingStep): Observable<readonly OnboardingStep[]> {
    return this.http.post<StepResponse>(`${this.base}/steps`, { step }).pipe(
      tap((r) => this._completedSteps.set(r.data.completed_steps)),
      map((r) => r.data.completed_steps),
    );
  }

  dismiss(): Observable<string | null> {
    return this.http.post<DismissResponse>(`${this.base}/dismiss`, {}).pipe(
      tap((r) => this._dismissedAt.set(r.data.dismissed_at)),
      map((r) => r.data.dismissed_at),
    );
  }
}
