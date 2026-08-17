import { describe, expect, it } from 'vitest';

import { formatConsoleMessage, isWorthLogging, redactSecrets } from './renderer-log.js';

/**
 * Renderer fault logging (#1317).
 *
 * The renderer holds the Sanctum bearer token (#1227) and can be handed a
 * recovery code (#1254), so anything it prints can carry a credential. A logger
 * that quietly writes those to a file is worse than no logger at all: the file
 * travels inside support bundles and screenshots, and nobody thinks to look.
 *
 * That makes redaction the part worth testing exhaustively — and the reason it
 * is a pure function rather than a regex inline in the wiring.
 */

describe('redactSecrets', () => {
  it('redacts a bearer token', () => {
    const out = redactSecrets('GET /api/v1/me failed, Authorization: Bearer 12|abcdefghijklmnop');

    expect(out).not.toContain('abcdefghijklmnop');
    expect(out).toContain('[redacted]');
  });

  it('redacts a bearer token whatever the header casing', () => {
    expect(redactSecrets('authorization: bearer SECRETVALUE123456')).not.toContain('SECRETVALUE123456');
  });

  it('redacts a Sanctum token by its shape, not just after a header', () => {
    // `12|abc…` is what Sanctum mints, and it turns up in error dumps that
    // never mention the word "bearer".
    const out = redactSecrets('token expired: 47|kQ9xLm2pR7vT4wY8zA1bC3dE5fG6hJ0k');

    expect(out).not.toContain('kQ9xLm2pR7vT4wY8zA1bC3dE5fG6hJ0k');
  });

  it('redacts a recovery code', () => {
    const out = redactSecrets('import failed for BUDOJO-RECOVERY-1:eyJhcHAiOiJzZWNyZXQifQ');

    expect(out).not.toContain('eyJhcHAiOiJzZWNyZXQifQ');
    expect(out).toContain('[redacted]');
  });

  it('redacts a token carried in a query string', () => {
    const out = redactSecrets('failed to load app://bundle/x?auth_token=abc123def456&v=2');

    expect(out).not.toContain('abc123def456');
    // The rest of the URL survives — it is the diagnostic value.
    expect(out).toContain('app://bundle/x');
  });

  it('redacts a Google OAuth refresh token', () => {
    // #1301 puts one in the main process, but a renderer-side error could echo
    // one back through an IPC result.
    const out = redactSecrets('drive: refresh_token=1//0eXaMpLe-ReFrEsH_ToKeN failed');

    expect(out).not.toContain('0eXaMpLe-ReFrEsH_ToKeN');
  });

  // The whole point is a readable log. Over-redacting to the point of
  // uselessness would make people turn it off.
  it('leaves an ordinary message untouched', () => {
    const message = 'ERROR TypeError: Cannot read properties of undefined (reading "name")';

    expect(redactSecrets(message)).toBe(message);
  });

  it('leaves a chunk-load failure fully readable — the case this exists for', () => {
    const message = 'Failed to fetch dynamically imported module: app://bundle/chunk-ABC123.js';

    expect(redactSecrets(message)).toBe(message);
  });

  it('handles an empty message without throwing', () => {
    expect(redactSecrets('')).toBe('');
  });
});

describe('isWorthLogging', () => {
  // Angular is chatty. Logging info and debug would bury the one line that
  // matters under thousands, and rotate it out of the file entirely.
  it('keeps warnings and errors', () => {
    expect(isWorthLogging(2)).toBe(true);
    expect(isWorthLogging(3)).toBe(true);
  });

  it('drops info and debug', () => {
    expect(isWorthLogging(0)).toBe(false);
    expect(isWorthLogging(1)).toBe(false);
  });
});

describe('formatConsoleMessage', () => {
  it('records where the message came from, not just what it said', () => {
    const line = formatConsoleMessage({
      level: 3,
      message: 'boom',
      line: 42,
      sourceId: 'app://bundle/main-XYZ.js',
    });

    expect(line).toContain('error');
    expect(line).toContain('boom');
    expect(line).toContain('main-XYZ.js:42');
  });

  it('redacts through the formatter, so no caller can bypass it', () => {
    const line = formatConsoleMessage({
      level: 3,
      message: 'Authorization: Bearer 9|SUPERSECRETTOKENVALUE',
      line: 1,
      sourceId: 'app://bundle/x.js',
    });

    expect(line).not.toContain('SUPERSECRETTOKENVALUE');
  });

  it('survives a message with no source', () => {
    expect(() => formatConsoleMessage({ level: 2, message: 'x', line: 0, sourceId: '' })).not.toThrow();
  });
});
