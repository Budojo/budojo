/**
 * Drive for the page's sync engine (#2032, PRD § 5.6): the engine runs in the
 * page, and the PC's main process, which holds the refresh token (#1301),
 * makes its calls to Drive. The page asks with a request; the main process
 * checks where it goes, puts its own token on it, and answers with the status,
 * the headers the engine reads and the body.
 *
 * **Only what `DriveRemote` asks, over https** (`client/.../drive-remote.ts`):
 * the files API and its uploads, a file by its id, in the visible space. The
 * token reaches nothing else, and anything else is refused before any token is
 * read:
 * - **another host, or another API;**
 * - **a file's sub-resources** (`/permissions`, `/revisions`, …): sharing a
 *   file is not the sync's to do;
 * - **the account's hidden application data** (`spaces=appDataFolder`), where
 *   the keys file holds this PC's `APP_KEY` and `DOCUMENT_ENCRYPTION_KEY`. The
 *   page gets the sync key and the folder id from `identity()`, and no more;
 * - **any change the sync does not make** (#2106): it reads, creates and
 *   uploads, and never trashes or moves a file, so the token can do neither
 *   to a backup or any other file Budojo made. `PUT` goes only to an upload's
 *   session; `PATCH` only opens one for a file's new content, with no
 *   metadata (`{}`) and no parameter but the upload's own, never `trashed` or
 *   `addParents`. A `POST` goes to the collection, never to a file; and of the
 *   page's headers only the three the uploads need pass.
 * - **a delete of anything but a version of this PC's sync folder** (#2120).
 *   The device that pushes prunes the folder's versions (#2117), so a `DELETE`
 *   of one file by its id passes here, and the main process reads where the
 *   file is before it forwards it (`checkDelete`).
 */

export interface DriveRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

export interface DriveAnswer {
  status: number;
  /** Lower-case names: what the engine reads (Drive's clock, an upload's address, the type). */
  headers: Record<string, string>;
  body: Uint8Array;
}

/** The headers of an answer the engine reads. */
export const ANSWER_HEADERS = ['date', 'location', 'content-type'] as const;

const HOST = 'www.googleapis.com';
/** What `DriveRemote` sends. A `DELETE` is checked again before it is forwarded (#2120). */
const VERBS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
/** The only parameters of the `PATCH` that opens an upload of a file's new content. */
const UPLOAD_PARAMS = new Set(['uploadType', 'fields']);
/** The files collection, or one file by its id: nothing deeper. */
const PATH = /^\/(upload\/)?drive\/v3\/files(\/[A-Za-z0-9_-]+)?$/;

export function isSyncDriveUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const spaces = parsed.searchParams.getAll('spaces');

  return (
    parsed.protocol === 'https:' &&
    parsed.host === HOST &&
    parsed.username === '' &&
    parsed.password === '' &&
    PATH.test(parsed.pathname) &&
    spaces.every((space) => space === 'drive')
  );
}

/**
 * The headers `DriveRemote` sets, and no other: not the page's own
 * authorization (the main process puts its token on), and never one that
 * changes what the request does, as `X-HTTP-Method-Override` would turn a
 * `POST` into a `DELETE` (#2106).
 */
const FORWARDED = new Set(['content-type', 'x-upload-content-type', 'x-upload-content-length']);

export function forwardedHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => FORWARDED.has(name.toLowerCase())),
  );
}

/** A request as it came over IPC, checked field by field: the page is trusted code, but IPC is untyped. */
export function parseDriveRequest(value: unknown): DriveRequest | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const request = value as Record<string, unknown>;
  const { url, method, headers, body } = request;
  if (typeof url !== 'string' || typeof method !== 'string' || !isSyncDriveUrl(url)) {
    return null;
  }
  const verb = method.toUpperCase();
  const address = new URL(url);
  const upload = address.pathname.startsWith('/upload/');
  if (!VERBS.has(verb) || (verb === 'PUT' && !upload)) {
    return null;
  }
  // A POST creates: to the collection only, never to a file by its id.
  if (verb === 'POST' && !/\/files$/.test(address.pathname)) {
    return null;
  }
  if (verb === 'DELETE' && (deletedFileId({ url, method: verb, headers: {} }) === null || body !== undefined)) {
    return null;
  }
  if (
    verb === 'PATCH' &&
    (!upload ||
      [...address.searchParams.keys()].some((name) => !UPLOAD_PARAMS.has(name)) ||
      (body !== undefined && body !== '{}'))
  ) {
    return null;
  }
  if (
    typeof headers !== 'object' ||
    headers === null ||
    !Object.values(headers).every((header) => typeof header === 'string')
  ) {
    return null;
  }
  if (body !== undefined && typeof body !== 'string' && !(body instanceof Uint8Array)) {
    return null;
  }

  return {
    url,
    method: method.toUpperCase(),
    headers: forwardedHeaders(headers as Record<string, string>),
    ...(body === undefined ? {} : { body }),
  };
}

/** One file by its id, in the visible files API (not an upload's), with no parameter. */
const FILE_PATH = /^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/;

/** The file a `DELETE` names, or null for any other request: one file by its id, bare. */
export function deletedFileId(request: DriveRequest): string | null {
  if (request.method !== 'DELETE' || request.body !== undefined || !isSyncDriveUrl(request.url)) {
    return null;
  }
  const address = new URL(request.url);

  return address.search === '' ? (FILE_PATH.exec(address.pathname)?.[1] ?? null) : null;
}

/** A file or folder on Drive, as the main process reads it to check a delete (#2120). */
export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
}

const FOLDER = 'application/vnd.google-apps.folder';
/** The folder the sync lives in, inside the `Budojo` folder (`docs/sync/protocol.md` § The folder). */
const SYNC_FOLDER = 'sync';
/** The sync folder's folders whose files the sync deletes, and the names those files have. */
const PRUNED = new Map<string, RegExp>([['versions', /^\d{6}-[a-z0-9]+\.(root|\d{6}-[a-z0-9]+)\.bjs$/]]);

function onlyParent(item: DriveItem): string | null {
  return item.parents.length === 1 ? (item.parents[0] ?? null) : null;
}

/**
 * Whether the main process forwards a sync's delete (#2120): a version's name,
 * in a folder named `versions`, in a folder named `sync`, in the `Budojo`
 * folder this PC linked (`folderId`, where its backups go). A backup, the
 * keys, a report, a document, and a version's name anywhere else are refused.
 *
 * `chain` is the file and the folders above it, as far as they were read. The
 * answer is the next folder to read, or the verdict: nothing past the first
 * link that fails is read, so a backup's delete costs one read.
 */
export function checkDelete(chain: readonly DriveItem[], budojoFolder: string): { read: string } | boolean {
  const [file, folder, sync] = chain;
  if (file === undefined || chain.length > 3) {
    return false;
  }
  const parent = onlyParent(file);
  if (file.mimeType === FOLDER || parent === null || ![...PRUNED.values()].some((name) => name.test(file.name))) {
    return false;
  }
  if (folder === undefined) {
    return { read: parent };
  }
  const above = onlyParent(folder);
  if (
    folder.id !== parent ||
    folder.mimeType !== FOLDER ||
    PRUNED.get(folder.name)?.test(file.name) !== true ||
    above === null
  ) {
    return false;
  }
  if (sync === undefined) {
    return { read: above };
  }

  return sync.id === above && sync.mimeType === FOLDER && sync.name === SYNC_FOLDER && onlyParent(sync) === budojoFolder;
}
