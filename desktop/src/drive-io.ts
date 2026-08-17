import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

import { buildAuthorizeUrl, createPkcePair, DRIVE_SCOPE, needsRefresh, parseCallbackUrl } from './drive-auth.js';
import type { RemoteArchive } from './drive-sync.js';

/**
 * The I/O half of the Drive backup sync (#1301). Sockets, HTTP and nothing
 * that decides anything — every decision lives in `drive-auth.ts`,
 * `drive-sync.ts` and `drive-state.ts`, where it is under test.
 *
 * This file is deliberately not unit-tested: mocking `fetch` and a loopback
 * socket would assert that the mocks were called, not that Google accepts the
 * request. It is exercised by the real-process harness in the PR instead —
 * which is the rule `desktop/CLAUDE.md` already sets for anything that touches
 * a real runtime.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** The folder archives land in. Visible in the user's Drive on purpose (#1301). */
export const FOLDER_NAME = 'Budojo';

/**
 * How long to wait for the user to finish the Google consent screen. Long
 * enough to find a password, short enough that an abandoned attempt does not
 * leave a socket listening for the rest of the session.
 */
const CONSENT_TIMEOUT_MS = 5 * 60_000;

export interface DriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export interface DriveClientConfig {
  clientId: string;
  /**
   * Google issues one for "Desktop app" clients, and it is NOT a secret: the
   * binary is on the user's disk. Google documents this, and it is exactly why
   * the flow uses PKCE. Sent because the token endpoint expects it.
   */
  clientSecret: string;
}

/** Anything that failed with a code the UI can turn into advice. */
export class DriveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DriveError';
  }
}

/** Maps a failed response onto the codes `describeSyncError` knows. */
async function toDriveError(response: Response): Promise<DriveError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const payload = body as { error?: unknown; error_description?: string } | null;
  const raw = payload?.error;

  // The token endpoint returns `{"error":"invalid_grant"}`; the Drive API
  // returns `{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}`.
  if (typeof raw === 'string') {
    return new DriveError(raw, payload?.error_description);
  }

  const reason = (raw as { errors?: { reason?: string }[] } | undefined)?.errors?.[0]?.reason;
  if (typeof reason === 'string') {
    return new DriveError(reason);
  }

  return new DriveError(response.status === 401 ? 'unauthorized' : `http_${response.status}`);
}

/**
 * Runs the consent flow: opens a one-shot loopback server, hands the caller the
 * URL to show, and resolves once Google redirects back.
 *
 * Port 0 lets the OS pick a free port — a fixed one would collide, and Google
 * accepts any port on a registered loopback redirect. `127.0.0.1` rather than
 * `localhost` because the latter can resolve to ::1 and trip client firewalls.
 */
export async function authorize(
  config: DriveClientConfig,
  openBrowser: (url: string) => void | Promise<void>,
): Promise<DriveTokens> {
  const pkce = createPkcePair();
  const state = randomBytes(16).toString('hex');

  // The redirect_uri is resolved inside the listen callback (the OS picks the
  // port) and must be echoed back identically at the token exchange. It rides
  // out of the promise rather than living in a module-level variable, which two
  // overlapping sign-ins would corrupt.
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let redirectUri = '';

    const server = createServer((request, response) => {
      const result = parseCallbackUrl(request.url ?? '/', state);

      // Anything that is not our callback gets a 404 and does not end the wait
      // — a browser probing /favicon.ico must not cancel the sign-in.
      if (!result.ok && result.reason === 'not_callback') {
        response.writeHead(404).end();

        return;
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        result.ok
          ? '<!doctype html><meta charset="utf-8"><title>Budojo</title><p>Connected. You can close this tab and go back to Budojo.'
          : '<!doctype html><meta charset="utf-8"><title>Budojo</title><p>Sign-in failed. Go back to Budojo and try again.',
      );
      server.close();
      clearTimeout(timer);

      if (result.ok) {
        resolve({ code: result.code, redirectUri });
      } else {
        reject(new DriveError(result.reason));
      }
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new DriveError('consent_timeout'));
    }, CONSENT_TIMEOUT_MS);
    timer.unref();

    server.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}/callback`;

      void Promise.resolve(
        openBrowser(buildAuthorizeUrl({ clientId: config.clientId, redirectUri, challenge: pkce.challenge, state })),
      ).catch((error: unknown) => {
        clearTimeout(timer);
        server.close();
        reject(error instanceof Error ? error : new DriveError('browser_failed'));
      });
    });
  });

  return exchangeCode(config, code, pkce.verifier, redirectUri);
}

async function exchangeCode(
  config: DriveClientConfig,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<DriveTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw await toDriveError(response);
  }

  const body = (await response.json()) as { access_token: string; refresh_token?: string; expires_in?: number };

  if (typeof body.refresh_token !== 'string') {
    // Without it the link dies at the first expiry. Better to fail the connect
    // loudly than to report success and break in an hour.
    throw new DriveError('no_refresh_token');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: typeof body.expires_in === 'number' ? Date.now() + body.expires_in * 1000 : null,
  };
}

export async function refresh(config: DriveClientConfig, refreshToken: string): Promise<DriveTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw await toDriveError(response);
  }

  const body = (await response.json()) as { access_token: string; expires_in?: number };

  return {
    accessToken: body.access_token,
    // A refresh response carries no new refresh token; the original stays valid.
    refreshToken,
    expiresAt: typeof body.expires_in === 'number' ? Date.now() + body.expires_in * 1000 : null,
  };
}

/** Refreshes only when needed, so the caller never has to think about expiry. */
export async function ensureFresh(config: DriveClientConfig, tokens: DriveTokens): Promise<DriveTokens> {
  return needsRefresh(tokens, Date.now()) ? refresh(config, tokens.refreshToken) : tokens;
}

function auth(tokens: DriveTokens): Record<string, string> {
  return { Authorization: `Bearer ${tokens.accessToken}` };
}

/** The signed-in account's address, shown so the owner knows where backups go. */
export async function accountEmail(tokens: DriveTokens): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user/emailAddress', {
    headers: auth(tokens),
  });

  if (!response.ok) {
    throw await toDriveError(response);
  }

  const body = (await response.json()) as { user?: { emailAddress?: string } };

  return body.user?.emailAddress ?? null;
}

/**
 * Finds the Budojo folder or creates it. Idempotent: the query runs first, so a
 * second machine linked to the same account reuses the folder rather than
 * making a second one beside it.
 */
export async function ensureFolder(tokens: DriveTokens): Promise<string> {
  const query = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await fetch(`${DRIVE_FILES}?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`, {
    headers: auth(tokens),
  });

  if (!found.ok) {
    throw await toDriveError(found);
  }

  const body = (await found.json()) as { files?: { id: string }[] };
  const existing = body.files?.[0]?.id;
  if (existing !== undefined) {
    return existing;
  }

  const created = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: 'POST',
    headers: { ...auth(tokens), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });

  if (!created.ok) {
    throw await toDriveError(created);
  }

  return ((await created.json()) as { id: string }).id;
}

/** Everything in the folder, paged — an account with many archives must not truncate. */
export async function listArchives(tokens: DriveTokens, folderId: string): Promise<RemoteArchive[]> {
  const archives: RemoteArchive[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, size)',
      pageSize: '100',
    });
    if (pageToken !== undefined) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(`${DRIVE_FILES}?${params.toString()}`, { headers: auth(tokens) });
    if (!response.ok) {
      throw await toDriveError(response);
    }

    const body = (await response.json()) as {
      nextPageToken?: string;
      files?: { id: string; name: string; size?: string }[];
    };

    for (const file of body.files ?? []) {
      // Drive reports size as a string, and omits it for folders.
      archives.push({ id: file.id, name: file.name, size: Number(file.size ?? 0) });
    }

    pageToken = body.nextPageToken;
  } while (pageToken !== undefined);

  return archives;
}

/**
 * Resumable upload. A backup archive is tens of megabytes and the connection is
 * whatever the gym has — a multipart POST that dies at 90% would start again
 * from zero every time, on the exact connection where that keeps happening.
 */
export async function uploadArchive(
  tokens: DriveTokens,
  folderId: string,
  filePath: string,
  name: string,
): Promise<void> {
  const { size } = await stat(filePath);

  const start = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable`, {
    method: 'POST',
    headers: {
      ...auth(tokens),
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'application/zip',
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });

  if (!start.ok) {
    throw await toDriveError(start);
  }

  const session = start.headers.get('location');
  if (session === null) {
    throw new DriveError('no_upload_session');
  }

  const put = await fetch(session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/zip', 'Content-Length': String(size) },
    body: Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>,
    // Node requires this when the body is a stream.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  if (!put.ok) {
    throw await toDriveError(put);
  }
}

export async function deleteFile(tokens: DriveTokens, fileId: string): Promise<void> {
  const response = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: auth(tokens),
  });

  // 404 means it is already gone, which is the state we wanted.
  if (!response.ok && response.status !== 404) {
    throw await toDriveError(response);
  }
}

/** Best-effort revoke on disconnect, so the grant does not linger in the Google account. */
export async function revoke(refreshToken: string): Promise<void> {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => undefined);
}

export { DRIVE_SCOPE };
