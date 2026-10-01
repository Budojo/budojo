import { buffer } from './bytes';
import { assertLayoutPath, Listing, RemoteError, RemoteFolder, SyncRemote } from './remote';

/**
 * The sync folder on Google Drive, reached from the page (PRD § 5.3, § 5.6). On
 * the phone the page's own `fetch` makes the calls, with the token
 * `DriveAuthPlugin` hands out. `drive.file` lets this client see the folder the
 * PC's client made (#2028).
 *
 * ```
 * Budojo/            the folder the PC creates for its backups (#1301)
 *   sync/
 *     keys.bjs
 *     versions/  files/  devices/
 * ```
 */

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT = 'Budojo';
const SYNC = 'sync';

/** The WebView's own fetch: Capacitor keeps it under this name when it patches the global one. */
function webFetch(): Fetcher {
  const original = (globalThis as { CapacitorWebFetch?: Fetcher }).CapacitorWebFetch;
  return (input, init) => (original ?? fetch)(input, init);
}

export class DriveRemote implements SyncRemote {
  /** Folder ids by their path in the tree above: `Budojo`, `Budojo/sync`, `Budojo/sync/versions`. */
  private readonly folders = new Map<string, string>();

  /** Drive's clock at its latest answer: the `Date` header, which every Google API response carries. */
  private lastNow = Number.NaN;

  constructor(
    private readonly token: () => Promise<string>,
    private readonly fetcher: Fetcher = webFetch(),
  ) {}

  async list(folder: RemoteFolder): Promise<Listing> {
    const parent = await this.folder([ROOT, SYNC, folder], false);
    if (parent === null) {
      return { files: [], now: this.lastNow };
    }
    const files = (await this.children(parent)).map((file) => ({
      path: `${folder}/${file.name}`,
      size: Number(file.size ?? 0),
      created: Date.parse(file.createdTime),
    }));
    return { files, now: this.lastNow };
  }

  async read(path: string): Promise<Uint8Array | null> {
    const found = await this.find(path);
    if (found === null) {
      return null;
    }
    const response = await this.call(`${API}/${found.id}?alt=media`, {}, true);
    if (response === null) {
      return null;
    }
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      // The headers arrived and the body did not: the gym's connection, mid-download.
      throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
    }
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    assertLayoutPath(path);
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const parent = (await this.folder(this.chain(path), true)) as string;
    const existing = await this.child(parent, name);

    // Resumable, as the PC's backups go (#1301): a version is megabytes, and
    // the gym's connection is whatever it is.
    const session = await this.call(
      existing === null
        ? `${UPLOAD}?uploadType=resumable&fields=id`
        : `${UPLOAD}/${existing}?uploadType=resumable&fields=id`,
      {
        method: existing === null ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'application/octet-stream',
          'X-Upload-Content-Length': String(bytes.length),
        },
        body: JSON.stringify(existing === null ? { name, parents: [parent] } : {}),
      },
    );
    const location = session?.headers.get('location');
    if (location === null || location === undefined) {
      throw new RemoteError('unavailable', `no upload session for ${path}`);
    }
    await this.call(location, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer(bytes),
    });
  }

  async remove(path: string): Promise<void> {
    const found = await this.find(path);
    if (found !== null) {
      await this.call(`${API}/${found.id}`, { method: 'DELETE' }, true);
    }
  }

  private chain(path: string): string[] {
    const parts = path.split('/');
    return [ROOT, SYNC, ...parts.slice(0, -1)];
  }

  private async find(path: string): Promise<{ id: string } | null> {
    assertLayoutPath(path);
    const parent = await this.folder(this.chain(path), false);
    if (parent === null) {
      return null;
    }
    const id = await this.child(parent, path.split('/').pop() as string);
    return id === null ? null : { id };
  }

  /** Walks the chain from `Budojo` down, making what is missing only when `create`. */
  private async folder(chain: string[], create: boolean): Promise<string | null> {
    let parent: string | null = null;
    for (let depth = 1; depth <= chain.length; depth++) {
      const key = chain.slice(0, depth).join('/');
      let id = this.folders.get(key) ?? null;
      if (id === null) {
        id = await this.findFolder(chain[depth - 1], parent);
        if (id === null) {
          if (!create) {
            return null;
          }
          await this.createFolder(chain[depth - 1], parent);
          // Look again rather than trust the folder just made: if another
          // device made one at the same moment, both settle on the older, and
          // the newer stays empty.
          id = await this.findFolder(chain[depth - 1], parent);
          if (id === null) {
            throw new RemoteError('unavailable', `the folder ${key} vanished as it was made`);
          }
        }
        this.folders.set(key, id);
      }
      parent = id;
    }
    return parent;
  }

  private async findFolder(name: string, parent: string | null): Promise<string | null> {
    const query = [
      `name='${name}'`,
      `mimeType='${FOLDER_MIME}'`,
      'trashed=false',
      ...(parent === null ? [] : [`'${parent}' in parents`]),
    ].join(' and ');
    // The oldest wins, on every device and every look (`folder` looks again after creating).
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id)',
      orderBy: 'createdTime',
      pageSize: '1',
    });
    const body = await this.json<{ files?: { id: string }[] }>(`${API}?${params.toString()}`);
    return body.files?.[0]?.id ?? null;
  }

  private async createFolder(name: string, parent: string | null): Promise<void> {
    await this.call(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parent === null ? {} : { parents: [parent] }),
      }),
    });
  }

  private async child(parent: string, name: string): Promise<string | null> {
    const params = new URLSearchParams({
      q: `name='${name}' and '${parent}' in parents and trashed=false`,
      fields: 'files(id)',
      pageSize: '1',
    });
    const body = await this.json<{ files?: { id: string }[] }>(`${API}?${params.toString()}`);
    return body.files?.[0]?.id ?? null;
  }

  private async children(parent: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${parent}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,size,createdTime)',
        pageSize: '1000',
      });
      if (pageToken !== undefined) {
        params.set('pageToken', pageToken);
      }
      const page = await this.json<{ nextPageToken?: string; files?: DriveFile[] }>(
        `${API}?${params.toString()}`,
      );
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return files;
  }

  /** A call whose answer is JSON. A body cut off halfway is the network's fault: offline. */
  private async json<T>(url: string): Promise<T> {
    const response = (await this.call(url)) as Response;
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
    }
  }

  /** One authorised call. With `notFoundIsNull`, a 404 answers null instead of throwing. */
  private async call(
    url: string,
    init: RequestInit = {},
    notFoundIsNull = false,
  ): Promise<Response | null> {
    // Outside the try: a token Google would not give is not "offline", and the
    // provider's own error (consent needed) must reach the engine as it is.
    const token = await this.token();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
    }
    const date = Date.parse(response.headers?.get('date') ?? '');
    if (!Number.isNaN(date)) {
      this.lastNow = date;
    }
    if (response.status === 404 && notFoundIsNull) {
      return null;
    }
    if (response.status === 401) {
      throw new RemoteError('unauthorized', 'Google refused the token');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new RemoteError(
        'unavailable',
        `HTTP ${response.status} ${detail.slice(0, 200)}`.trim(),
      );
    }
    return response;
  }
}
