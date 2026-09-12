import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * What a syllabus topic is trained in (#1563). Three cases and not
 * `ClassKind`'s four: a topic is jiu-jitsu by definition, so there is no
 * "other" for it to be.
 */
export type TopicKind = 'gi' | 'nogi' | 'both';

export const TOPIC_KINDS: readonly TopicKind[] = ['both', 'gi', 'nogi'];

/**
 * One entry in the academy's programme (#1563) — a position when `parent_id`
 * is null ("Closed guard"), a technique under it otherwise ("Armbar").
 *
 * A position carries its techniques in `children`; a technique carries none,
 * so the client never reassembles the tree from a flat list.
 */
export interface SyllabusTopic {
  readonly id: number;
  readonly parent_id: number | null;
  readonly name: string;
  readonly kind: TopicKind;
  readonly in_season: boolean;
  readonly sort_order: number;
  readonly children?: readonly SyllabusTopic[];
}

export interface SyllabusTopicPayload {
  readonly name: string;
  readonly kind: TopicKind;
  readonly parent_id?: number | null;
  readonly in_season?: boolean;
}

export interface SyllabusTopicPatch {
  readonly name?: string;
  readonly kind?: TopicKind;
  readonly in_season?: boolean;
  readonly sort_order?: number;
}

@Injectable({ providedIn: 'root' })
export class SyllabusService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/academy/syllabus`;

  /** The tree: positions in order, each with its techniques in theirs. */
  list(): Observable<SyllabusTopic[]> {
    return this.http.get<{ data: SyllabusTopic[] }>(this.base).pipe(map((r) => r.data));
  }

  create(payload: SyllabusTopicPayload): Observable<SyllabusTopic> {
    return this.http.post<{ data: SyllabusTopic }>(this.base, payload).pipe(map((r) => r.data));
  }

  update(id: number, patch: SyllabusTopicPatch): Observable<SyllabusTopic> {
    return this.http
      .patch<{ data: SyllabusTopic }>(`${this.base}/${id}`, patch)
      .pipe(map((r) => r.data));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * "Start from the BJJ programme" — copies the shipped starter in. A 409
   * means the academy already has topics, which the caller never asks for:
   * the button is gone by then.
   */
  seed(): Observable<number> {
    return this.http
      .post<{ data: { written: number } }>(`${this.base}/seed`, {})
      .pipe(map((r) => r.data.written));
  }
}
