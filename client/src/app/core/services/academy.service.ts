import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';

export interface Academy {
  id: number;
  name: string;
  slug: string;
  address: string | null;
}

export interface CreateAcademyPayload {
  name: string;
  address?: string;
}

interface AcademyResponse {
  data: Academy;
}

@Injectable({ providedIn: 'root' })
export class AcademyService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/academy';

  readonly academy = signal<Academy | null>(null);

  get(): Observable<Academy> {
    return this.http.get<AcademyResponse>(this.base).pipe(
      tap((res) => this.academy.set(res.data)),
      map((res) => res.data),
    );
  }

  create(payload: CreateAcademyPayload): Observable<Academy> {
    return this.http.post<AcademyResponse>(this.base, payload).pipe(
      tap((res) => this.academy.set(res.data)),
      map((res) => res.data),
    );
  }
}
