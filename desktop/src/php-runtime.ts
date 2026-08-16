import path from 'node:path';

/**
 * Pure helpers behind the PHP supervisor (#1222): where things live, what goes
 * in php.ini, what the child process's environment and arguments are, and how
 * many crashes count as a boot loop. No I/O here — everything is unit-tested
 * in php-runtime.spec.ts, and php-supervisor.ts is the only place a process
 * actually gets spawned.
 */

export interface DesktopPaths {
  /** php.exe of the bundled runtime. */
  phpBinary: string;
  /** Directory holding the runtime's ext/*.dll files. */
  phpExtensionDir: string;
  /** Root of the Laravel application (contains artisan, public/, vendor/). */
  serverRoot: string;
}

/**
 * Development points at the checkout: `desktop/runtime/php` (fetched by
 * scripts/fetch-php.mjs) and the sibling `server/`. Packaged points at
 * electron-builder's `extraResources`, which are real directories on disk —
 * a child process cannot be spawned from inside an asar archive.
 */
export function resolveDesktopPaths(input: {
  isPackaged: boolean;
  resourcesPath: string;
  devRoot: string;
}): DesktopPaths {
  const runtimeDir = input.isPackaged
    ? path.resolve(input.resourcesPath, 'php')
    : path.resolve(input.devRoot, 'runtime', 'php');

  const serverRoot = input.isPackaged
    ? path.resolve(input.resourcesPath, 'server')
    : path.resolve(input.devRoot, '..', 'server');

  return {
    phpBinary: path.join(runtimeDir, 'php.exe'),
    phpExtensionDir: path.join(runtimeDir, 'ext'),
    serverRoot,
  };
}

/**
 * Extensions loaded as DLLs. The list is `composer check-platform-reqs` minus
 * everything the Windows build compiles in statically (ctype, dom, filter,
 * hash, iconv, json, libxml, pcre, session, tokenizer, xml — verified with
 * `php -n -m`), plus the SQLite drivers and opcache.
 *
 * Nothing speculative: an extension the app never calls is attack surface and
 * DLL-load risk with no upside. pdo_mysql stays out on purpose — the desktop
 * is SQLite-only.
 */
const EXTENSIONS = [
  'curl',
  'fileinfo',
  'mbstring',
  'openssl',
  'pdo_sqlite',
  // Ed25519 for licence-key verification (#1290). The DLL already ships with
  // the pinned runtime; it was simply never enabled. Verified in the bundled
  // php.exe: a valid signature is accepted and a one-bit-flipped one refused.
  'sodium',
  'sqlite3',
] as const;

export function buildPhpIni(input: { extensionDir: string; errorLog: string; tempDir: string }): string {
  const lines = [
    '; Generated at launch by Budojo Desktop — do not edit, it is overwritten.',
    '; See desktop/src/php-runtime.ts for the reasoning behind each value.',
    '',
    `extension_dir="${input.extensionDir}"`,
    ...EXTENSIONS.map((extension) => `extension=${extension}`),
    'zend_extension=opcache',
    '',
    '; php -S is the CLI SAPI; opcache ignores it unless told otherwise, and',
    '; then every request recompiles the framework.',
    'opcache.enable=1',
    'opcache.enable_cli=1',
    'opcache.memory_consumption=128',
    'opcache.max_accelerated_files=20000',
    '',
    '; Errors go to the log the supervisor rotates, never into a response body.',
    'display_errors=Off',
    'display_startup_errors=Off',
    'log_errors=On',
    `error_log="${input.errorLog}"`,
    '',
    '; UploadDocumentRequest allows 10240 KB per medical certificate. PHP has to',
    '; accept it before Laravel can validate it.',
    'upload_max_filesize=12M',
    'post_max_size=16M',
    `upload_tmp_dir="${input.tempDir}"`,
    '',
    '; The built-in server is single-threaded on Windows: a request stuck in a',
    '; loop blocks every request after it. Bound it.',
    'max_execution_time=60',
    'memory_limit=256M',
    '',
    'date.timezone=UTC',
    'expose_php=Off',
    '',
  ];

  return lines.join('\n');
}

export interface PhpEnvOptions {
  port: number;
  databasePath: string;
  rendererOrigin: string;
  /**
   * Laravel's storage/, relocated under userData (#1223). Honoured natively via
   * LARAVEL_STORAGE_PATH; the install directory is read-only.
   */
  storagePath?: string;
  /**
   * The generated php.ini. We pass `-c` on our own invocations, but Laravel's
   * scheduler spawns each due command as its OWN php.exe subprocess, resolved
   * through `PHP_BINARY` with no `-c` — so those children would load no ini,
   * no extensions, and die on `could not find driver`. Exporting `PHPRC` makes
   * every descendant pick the same ini up. See `buildPhpEnv`.
   */
  iniPath?: string;
  /** Secrets and anything else the bootstrap (#1223) resolves at launch. */
  extra?: Readonly<Record<string, string>>;
}

/**
 * Parent-environment keys the child may inherit. SYSTEMROOT is required for
 * php.exe to function at all; the rest are harmless plumbing. Everything not
 * listed is dropped — including any DB_*, APP_*, MAIL_* value sitting in the
 * user's shell, which would otherwise override Laravel's own configuration
 * exactly the way an env_file did in #1233.
 */
const INHERITED_ENV_KEYS = [
  'SYSTEMROOT',
  'WINDIR',
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'NUMBER_OF_PROCESSORS',
] as const;

export function buildPhpEnv(
  options: PhpEnvOptions,
  parentEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {};

  // Windows spells these SystemRoot / Path / ComSpec; match without caring.
  const upperCased = new Map<string, string>();
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value !== undefined) {
      upperCased.set(key.toUpperCase(), value);
    }
  }

  for (const key of INHERITED_ENV_KEYS) {
    const value = upperCased.get(key);
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // An empty PHP_INI_SCAN_DIR disables additional-ini scanning. The parent's
  // PHPRC is never forwarded — it was observed pulling a foreign php.ini into
  // the bundled runtime on a machine with a scoop-installed PHP (it is absent
  // from INHERITED_ENV_KEYS, so it is already dropped).
  env['PHP_INI_SCAN_DIR'] = '';

  // ...but we DO set our own, pointing at the directory holding the generated
  // php.ini. We pass `-c` on the invocations we control; Laravel's scheduler
  // does not — `$schedule->command()` spawns each due command as a separate
  // php.exe through `PHP_BINARY`, with no `-c`. Those children were loading no
  // ini at all, so every scheduled command failed with `could not find driver`
  // (sqlite) and the medical-certificate expiry reminders — the desktop's whole
  // replacement for e-mail — never ran. It only showed up in laravel.log, which
  // nothing surfaces. PHPRC is inherited by every descendant, so this fixes the
  // class rather than one caller.
  if (options.iniPath !== undefined) {
    env['PHPRC'] = path.dirname(options.iniPath);
  }

  Object.assign(env, {
    BUDOJO_RUNTIME: 'desktop',
    // A desktop build is production for its user: diagnostics belong in the
    // log the supervisor surfaces on failure, never in a response body.
    APP_NAME: 'Budojo',
    APP_ENV: 'production',
    APP_DEBUG: 'false',
    APP_URL: `http://127.0.0.1:${options.port}`,
    CORS_ALLOWED_ORIGINS: options.rendererOrigin,
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: options.databasePath,
    // The exact driver set DesktopDriverGuard (#1220) refuses to boot without.
    QUEUE_CONNECTION: 'sync',
    CACHE_STORE: 'file',
    SESSION_DRIVER: 'file',
    BROADCAST_CONNECTION: 'null',
    FILESYSTEM_DISK: 'local',
    // No transport on the desktop; a Mailable must not 500 a request by
    // dialling an SMTP host that does not exist. BYO-SMTP is a follow-up.
    MAIL_MAILER: 'log',
  });

  if (options.storagePath !== undefined) {
    env['LARAVEL_STORAGE_PATH'] = options.storagePath;
  }

  Object.assign(env, options.extra ?? {});

  return env;
}

/**
 * `php -S` directly rather than `php artisan serve`. artisan serve is a
 * wrapper that spawns the very same built-in server as a grandchild; killing
 * the wrapper on Windows leaves that grandchild alive, holding the SQLite file
 * — precisely the orphan the supervisor exists to prevent. Spawning php.exe
 * ourselves means there is exactly one process and its pid is ours to kill.
 *
 * Mirrors ServeCommand exactly: the framework's router as the script and the
 * process cwd set to public/. The router does `require getcwd().'/index.php'`,
 * so any other cwd is a fatal on every request — which is precisely how the
 * first harness run failed. No `-t`: with the cwd already in public/, the
 * built-in server's docroot defaults to it.
 */
export function buildServeInvocation(input: {
  port: number;
  iniPath: string;
  serverRoot: string;
}): { args: string[]; cwd: string } {
  const router = path.join(
    input.serverRoot,
    'vendor',
    'laravel',
    'framework',
    'src',
    'Illuminate',
    'Foundation',
    'resources',
    'server.php',
  );

  return {
    args: ['-c', input.iniPath, '-S', `127.0.0.1:${input.port}`, router],
    cwd: path.join(input.serverRoot, 'public'),
  };
}

/**
 * Sliding-window cap on automatic restarts. One crash gets a silent restart;
 * `maxRestarts` crashes inside `windowMs` is a boot loop, and the supervisor
 * stops retrying and tells the user instead of spinning forever.
 */
export class RestartBudget {
  private readonly timestamps: number[] = [];

  constructor(private readonly options: { maxRestarts: number; windowMs: number }) {}

  allow(nowMs: number): boolean {
    const cutoff = nowMs - this.options.windowMs;

    while (this.timestamps.length > 0 && (this.timestamps[0] ?? 0) <= cutoff) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.options.maxRestarts) {
      return false;
    }

    this.timestamps.push(nowMs);

    return true;
  }
}
