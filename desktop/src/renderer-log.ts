/**
 * Renderer fault logging (#1317) — the pure half.
 *
 * Until now nothing in the app recorded anything the window did: no
 * `console-message` handler, no `did-fail-load`, and `Menu.setApplicationMenu(null)`
 * removes the DevTools accelerator. A page that failed to render was completely
 * silent — the owner saw a blank area and the only way anyone found out was if
 * they said so. For a local-first app with no telemetry, the on-disk log is the
 * entire diagnostic story, so it has to cover the renderer too.
 *
 * **Redaction is the load-bearing part.** The renderer holds the Sanctum bearer
 * token (#1227) and can be handed a recovery code (#1254), so anything it
 * prints can carry a credential — and this file is written to disk, where it
 * ends up inside support bundles and screenshots. A logger that quietly records
 * secrets is worse than no logger: it turns a diagnostic aid into a leak that
 * nobody thinks to look for.
 */

/** Electron's console-message levels: 0 debug, 1 info, 2 warning, 3 error. */
const WARNING = 2;

const LEVEL_NAMES = ['debug', 'info', 'warning', 'error'] as const;

/**
 * Each pattern keeps its label and drops its value. Ordered most specific
 * first — the bearer header before the bare token shape, so the header form
 * does not get half-matched by the looser rule.
 */
const REDACTIONS: { pattern: RegExp; replace: string }[] = [
  // Authorization: Bearer <token>
  { pattern: /(authorization\s*:\s*bearer\s+)\S+/gi, replace: '$1[redacted]' },
  // Recovery code (#1254): PREFIX:payload
  { pattern: /(BUDOJO-RECOVERY-\d+:)\S+/gi, replace: '$1[redacted]' },
  // Google refresh tokens (#1301) — `1//` prefixed, and the generic key=value.
  { pattern: /\b1\/\/[\w-]{10,}/g, replace: '[redacted]' },
  { pattern: /((?:refresh_token|access_token|client_secret|auth_token|token)\s*[=:]\s*)[^\s&"']+/gi, replace: '$1[redacted]' },
  // A Sanctum token by shape (`47|<40 chars>`), for the dumps that never say
  // "bearer" at all.
  { pattern: /\b\d+\|[A-Za-z0-9]{20,}/g, replace: '[redacted]' },
];

/**
 * Strips credentials while leaving the message diagnostic.
 *
 * Deliberately surgical rather than aggressive: over-redacting produces a log
 * nobody can read, which gets turned off, which is the same as not having one.
 * A chunk-load failure — the case this feature exists for — must come through
 * completely intact.
 */
export function redactSecrets(message: string): string {
  return REDACTIONS.reduce((text, { pattern, replace }) => text.replace(pattern, replace), message);
}

/**
 * Warnings and errors only. Angular is chatty at info and debug, and keeping
 * those would bury the one line that matters and rotate it out of the file.
 */
export function isWorthLogging(level: number): boolean {
  return level >= WARNING;
}

export function formatConsoleMessage(input: {
  level: number;
  message: string;
  line: number;
  sourceId: string;
}): string {
  const name = LEVEL_NAMES[input.level] ?? String(input.level);
  // The file name alone: the full app:// URL is noise, and where it broke is
  // what the reader needs.
  const file = input.sourceId.split('/').pop() ?? '';
  const where = file === '' ? '' : ` (${file}:${input.line})`;

  return `[${name}] ${redactSecrets(input.message)}${where}`;
}
