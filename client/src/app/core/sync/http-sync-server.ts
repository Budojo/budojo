import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { binaryBody } from './bytes';
import { SyncServer } from './engine';
import { HttpSyncFiles } from './http-sync-files';
import { ConflictDecision, SyncConflict } from './conflicts';
import { JournalEntry } from './journal';

/**
 * `SyncServer` over this device's own server (`/api/v1/sync`, #2030, #2031):
 * the same on the phone and the PC, since both serve the same API. Owner-only,
 * like the routes.
 */
@Injectable({ providedIn: 'root' })
export class HttpSyncServer implements SyncServer {
  private readonly http = inject(HttpClient);
  readonly files = inject(HttpSyncFiles);

  private url(path: string): string {
    return `${environment.apiBase}/api/v1${path}`;
  }

  async exportDatabase(): Promise<{ database: Uint8Array; schema: string }> {
    const response = await firstValueFrom(
      this.http.get(this.url('/sync/export'), { responseType: 'arraybuffer', observe: 'response' }),
    );
    const schema = response.headers.get('X-Budojo-Schema');
    if (response.body === null || schema === null) {
      throw new Error('the server exported no database, or did not say its schema');
    }
    return { database: new Uint8Array(response.body), schema };
  }

  async stage(database: Uint8Array, options?: { rebase: boolean }): Promise<void> {
    await firstValueFrom(
      this.http.put(
        this.url(options?.rebase ? '/sync/stage?rebase=1' : '/sync/stage'),
        binaryBody(database),
        { headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' }) },
      ),
    );
  }

  /** `GET /sync/conflicts`: the writes a rebase set aside that wait for the owner (#2038). */
  conflicts(): Promise<SyncConflict[]> {
    return firstValueFrom(
      this.http
        .get<{ data: SyncConflict[] }>(this.url('/sync/conflicts'))
        .pipe(map((response) => response.data)),
    );
  }

  /** `POST /sync/conflicts/{entry}/decision`: the owner's answer, journaled like any write. */
  async decide(entry: string, decision: ConflictDecision): Promise<void> {
    await firstValueFrom(
      this.http.post(this.url(`/sync/conflicts/${entry}/decision`), { decision }),
    );
  }

  /**
   * «Tieni la mia»: the set-aside write made true here and the answer, in one
   * transaction on the server, journaled like any write of the owner's.
   */
  async keepMine(entry: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url(`/sync/conflicts/${entry}/keep-mine`), null));
  }

  journal(): Promise<JournalEntry[]> {
    return firstValueFrom(
      this.http
        .get<{ data: JournalEntry[] }>(this.url('/sync/journal'))
        .pipe(map((response) => response.data)),
    );
  }

  async clearJournal(through: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url('/sync/journal'), { params: { through } }));
  }

  holds(): Promise<Record<string, string>> {
    return firstValueFrom(
      this.http
        .get<{ data: Record<string, string> }>(this.url('/sync/holds'))
        .pipe(map((response) => response.data)),
    );
  }

  async holdsAcademy(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(this.url('/academy')));
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        return false;
      }
      throw error;
    }
  }
}
