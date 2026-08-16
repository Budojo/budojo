import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildPhpEnv,
  buildPhpIni,
  buildServeInvocation,
  resolveDesktopPaths,
  RestartBudget,
} from './php-runtime.js';

/**
 * Pure building blocks of the PHP supervisor (#1222). The process management
 * itself is exercised against a real php.exe in a harness; what lives here is
 * every decision that can be wrong without a process being involved.
 */

describe('resolveDesktopPaths', () => {
  it('points at the repo checkout in development', () => {
    const paths = resolveDesktopPaths({
      isPackaged: false,
      resourcesPath: '/ignored',
      devRoot: '/repo/desktop',
    });

    expect(paths.phpBinary).toBe(path.resolve('/repo/desktop/runtime/php/php.exe'));
    expect(paths.serverRoot).toBe(path.resolve('/repo/server'));
  });

  it('points at the unpacked resources when packaged', () => {
    // A child process cannot be spawned from inside an asar archive, so both
    // the runtime and the Laravel tree live as real directories under
    // resources/ — see electron-builder.yml § extraResources.
    const paths = resolveDesktopPaths({
      isPackaged: true,
      resourcesPath: '/install/resources',
      devRoot: '/ignored',
    });

    expect(paths.phpBinary).toBe(path.resolve('/install/resources/php/php.exe'));
    expect(paths.serverRoot).toBe(path.resolve('/install/resources/server'));
  });
});

describe('buildPhpIni', () => {
  const ini = buildPhpIni({
    extensionDir: 'C:\\rt\\php\\ext',
    errorLog: 'C:\\data\\logs\\php-error.log',
    tempDir: 'C:\\data\\tmp',
  });

  it('enables exactly the extensions the app declares plus sqlite and opcache', () => {
    // From `composer check-platform-reqs`: curl, fileinfo, mbstring, openssl
    // are the only required extensions that ship as DLLs on Windows. pdo_sqlite
    // + sqlite3 are the database; opcache is the CLI-server speedup.
    for (const ext of ['curl', 'fileinfo', 'mbstring', 'openssl', 'pdo_sqlite', 'sqlite3']) {
      expect(ini).toContain(`extension=${ext}`);
    }
    expect(ini).toContain('zend_extension=opcache');
    // Not shipped: nothing the app never calls. pdo_mysql in particular — the
    // desktop is SQLite-only and a loaded-but-unused driver is only surface.
    expect(ini).not.toMatch(/^extension=pdo_mysql/m);
    expect(ini).not.toMatch(/^extension=gd/m);
  });

  it('turns opcache on for the CLI SAPI', () => {
    // `php -S` IS the CLI SAPI. Without enable_cli the whole opcache block is
    // decoration and every request recompiles the framework.
    expect(ini).toMatch(/^opcache\.enable_cli\s*=\s*1/m);
  });

  it('uses absolute paths only', () => {
    // A relative extension_dir resolves against the process cwd, which is
    // wherever the user launched from — not something to bet a DLL load on.
    expect(ini).toContain('extension_dir="C:\\rt\\php\\ext"');
    expect(ini).toContain('error_log="C:\\data\\logs\\php-error.log"');
    expect(ini).toContain('upload_tmp_dir="C:\\data\\tmp"');
  });

  it('keeps errors out of responses and into the log', () => {
    expect(ini).toMatch(/^display_errors\s*=\s*Off/m);
    expect(ini).toMatch(/^log_errors\s*=\s*On/m);
  });

  it('accepts the largest upload the app allows', () => {
    // UploadDocumentRequest caps a medical certificate at 10240 KB. PHP's own
    // defaults (2M / 8M) would reject it before Laravel ever sees the request,
    // as an opaque "The file failed to upload" rather than a validation error.
    expect(ini).toMatch(/^upload_max_filesize\s*=\s*12M/m);
    expect(ini).toMatch(/^post_max_size\s*=\s*16M/m);
  });

  it('bounds a single request so one runaway cannot freeze the server', () => {
    // The built-in server is single-threaded on Windows. A request stuck in a
    // loop is not "one slow response", it is every subsequent request too.
    expect(ini).toMatch(/^max_execution_time\s*=\s*60/m);
  });
});

describe('buildPhpEnv', () => {
  const opts = {
    port: 43210,
    databasePath: 'C:\\data\\budojo.sqlite',
    rendererOrigin: 'app://bundle',
  };

  it('pins the desktop runtime profile and the drivers it requires', () => {
    // These are the exact values DesktopDriverGuard (#1220) enforces at boot.
    // A drift here does not fail quietly — the guard refuses to start — but it
    // should not be possible to drift in the first place.
    const env = buildPhpEnv(opts, {});

    expect(env['BUDOJO_RUNTIME']).toBe('desktop');
    expect(env['QUEUE_CONNECTION']).toBe('sync');
    expect(env['CACHE_STORE']).toBe('file');
    expect(env['SESSION_DRIVER']).toBe('file');
    expect(env['DB_CONNECTION']).toBe('sqlite');
    expect(env['DB_DATABASE']).toBe('C:\\data\\budojo.sqlite');
  });

  it('tells Laravel its own URL and lets the renderer origin through CORS', () => {
    // The SPA is served from app://bundle and calls http://127.0.0.1:<port>.
    // That is cross-origin, so without this every API call dies in preflight.
    const env = buildPhpEnv(opts, {});

    expect(env['APP_URL']).toBe('http://127.0.0.1:43210');
    expect(env['CORS_ALLOWED_ORIGINS']).toBe('app://bundle');
  });

  it('forwards only the OS plumbing from the parent environment', () => {
    // SYSTEMROOT is genuinely required — without it Windows APIs used by
    // php.exe fail in bewildering ways — and PATH/TEMP are harmless. Nothing
    // else crosses over.
    const env = buildPhpEnv(opts, {
      SYSTEMROOT: 'C:\\Windows',
      PATH: 'C:\\bin',
      TEMP: 'C:\\t',
      UNRELATED_TOOL_FLAG: '1',
    });

    expect(env['SYSTEMROOT']).toBe('C:\\Windows');
    expect(env['PATH']).toBe('C:\\bin');
    expect(env['TEMP']).toBe('C:\\t');
    expect(env).not.toHaveProperty('UNRELATED_TOOL_FLAG');
  });

  it('never lets application config leak in from the parent environment', () => {
    // The lesson of #1233: an inherited DB_DATABASE or APP_KEY silently
    // overrides everything Laravel reads from its own files. The child gets a
    // whitelist, so a value in the user's shell can never reach the app.
    const env = buildPhpEnv(opts, {
      DB_DATABASE: '/evil.sqlite',
      APP_KEY: 'base64:evil',
      QUEUE_CONNECTION: 'database',
      MAIL_MAILER: 'resend',
    });

    expect(env['DB_DATABASE']).toBe('C:\\data\\budojo.sqlite');
    expect(env['QUEUE_CONNECTION']).toBe('sync');
    expect(env['MAIL_MAILER']).toBe('log');
    expect(env).not.toHaveProperty('APP_KEY');
  });

  it('isolates php.ini loading from whatever PHP is installed on the machine', () => {
    // Verified empirically on a machine with a scoop PHP: PHP_INI_SCAN_DIR in
    // the shell made the bundled php.exe load a foreign php.ini and warn about
    // a missing grpc DLL. An empty PHP_INI_SCAN_DIR disables scanning; the
    // machine's PHPRC is dropped for the same reason (it is not inheritable).
    const env = buildPhpEnv(opts, {
      PHP_INI_SCAN_DIR: 'C:\\scoop\\php\\conf.d',
      PHPRC: 'C:\\scoop\\php',
    });

    expect(env['PHP_INI_SCAN_DIR']).toBe('');
    expect(env['PHPRC']).not.toBe('C:\\scoop\\php');
  });

  it('exports our own PHPRC so the scheduler subprocesses find the ini', () => {
    // Laravel's `$schedule->command()` spawns each due command as its OWN
    // php.exe via PHP_BINARY, with no `-c`. Those children loaded no ini, so
    // pdo_sqlite was missing and every scheduled command died on "could not
    // find driver" — the medical-certificate expiry reminders included, only
    // ever visible in laravel.log. PHPRC is inherited by every descendant.
    // Build the path the way `dataLayout()` does rather than hardcoding
    // separators: production runs on Windows, CI runs these specs on Linux,
    // and `path.dirname('C:\\data\\php.ini')` is '.' on POSIX. `path.join`
    // yields the same dirname on both.
    const env = buildPhpEnv(
      { ...opts, iniPath: path.join('C:\\data', 'php.ini') },
      { PHPRC: 'C:\\scoop\\php' },
    );

    expect(env['PHPRC']).toBe('C:\\data');
  });

  it('omits PHPRC when no ini path is given, rather than inheriting one', () => {
    const env = buildPhpEnv(opts, { PHPRC: 'C:\\scoop\\php' });

    expect(env).not.toHaveProperty('PHPRC');
  });

  it('ships a usable licence public key and never takes one from the shell', () => {
    // The env is a whitelist, so a value not passed here simply does not exist
    // for Laravel — and a licence key that never arrives means an app that
    // silently enforces nothing (#1290).
    const env = buildPhpEnv(opts, { BUDOJO_LICENSE_PUBLIC_KEY: 'a-key-from-the-users-shell' });

    // Never the parent's: the shipped build decides what it trusts, not
    // whatever happens to be exported on the machine it runs on.
    expect(env['BUDOJO_LICENSE_PUBLIC_KEY']).not.toBe('a-key-from-the-users-shell');

    // 32 bytes, base64url — the shape PHP's sodium needs. A build that shipped
    // a truncated or re-wrapped key would enforce nothing and look fine.
    const key = env['BUDOJO_LICENSE_PUBLIC_KEY'] ?? '';
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(key.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toHaveLength(32);
  });

  it('lets the caller add secrets on top without changing the defaults', () => {
    const env = buildPhpEnv(
      { ...opts, extra: { APP_KEY: 'base64:real', DOCUMENT_ENCRYPTION_KEY: 'k' } },
      {},
    );

    expect(env['APP_KEY']).toBe('base64:real');
    expect(env['DOCUMENT_ENCRYPTION_KEY']).toBe('k');
    expect(env['BUDOJO_RUNTIME']).toBe('desktop');
  });
});

describe('buildServeInvocation', () => {
  const invocation = buildServeInvocation({
    port: 43210,
    iniPath: 'C:\\data\\php.ini',
    serverRoot: 'C:\\app\\server',
  });

  it('runs the built-in server on loopback with our ini and the framework router', () => {
    expect(invocation.args).toEqual([
      '-c',
      'C:\\data\\php.ini',
      '-S',
      '127.0.0.1:43210',
      path.join(
        'C:\\app\\server',
        'vendor',
        'laravel',
        'framework',
        'src',
        'Illuminate',
        'Foundation',
        'resources',
        'server.php',
      ),
    ]);
  });

  it('runs from public/, exactly as artisan serve does', () => {
    // The framework router resolves index.php from getcwd(). Spawning from the
    // server root produced "Failed opening required '.../server/index.php'" on
    // every request — a 500 on the health probe and a 30 s startup timeout.
    expect(invocation.cwd).toBe(path.join('C:\\app\\server', 'public'));
    expect(invocation.args).not.toContain('-t');
  });

  it('never binds to anything but loopback', () => {
    // The API has no auth story for the LAN and must not be reachable from it.
    const bind = invocation.args[invocation.args.indexOf('-S') + 1];

    expect(bind).toMatch(/^127\.0\.0\.1:/);
  });
});

describe('RestartBudget', () => {
  it('allows restarts up to the cap inside the window', () => {
    const budget = new RestartBudget({ maxRestarts: 3, windowMs: 60_000 });

    expect(budget.allow(1_000)).toBe(true);
    expect(budget.allow(2_000)).toBe(true);
    expect(budget.allow(3_000)).toBe(true);
    expect(budget.allow(4_000)).toBe(false);
  });

  it('forgets restarts that fall outside the window', () => {
    // A crash a day is a bug to fix; three crashes a minute is a boot loop.
    // The budget distinguishes them so the first does not eventually trip the
    // fatal path through sheer accumulation.
    const budget = new RestartBudget({ maxRestarts: 2, windowMs: 10_000 });

    expect(budget.allow(0)).toBe(true);
    expect(budget.allow(1_000)).toBe(true);
    expect(budget.allow(2_000)).toBe(false);
    expect(budget.allow(11_001)).toBe(true);
  });
});

describe('buildPhpEnv — platform details', () => {
  const opts = { port: 1, databasePath: 'x', rendererOrigin: 'app://bundle' };

  it('matches inherited keys case-insensitively', () => {
    // Windows spells them SystemRoot / Path / ComSpec. A plain object built
    // from Object.entries(process.env) keeps that spelling, and a whitelist
    // that only knew the upper-case form would silently drop SystemRoot — and
    // php.exe without SystemRoot fails in ways that look like anything else.
    const env = buildPhpEnv(opts, { SystemRoot: 'C:\Windows', Path: 'C:\bin', ComSpec: 'cmd.exe' });

    expect(env['SYSTEMROOT']).toBe('C:\Windows');
    expect(env['PATH']).toBe('C:\bin');
    expect(env['COMSPEC']).toBe('cmd.exe');
  });

  it('turns mail off by default', () => {
    // The desktop has no mail transport. The dev .env points at a Mailpit
    // container that does not exist inside the app, and with QUEUE=sync a
    // Mailable sends inline — so a registration would 500 on an unreachable
    // SMTP host. `log` is the epic's stated default (#1218); BYO-SMTP is a
    // follow-up, not this milestone.
    expect(buildPhpEnv(opts, {})['MAIL_MAILER']).toBe('log');
  });
});

describe('buildPhpEnv — desktop application profile', () => {
  const opts = { port: 1, databasePath: 'x', rendererOrigin: 'app://bundle' };

  it('runs as production with debug off', () => {
    // A desktop build is production for its user. Diagnostics go to the log
    // the supervisor surfaces on failure, never into a 500 body — and the
    // dev checkout's local/true in server/.env must not leak into the app.
    const env = buildPhpEnv(opts, {});

    expect(env['APP_ENV']).toBe('production');
    expect(env['APP_DEBUG']).toBe('false');
    expect(env['APP_NAME']).toBe('Budojo');
  });

  it('relocates storage/ when told to', () => {
    // Laravel honours LARAVEL_STORAGE_PATH natively (Application::storagePath).
    // The install directory is read-only; storage lives under userData.
    const env = buildPhpEnv({ ...opts, storagePath: 'C:\data\storage' }, {});

    expect(env['LARAVEL_STORAGE_PATH']).toBe('C:\data\storage');
  });

  it('leaves storage where it is when not told', () => {
    expect(buildPhpEnv(opts, {})).not.toHaveProperty('LARAVEL_STORAGE_PATH');
  });
});
