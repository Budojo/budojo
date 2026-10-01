/**
 * The #2028 spike: Google Drive from the phone, against what the desktop wrote.
 *
 * The question is whether `drive.file` ("files this app created or opened")
 * means the Google Cloud project or the single OAuth client. The desktop and
 * the phone are two clients of one project. If the phone sees the Budojo
 * folder the PC created, and the PC sees the file the phone puts in it, the
 * phone and the PC can share Drive the way the sync (PRD § 5.2) needs.
 *
 * The native half is `DriveAuthPlugin` (mobile/android): it only hands out
 * access tokens. The Drive calls are made here, through the WebView's own
 * `fetch`: one path for every call, at the price of depending on Google's CORS.
 * Capacitor's patched `fetch` would split them, GETs through its local proxy
 * and the rest through native HTTP, which reads a non-JSON answer as text
 * (mobile/CLAUDE.md § Google Drive).
 */

export interface DriveAuthorization {
  accessToken: string;
  grantedScopes: string[];
  /** True when Google's consent screen was shown for this token. */
  consented: boolean;
  ms: number;
}

export interface DriveAuthPlugin {
  status(): Promise<{ playServices: string }>;
  authorize(options: { interactive: boolean }): Promise<DriveAuthorization>;
  clearToken(options: { token: string }): Promise<void>;
}

/** What the probe found, one line on the screen each. */
export interface DriveProbe {
  account: string | null;
  /** The Budojo folder the PC creates on its first backup. The phone never creates it. */
  folder: 'found' | 'missing';
  /** The PC's archives in it, newest first. */
  pcArchives: { name: string; size: number }[];
  /** The newest archive's first bytes, read from the phone. */
  newestRead: 'zip' | 'not-zip' | null;
  phoneFile: 'written' | 'still-there' | 'gone-and-rewritten' | null;
  /** The phone read its own file back, byte for byte. */
  readBack: boolean | null;
}

/**
 * The file the phone writes into the PC's folder. It is named like a backup
 * archive because the PC lists nothing else (`desktop/src/backup.ts`), and
 * dated 1 Jan 2000 so that the PC's retention, if it acts on it, can only
 * ever drop this file and never a real archive. Either way the PC has seen it:
 * it shows in the PC's list, or the PC deletes it. Restoring it is refused,
 * because it holds no database.
 */
export const PHONE_PROBE_NAME = 'budojo-backup-20000101-000000.zip';
export const PHONE_PROBE_TEXT =
  'Budojo: prova di Google Drive dal telefono (#2028). Non è un backup e si può cancellare.\n';

/** The desktop's archive names (`desktop/src/backup.ts`). */
const ARCHIVE_PATTERN = /^budojo-backup-\d{8}-\d{6}\.zip$/;
const FOLDER_NAME = 'Budojo';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** A Drive call that failed, with its status, so a 401 can be retried with a fresh token. */
export class DriveHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The plugin when the page runs inside the Android app; null in a browser. */
export function driveAuthPlugin(): DriveAuthPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (capacitor?.Plugins?.['DriveAuth'] as DriveAuthPlugin | undefined) ?? null;
}

/** The WebView's own fetch, which Capacitor keeps under this name when it patches the global one. */
function webFetch(): Fetcher {
  const original = (globalThis as { CapacitorWebFetch?: Fetcher }).CapacitorWebFetch;
  return (input, init) => (original ?? fetch)(input, init);
}

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Account, folder, the PC's archives, the newest one's first bytes, then the
 * phone's own file: written if absent, and read back. `previouslyWritten`
 * says whether an earlier run on this phone wrote it, which is how a file
 * that has since gone is told apart from one never written.
 */
export async function runDriveProbe(
  token: string,
  memory: { previouslyWritten: boolean },
  fetcher: Fetcher = webFetch(),
): Promise<DriveProbe> {
  const auth = { Authorization: `Bearer ${token}` };
  const call = async (what: string, url: string, init: RequestInit = {}): Promise<Response> => {
    const response = await fetcher(url, { ...init, headers: { ...auth, ...init.headers } });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new DriveHttpError(
        response.status,
        `${what}: HTTP ${response.status} ${detail.slice(0, 300)}`.trim(),
      );
    }
    return response;
  };

  const about = (await (await call('account', `${API}/about?fields=user/emailAddress`)).json()) as {
    user?: { emailAddress?: string };
  };
  const account = about.user?.emailAddress ?? null;

  const folderQuery = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const folders = (await (
    await call(
      'folder',
      `${API}/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
    )
  ).json()) as { files?: { id: string }[] };
  const folderId = folders.files?.[0]?.id;
  if (folderId === undefined) {
    return {
      account,
      folder: 'missing',
      pcArchives: [],
      newestRead: null,
      phoneFile: null,
      readBack: null,
    };
  }

  const files: { id: string; name: string; size: number }[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,size)',
      pageSize: '100',
    });
    if (pageToken !== undefined) {
      params.set('pageToken', pageToken);
    }
    const page = (await (await call('list', `${API}/files?${params.toString()}`)).json()) as {
      nextPageToken?: string;
      files?: { id: string; name: string; size?: string }[];
    };
    for (const file of page.files ?? []) {
      files.push({ id: file.id, name: file.name, size: Number(file.size ?? 0) });
    }
    pageToken = page.nextPageToken;
  } while (pageToken !== undefined);

  // Names sort by time, by construction, as on the PC.
  const pcArchives = files
    .filter((file) => ARCHIVE_PATTERN.test(file.name) && file.name !== PHONE_PROBE_NAME)
    .sort((a, b) => b.name.localeCompare(a.name));

  let newestRead: DriveProbe['newestRead'] = null;
  const newest = pcArchives[0];
  if (newest !== undefined) {
    const head = await call('read', `${API}/files/${newest.id}?alt=media`, {
      headers: { Range: 'bytes=0-3' },
    });
    newestRead = isZip(new Uint8Array(await head.arrayBuffer())) ? 'zip' : 'not-zip';
  }

  let phoneFileId = files.find((file) => file.name === PHONE_PROBE_NAME)?.id;
  let phoneFile: DriveProbe['phoneFile'] = 'still-there';
  if (phoneFileId === undefined) {
    phoneFile = memory.previouslyWritten ? 'gone-and-rewritten' : 'written';
    phoneFileId = await upload(call, folderId);
  }

  const back = await call('read back', `${API}/files/${phoneFileId}?alt=media`);
  const readBack = (await back.text()) === PHONE_PROBE_TEXT;

  return {
    account,
    folder: 'found',
    pcArchives: pcArchives.map(({ name, size }) => ({ name, size })),
    newestRead,
    phoneFile,
    readBack,
  };
}

/** One multipart upload: the file is a line of text, so nothing needs resuming. */
async function upload(
  call: (what: string, url: string, init?: RequestInit) => Promise<Response>,
  folderId: string,
): Promise<string> {
  const boundary = `budojo-${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: PHONE_PROBE_NAME, parents: [folderId], mimeType: 'text/plain' }),
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    PHONE_PROBE_TEXT,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const created = await call('write', `${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await created.json()) as { id: string }).id;
}
