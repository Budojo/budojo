import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClassKind } from './academy-class.service';
import { TopicKind } from './syllabus.service';

/**
 * A syllabus topic as a lesson names it (#1564).
 *
 * `parent_name` rides along because "Armbar" on its own is ambiguous by
 * design — an armbar from mount and one from closed guard are different
 * lessons, which is why the tree has two levels. `deleted` says the topic has
 * since left the programme: the lesson still names it, and it is no longer
 * offered in the picker.
 */
export interface LessonTopic {
  readonly id: number;
  readonly name: string;
  readonly kind: TopicKind;
  readonly parent_id: number | null;
  readonly parent_name: string | null;
  readonly deleted: boolean;
}

/**
 * One occurrence of a class, with what it covers (#1564).
 *
 * `held` is derived on the server and never stored: a lesson is held when
 * somebody was checked into it. That is what keeps a plan from reporting
 * itself as taught.
 */
export interface Lesson {
  readonly id: number;
  readonly academy_class_id: number | null;
  readonly held_on: string;
  readonly name: string;
  readonly starts_at: string | null;
  readonly kind: ClassKind;
  readonly notes: string | null;
  readonly held: boolean;
  readonly topics: readonly LessonTopic[];
}

/**
 * Why a topic is being suggested (#1566). Three rules, in order, and the UI
 * says which one fired — a suggestion whose reasoning is invisible gets
 * ignored, and one that says why gets trusted or overruled on the merits.
 */
export type SuggestionReason = 'never' | 'thin' | 'stale';

/** One answer to "what should I teach tonight?" (#1566). */
export interface LessonSuggestion {
  readonly id: number;
  readonly name: string;
  readonly parent_name: string | null;
  readonly kind: TopicKind;
  readonly reason: SuggestionReason;
  /** `null` exactly when the reason is `never`. */
  readonly last_taught_on: string | null;
}

@Injectable({ providedIn: 'root' })
export class LessonService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/lessons`;

  /**
   * The lesson in a slot, or `null` when nobody has touched it. Reading never
   * creates it — an empty slot is not a claim that anything happened.
   */
  get(academyClassId: number, heldOn: string): Observable<Lesson | null> {
    const params = new HttpParams().set('academy_class_id', academyClassId).set('held_on', heldOn);

    return this.http.get<{ data: Lesson | null }>(this.base, { params }).pipe(map((r) => r.data));
  }

  /** Sets the whole list; the server syncs, so a repeat is a no-op. */
  setTopics(academyClassId: number, heldOn: string, topicIds: number[]): Observable<Lesson> {
    return this.http
      .put<{ data: Lesson }>(`${this.base}/topics`, {
        academy_class_id: academyClassId,
        held_on: heldOn,
        topic_ids: topicIds,
      })
      .pipe(map((r) => r.data));
  }

  setNotes(academyClassId: number, heldOn: string, notes: string | null): Observable<Lesson> {
    return this.http
      .put<{ data: Lesson }>(`${this.base}/notes`, {
        academy_class_id: academyClassId,
        held_on: heldOn,
        notes,
      })
      .pipe(map((r) => r.data));
  }

  /**
   * What the academy has been teaching lately, most recent first — the
   * picker's second group, and the one that does most of the work: teaching
   * runs in blocks, so last Monday's topic is very often tonight's.
   */
  recentTopics(): Observable<LessonTopic[]> {
    return this.http
      .get<{ data: LessonTopic[] }>(`${this.base}/recent-topics`)
      .pipe(map((r) => r.data));
  }

  /**
   * What to teach next in this class (#1566).
   *
   * The coverage report answers this when you sit down to think about the
   * season; this answers it on the mat, ten minutes before class. Same data,
   * and the difference is whether anyone ever asks.
   *
   * Addressed by class alone: the ranking reads the season so far, so it is
   * the same answer for next Wednesday as for the one after.
   */
  suggestions(academyClassId: number, limit?: number): Observable<LessonSuggestion[]> {
    let params = new HttpParams().set('academy_class_id', academyClassId);
    if (limit !== undefined) params = params.set('limit', limit);

    return this.http
      .get<{ data: LessonSuggestion[] }>(`${this.base}/suggestions`, { params })
      .pipe(map((r) => r.data));
  }
}
