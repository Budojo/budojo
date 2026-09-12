import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TopicKind } from './syllabus.service';

export interface DailyAttendancePoint {
  readonly date: string; // 'YYYY-MM-DD'
  readonly count: number;
}

export interface MonthlyPaymentsBucket {
  readonly month: string; // 'YYYY-MM'
  readonly currency: string;
  readonly amount_cents: number;
  /**
   * Past the current month (#1553) — already collected, not yet earned.
   *
   * The window reaches forward to the last month a fee has been paid for, so
   * a quarterly bought this month puts two buckets to the right of today.
   * Drawn lighter, because a bar for November in September is a different
   * kind of fact from the ten bars to its left.
   */
  readonly future: boolean;
}

export type AgeBandCode =
  | 'mighty_mite'
  | 'pee_wee'
  | 'junior'
  | 'teen'
  | 'juvenile'
  | 'adult'
  | 'master_1'
  | 'master_2'
  | 'master_3'
  | 'master_4'
  | 'master_5'
  | 'master_6'
  | 'master_7';

export interface AgeBand {
  readonly code: AgeBandCode;
  readonly category: 'kids' | 'adults';
  readonly min: number;
  readonly max: number | null;
  readonly count: number;
}

export interface AgeBandsPayload {
  readonly bands: readonly AgeBand[];
  readonly total: number;
  readonly missing_dob: number;
}

/**
 * Syllabus coverage across a season (#1565) — what the academy said it would
 * teach, against what it actually did.
 *
 * `covered` takes **two** held lessons: teaching a thing once in September
 * and calling it done is what the report exists to prevent, so one is `thin`.
 * Positions are not in the denominator — a heading is not a thing to teach —
 * but a position tagged on its own is reported per row as `worked`.
 */
export type CoverageState = 'covered' | 'thin' | 'missing';

export interface CoveragePosition {
  readonly id: number;
  readonly name: string;
  readonly kind: TopicKind;
  readonly in_scope: number;
  readonly covered: number;
  readonly thin: number;
  readonly missing: number;
  /** Held lessons that tagged the position itself — "we worked half guard". */
  readonly worked: number;
}

export interface CoverageTopic {
  readonly id: number;
  readonly name: string;
  readonly parent_name: string | null;
  readonly kind: TopicKind;
}

export interface CoverageTaughtTopic extends CoverageTopic {
  readonly lessons: number;
  readonly last_taught_on: string;
  readonly state: CoverageState;
}

export interface SyllabusCoverage {
  readonly season: { readonly start: string; readonly end: string; readonly label: string };
  /** The kind filter in force, or null for everything. */
  readonly kind: TopicKind | null;
  readonly totals: {
    readonly in_scope: number;
    readonly covered: number;
    readonly thin: number;
    readonly missing: number;
    readonly percentage: number;
  };
  readonly positions: readonly CoveragePosition[];
  readonly missing: readonly CoverageTopic[];
  /** Everything taught at least once, most recent first. */
  readonly taught: readonly CoverageTaughtTopic[];
  /** Cumulative covered topics, one point per week up to today. */
  readonly timeline: readonly { readonly on: string; readonly covered: number }[];
}

/** One thing this athlete has not seen yet (#1567). */
export interface MissedTopic {
  readonly id: number;
  readonly name: string;
  readonly parent_name: string | null;
  readonly kind: TopicKind;
  /** How many evenings it was on the mat while they were on the roster. */
  readonly taught_times: number;
}

/** One thing they have seen, with the last time they saw it (#1567). */
export interface SeenTopic {
  readonly id: number;
  readonly name: string;
  readonly parent_name: string | null;
  readonly lessons: number;
  readonly last_seen_on: string;
}

/**
 * What one athlete has seen of the programme (#1567).
 *
 * Four states, not the academy view's three. `not_taught_yet` sits outside the
 * fraction on purpose: a topic the academy has not covered is not this
 * person's gap, and counting it against them would turn a training log into a
 * scoreboard.
 */
export interface AthleteSyllabusCoverage {
  readonly season: { readonly start: string; readonly end: string; readonly label: string };
  /** Nothing before this date is counted — nobody misses what predates them. */
  readonly joined_on: string;
  readonly totals: {
    /** The denominator: what the academy taught while they were here. */
    readonly taught_by_academy: number;
    readonly seen: number;
    readonly thin: number;
    readonly missed: number;
    readonly percentage: number;
    /** Context about the programme, deliberately outside the fraction. */
    readonly not_taught_yet: number;
  };
  readonly missed: readonly MissedTopic[];
  readonly seen_lately: readonly SeenTopic[];
  /** Presences that name no lesson, and so can be attributed to no topic. */
  readonly unattributed_presences: number;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  /**
   * What this athlete has seen of the programme, and what they missed (#1567).
   *
   * Lives beside their attendance rather than under the owner-only stats
   * group: the reader is the instructor planning their next private lesson.
   */
  athleteSyllabusCoverage(athleteId: number, seasonsBack = 0): Observable<AthleteSyllabusCoverage> {
    const params = new HttpParams().set('seasons_back', seasonsBack);

    return this.http
      .get<{
        data: AthleteSyllabusCoverage;
      }>(`${environment.apiBase}/api/v1/athletes/${athleteId}/syllabus-coverage`, { params })
      .pipe(map((r) => r.data));
  }

  attendanceDaily(months: 3 | 6 | 12 = 3): Observable<readonly DailyAttendancePoint[]> {
    return this.http
      .get<{
        data: DailyAttendancePoint[];
      }>(`${environment.apiBase}/api/v1/stats/attendance/daily?months=${months}`)
      .pipe(map((r) => r.data));
  }

  paymentsMonthly(months = 12): Observable<readonly MonthlyPaymentsBucket[]> {
    return this.http
      .get<{
        data: MonthlyPaymentsBucket[];
      }>(`${environment.apiBase}/api/v1/stats/payments/monthly?months=${months}`)
      .pipe(map((r) => r.data));
  }

  ageBands(): Observable<AgeBandsPayload> {
    return this.http
      .get<{ data: AgeBandsPayload }>(`${environment.apiBase}/api/v1/stats/athletes/age-bands`)
      .pipe(map((r) => r.data));
  }

  /**
   * The coverage report for a season. `seasonsBack` counts backwards from the
   * current one — the boundary is the server's to resolve (#1484), and a
   * client computing it would be a second implementation of the same
   * off-by-one.
   */
  syllabusCoverage(
    seasonsBack = 0,
    kind: 'gi' | 'nogi' | null = null,
  ): Observable<SyllabusCoverage> {
    let params = new HttpParams().set('seasons_back', seasonsBack);
    if (kind !== null) params = params.set('kind', kind);

    return this.http
      .get<{ data: SyllabusCoverage }>(`${environment.apiBase}/api/v1/stats/syllabus/coverage`, {
        params,
      })
      .pipe(map((r) => r.data));
  }
}
