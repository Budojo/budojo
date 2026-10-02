import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { buffer } from './bytes';
import { ServerFile, SyncFilesApi } from './files';

/** `SyncFilesApi` over this device's own server (`/api/v1/sync/files`, #2030). */
@Injectable({ providedIn: 'root' })
export class HttpSyncFiles implements SyncFilesApi {
  private readonly http = inject(HttpClient);

  private url(path = ''): string {
    return `${environment.apiBase}/api/v1/sync/files${path}`;
  }

  list(): Promise<ServerFile[]> {
    return firstValueFrom(
      this.http.get<{ data: ServerFile[] }>(this.url()).pipe(map((response) => response.data)),
    );
  }

  read(sha256: string): Promise<Uint8Array> {
    return firstValueFrom(
      this.http
        .get(this.url(`/${sha256}`), { responseType: 'arraybuffer' })
        .pipe(map((body) => new Uint8Array(body))),
    );
  }

  async write(sha256: string, bytes: Uint8Array): Promise<void> {
    await firstValueFrom(
      this.http.put(this.url(`/${sha256}`), buffer(bytes).buffer, {
        headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' }),
      }),
    );
  }
}
