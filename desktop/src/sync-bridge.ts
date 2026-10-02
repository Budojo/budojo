/**
 * Drive for the page's sync engine (#2032, PRD § 5.6): the engine runs in the
 * page, and the PC's main process, which holds the refresh token (#1301),
 * makes its calls to Drive. The page asks with a request; the main process
 * checks where it goes, puts its own token on it, and answers with the status,
 * the headers the engine reads and the body.
 *
 * **Only Drive's own API, over https.** The token reaches nothing else, and a
 * request that names another host or path is refused before any token is read.
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
const PATHS = ['/drive/v3/files', '/upload/drive/v3/files'];

export function isSyncDriveUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    parsed.protocol === 'https:' &&
    parsed.host === HOST &&
    parsed.username === '' &&
    parsed.password === '' &&
    PATHS.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))
  );
}

/** The page's headers, without any authorization of its own: the main process puts its token on. */
export function forwardedHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'authorization'),
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
