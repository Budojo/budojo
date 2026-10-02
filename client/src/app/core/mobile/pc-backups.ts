import { RemoteError } from '../sync/remote';

/**
 * The backups the PC puts on Google Drive (#1301), as the phone's door finds
 * them (#2079): `budojo-backup-YYYYMMDD-HHMMSS.zip` in the `Budojo` folder the
 * PC's own client created. `drive.file` lets the phone's client read it, since
 * per-file access belongs to the Cloud project (#2028).
 *
 * The calls go through the WebView's own `fetch`, as `DriveRemote`'s do: a GET
 * through Capacitor's proxy hands the bytes back as they came.
 */

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface PcBackup {
  id: string;
  name: string;
}

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT = 'Budojo';
/** The desktop's archive name (`desktop/src/backup.ts`): sortable, one per second. */
const ARCHIVE = /^budojo-backup-\d{8}-\d{6}\.zip$/;

function webFetch(): Fetcher {
  const original = (globalThis as { CapacitorWebFetch?: Fetcher }).CapacitorWebFetch;
  return (input, init) => (original ?? fetch)(input, init);
}

export class PcBackups {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly fetcher: Fetcher = webFetch(),
  ) {}

  /** The Google account the token belongs to, for the door to say whose Drive it looked in. */
  async account(): Promise<string | null> {
    const about = await this.json<{ user?: { emailAddress?: string } }>(
      `${API}/about?fields=user(emailAddress)`,
    );
    return about.user?.emailAddress ?? null;
  }

  /**
   * The PC's backups, newest first. Empty when the PC has not connected Drive
   * yet: its folder does not exist, or holds none.
   */
  async newestFirst(): Promise<PcBackup[]> {
    const folder = await this.folder();
    if (folder === null) {
      return [];
    }
    const params = new URLSearchParams({
      q: `'${folder}' in parents and name contains 'budojo-backup-' and trashed=false`,
      fields: 'files(id,name)',
      pageSize: '1000',
    });
    const listing = await this.json<{ files?: PcBackup[] }>(`${API}/files?${params.toString()}`);
    return (listing.files ?? [])
      .filter((file) => ARCHIVE.test(file.name))
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  async download(backup: PcBackup): Promise<Uint8Array> {
    const response = await this.call(`${API}/files/${backup.id}?alt=media`);
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      // The headers arrived and the body did not: the connection, mid-download.
      throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
    }
  }

  /** The oldest `Budojo` folder, as `DriveRemote` settles on it. */
  private async folder(): Promise<string | null> {
    const params = new URLSearchParams({
      q: `name='${ROOT}' and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'files(id)',
      orderBy: 'createdTime',
      pageSize: '1',
    });
    const found = await this.json<{ files?: { id: string }[] }>(
      `${API}/files?${params.toString()}`,
    );
    return found.files?.[0]?.id ?? null;
  }

  private async json<T>(url: string): Promise<T> {
    const response = await this.call(url);
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
    }
  }

  private async call(url: string): Promise<Response> {
    // Outside the try: a token Google would not give is not "offline".
    const token = await this.token();
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
    }
    if (response.status === 401) {
      throw new RemoteError('unauthorized', 'Google refused the token');
    }
    if (!response.ok) {
      throw new RemoteError('unavailable', `HTTP ${response.status}`);
    }
    return response;
  }
}
