import { createHash, randomBytes } from 'node:crypto';

/**
 * The pure half of the Google OAuth flow for Drive backup sync (#1301).
 *
 * Everything here decides something and touches nothing: no sockets, no clock,
 * no Electron. `drive-io.ts` owns the loopback server and the HTTP calls, so
 * the parts that can be wrong in a subtle way are the parts under test.
 *
 * Flow shape, and why:
 *
 *   * **Loopback redirect, not out-of-band.** Google deprecated the copy/paste
 *     OOB flow in October 2022 as a phishing risk; loopback is what remains
 *     supported for desktop clients. We spin up a one-shot HTTP server on
 *     127.0.0.1 and let Google redirect to it.
 *   * **PKCE, because a desktop app has no secret.** The binary is on the
 *     user's disk, so anything compiled into it is public. PKCE makes the
 *     authorization code useless without the verifier, which never leaves this
 *     process.
 *   * **`drive.file` only.** It grants access exclusively to files this app
 *     created — not the user's Drive. It is also classed non-sensitive, which
 *     keeps the app out of Google's sensitive-scope verification review.
 */

/**
 * The narrowest scope that can do the job: per-file access, limited to files
 * this application created. Widening this to `drive` would read the user's
 * entire Drive AND make the app subject to sensitive-scope verification.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Refresh this far before the token actually dies. An upload that starts just
 * inside the window would otherwise fail with a 401 mid-flight, which surfaces
 * to the user as "sync is broken" rather than "a token expired".
 */
const REFRESH_SKEW_MS = 60_000;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export type CallbackResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'state_mismatch' | 'no_code' | 'not_callback' | string };

/** base64url per RFC 7636 — no padding, URL-safe alphabet. */
function base64url(raw: Buffer): string {
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * `random` is injectable so a spec can pin a known-answer vector; production
 * always uses `randomBytes`. 32 bytes yields a 43-character verifier, the
 * minimum RFC 7636 allows and plenty of entropy.
 */
export function createPkcePair(random: (size: number) => Buffer = randomBytes): PkcePair {
  const verifier = base64url(random(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  return { verifier, challenge };
}

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);

  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DRIVE_SCOPE);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', input.state);
  // Without `offline` there is no refresh token, and the link would quietly
  // stop working an hour later.
  url.searchParams.set('access_type', 'offline');
  // Google withholds the refresh token on a repeat authorization unless asked.
  // Re-linking after a revoke would otherwise look successful and then fail.
  url.searchParams.set('prompt', 'consent');

  return url.toString();
}

/**
 * Reads whatever the loopback server received. `expectedState` is the CSRF
 * defence: while the server is listening, anything else on the machine can
 * reach 127.0.0.1, so a callback that does not carry our state is not ours.
 */
export function parseCallbackUrl(requestUrl: string, expectedState: string): CallbackResult {
  const url = new URL(requestUrl, 'http://127.0.0.1');

  if (url.pathname !== '/callback') {
    return { ok: false, reason: 'not_callback' };
  }

  if (url.searchParams.get('state') !== expectedState) {
    return { ok: false, reason: 'state_mismatch' };
  }

  const error = url.searchParams.get('error');
  if (error !== null) {
    // Report Google's own reason — `access_denied` (the user said no) needs a
    // different message than a real failure, and inventing one loses that.
    return { ok: false, reason: error };
  }

  const code = url.searchParams.get('code');
  if (code === null || code === '') {
    return { ok: false, reason: 'no_code' };
  }

  return { ok: true, code };
}

/** A null expiry means we do not know, which is treated as "refresh it". */
export function needsRefresh(token: { expiresAt: number | null }, now: number): boolean {
  if (token.expiresAt === null) {
    return true;
  }

  return token.expiresAt - REFRESH_SKEW_MS <= now;
}
