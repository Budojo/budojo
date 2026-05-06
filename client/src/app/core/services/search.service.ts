import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { Athlete } from './athlete.service';
import { environment } from '../../../environments/environment';

interface SearchResponse {
  data: Athlete[];
}

/**
 * HTTP client for the global Cmd/Ctrl-K command palette (#426).
 *
 * Wraps `GET /api/v1/search?q=...` — server-side academy-scoped search,
 * capped at 20 results, no pagination envelope. Returns a flat
 * `Athlete[]` so callers can pipe straight into a list.
 *
 * The empty-query short-circuit lives here AND server-side: the SPA
 * never wants to issue a request with an empty query (debounce should
 * already drop it; this is the belt-and-suspenders layer), and the
 * server returns an empty array on the same input. Either layer alone
 * would be enough — having both means a refactor on either side stays
 * safe.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/search`;

  searchAthletes(query: string): Observable<Athlete[]> {
    const trimmed = query.trim();
    if (trimmed === '') {
      return of([]);
    }
    const params = new HttpParams().set('q', trimmed);
    return this.http.get<SearchResponse>(this.base, { params }).pipe(map((res) => res.data));
  }
}
