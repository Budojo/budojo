import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TrainingMode } from './academy.service';
import type { AthleteIdentity, AthleteStatus, Belt } from './athlete.service';

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

export interface AgeBand {
  /**
   * The division, from the academy's martial art (#1807): `mighty_mite` for
   * BJJ, `esordienti_b` for judo, `under_30` for taekwondo. An open string —
   * the federations change their classes — labelled through `ageBandKey()`.
   */
  readonly code: string;
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
  readonly kind: TrainingMode;
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
  readonly kind: TrainingMode;
}

export interface CoverageTaughtTopic extends CoverageTopic {
  readonly lessons: number;
  /**
   * Distinct athletes at one or more of those lessons (#1746) — three lessons
   * to the same four people reach four. A column, never part of the headline.
   */
  readonly reach: number;
  /** Distinct (athlete, lesson) presences across them. */
  readonly attendances: number;
  readonly last_taught_on: string;
  readonly state: CoverageState;
}

export interface SyllabusCoverage {
  readonly season: { readonly start: string; readonly end: string; readonly label: string };
  /** The kind filter in force, or null for everything. */
  readonly kind: TrainingMode | null;
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

/**
 * The season map (#1858): each position, week by week.
 *
 * `held` has at least one presence; `planned` has none and is dated today or
 * later; `unconfirmed` has none and its day has passed. Derived on every read,
 * never stored, split on the server's `today`.
 */
export type CalendarLessonState = 'held' | 'planned' | 'unconfirmed';

export interface CalendarCell {
  /** The Monday of the week. */
  readonly week: string;
  readonly held: number;
  readonly planned: number;
  readonly unconfirmed: number;
}

export interface CalendarPosition {
  readonly id: number;
  readonly name: string;
  readonly kind: TrainingMode;
  /** Sparse: only the weeks with a lesson on this position, oldest first. */
  readonly cells: readonly CalendarCell[];
}

export interface CalendarLesson {
  readonly id: number;
  readonly academy_class_id: number | null;
  readonly held_on: string;
  readonly name: string;
  readonly starts_at: string | null;
  readonly kind: TrainingMode;
  readonly state: CalendarLessonState;
  /** The positions this lesson counts for under the filter in force. */
  readonly position_ids: readonly number[];
  readonly topics: readonly {
    readonly id: number;
    readonly name: string;
    readonly parent_id: number | null;
  }[];
}

export interface SyllabusCalendar {
  readonly season: { readonly start: string; readonly end: string; readonly label: string };
  readonly kind: TrainingMode | null;
  /** The server's today — the day planned and unconfirmed were split on. */
  readonly today: string;
  /** The Monday of every week the season touches. */
  readonly weeks: readonly string[];
  readonly positions: readonly CalendarPosition[];
  /** The season's tagged lessons, oldest first. */
  readonly lessons: readonly CalendarLesson[];
}

/**
 * Where one athlete stands against a technique's lessons (#1745). `unplaced`
 * is at none of them by the record, but trained on one of those days with no
 * lesson named (#1590): could have been there, so never read as an absence.
 */
export type ExposureState = 'seen' | 'thin' | 'never' | 'unplaced';

/** A held lesson that named the technique, with how many were in the room. */
export interface ExposureLesson {
  readonly id: number;
  readonly held_on: string;
  /** The class name, as the lesson snapshotted it. */
  readonly name: string;
  readonly kind: TrainingMode;
  readonly starts_at: string | null;
  readonly headcount: number;
}

export interface ExposureAthlete extends AthleteIdentity {
  readonly status: AthleteStatus;
  readonly joined_at: string;
  /** How many of the lessons they were at. */
  readonly exposures: number;
  readonly last_seen_on: string | null;
  readonly state: ExposureState;
}

/**
 * Who has seen one technique this season (#1745) — the coverage report's
 * row, opened. A technique nobody taught comes back with no lessons and no
 * athletes: the academy's gap is never filed under people.
 */
export interface TopicExposure {
  readonly topic: {
    readonly id: number;
    readonly name: string;
    readonly parent_name: string | null;
    readonly kind: TrainingMode;
    readonly in_season: boolean;
  };
  readonly season: { readonly start: string; readonly end: string; readonly label: string };
  /** Held lessons that named it, oldest first. */
  readonly lessons: readonly ExposureLesson[];
  /** Register order, active first — never ranked. */
  readonly athletes: readonly ExposureAthlete[];
  readonly totals: {
    readonly lessons: number;
    readonly seen: number;
    readonly thin: number;
    readonly never: number;
    readonly unplaced: number;
  };
}

/** One thing this athlete has not seen yet (#1567). */
export interface MissedTopic {
  readonly id: number;
  readonly name: string;
  readonly parent_name: string | null;
  readonly kind: TrainingMode;
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
    /** Attended at least once — the headline's numerator since #1710. */
    readonly attended: number;
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
  /**
   * The programme of their own belt (#1861): what is expected up to it, how
   * much of that the academy taught while they were here, how much they were
   * at. Null while nothing in the programme names a belt.
   */
  readonly grade: {
    readonly belt: Belt;
    readonly items: number;
    readonly taught_by_academy: number;
    readonly attended: number;
  } | null;
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
    kind: TrainingMode | null = null,
  ): Observable<SyllabusCoverage> {
    let params = new HttpParams().set('seasons_back', seasonsBack);
    if (kind !== null) params = params.set('kind', kind);

    return this.http
      .get<{ data: SyllabusCoverage }>(`${environment.apiBase}/api/v1/stats/syllabus/coverage`, {
        params,
      })
      .pipe(map((r) => r.data));
  }

  /**
   * The season map (#1858) — the same season and filter as
   * `syllabusCoverage()`, because the map is drawn beside its fractions.
   */
  syllabusCalendar(
    seasonsBack = 0,
    kind: TrainingMode | null = null,
  ): Observable<SyllabusCalendar> {
    let params = new HttpParams().set('seasons_back', seasonsBack);
    if (kind !== null) params = params.set('kind', kind);

    return this.http
      .get<{ data: SyllabusCalendar }>(`${environment.apiBase}/api/v1/stats/syllabus/calendar`, {
        params,
      })
      .pipe(map((r) => r.data));
  }

  /** Who has seen one technique — a row of the coverage report, opened (#1745). */
  topicExposure(topicId: number, seasonsBack = 0): Observable<TopicExposure> {
    const params = new HttpParams().set('seasons_back', seasonsBack);

    return this.http
      .get<{
        data: TopicExposure;
      }>(`${environment.apiBase}/api/v1/stats/syllabus/topics/${topicId}`, { params })
      .pipe(map((r) => r.data));
  }
}
