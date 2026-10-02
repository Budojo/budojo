import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../services/auth.service';

/** An academy as the door names it (#2079): its active athletes, and how many hold each belt. */
export interface AcademySummary {
  name: string;
  athletes: number;
  belts: Record<string, number>;
}

export interface BackupInspection {
  backup: { taken_at: string; app_version: string; academy: AcademySummary | null };
  /** This device's own academy; null when it holds none. */
  here: AcademySummary | null;
}

/**
 * What only this app's page may ask of its own server on the phone (#2079):
 * the owner's session with no password, and bringing a PC backup in. Every
 * call carries the secret the shell made at launch (`X-Budojo-Shell`); every
 * other app on the phone reaches `127.0.0.1` too, and none of them has it.
 *
 * A backup goes as a `File`: Capacitor's native HTTP sends a `File` body as
 * its bytes, where a typed array would be decoded as text and damaged.
 */
@Injectable({ providedIn: 'root' })
export class DeviceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/device`;

  session(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/session`, {}, { headers: this.headers() });
  }

  inspect(archive: File): Observable<{ data: BackupInspection }> {
    return this.http.post<{ data: BackupInspection }>(`${this.base}/backup/inspect`, archive, {
      headers: this.headers(),
    });
  }

  restore(archive: File): Observable<void> {
    return this.http.post<void>(`${this.base}/backup/restore`, archive, {
      headers: this.headers(),
    });
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Budojo-Shell': window.__BUDOJO_MOBILE__?.shellSecret ?? '' });
  }
}
