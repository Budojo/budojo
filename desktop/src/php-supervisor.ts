import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import { buildServeInvocation, RestartBudget } from './php-runtime.js';
import { RotatingLog } from './rotating-log.js';

/**
 * Runs the bundled PHP built-in server as a supervised child of the Electron
 * main process (#1222, M11 #1218). This is what removes Docker from the
 * runtime — and the piece most likely to strand the app half-broken, so it is
 * a supervisor rather than a fire-and-forget spawn:
 *
 *  - picks a free loopback port instead of assuming 8000 is available;
 *  - waits for `/api/v1/health` before anyone gets a window, and fails into a
 *    real error (with the log tail) rather than a blank renderer;
 *  - restarts a crashed server, but stops after a few crashes in a short
 *    window so a boot loop becomes a message instead of a spinning fan;
 *  - kills the whole process tree on quit, and on the next launch reaps any
 *    php.exe a hard crash left behind holding the SQLite file;
 *  - rotates its own log so a chatty server cannot fill the disk over months.
 */

export interface PhpSupervisorConfig {
  phpBinary: string;
  serverRoot: string;
  /** Written fresh on every start; see buildPhpIni. */
  iniPath: string;
  iniContent: string;
  logDir: string;
  pidFile: string;
  /** Environment for the child once the port is known — see buildPhpEnv. */
  envForPort: (port: number) => Record<string, string>;
  readinessPath?: string;
  readinessTimeoutMs?: number;
  restart?: { maxRestarts: number; windowMs: number };
  /**
   * Laravel's own log. With display_errors off, the reason a request 500s
   * lives here and nowhere else — the server's stdout only shows "[500]".
   * Its tail is appended to every failure message so the user (or the bug
   * report) sees the actual exception, not just that one happened.
   */
  appLogPath?: string;
  /** Called once when supervision gives up; the app should surface it and exit. */
  onFatal: (error: Error, context: { logPath: string; recentOutput: string }) => void;
  /** Optional hook for tests / debugging. */
  onEvent?: (event: SupervisorEvent) => void;
}

export type SupervisorEvent =
  | { type: 'spawned'; pid: number; port: number; attempt: number }
  | { type: 'ready'; port: number; elapsedMs: number }
  | { type: 'exited'; code: number | null; signal: NodeJS.Signals | null; willRestart: boolean }
  | { type: 'restarting'; port: number }
  | { type: 'stopped' };

const DEFAULTS = {
  readinessPath: '/api/v1/health',
  readinessTimeoutMs: 30_000,
  restart: { maxRestarts: 3, windowMs: 60_000 },
  probeIntervalMs: 150,
  logMaxBytes: 5 * 1024 * 1024,
  logKeep: 3,
  recentLines: 60,
  stopGraceMs: 5_000,
} as const;

export class PhpSupervisor {
  private child: ChildProcess | null = null;
  private currentPort: number | null = null;
  private stopping = false;
  private fatal = false;
  private readonly budget: RestartBudget;
  private readonly recent: string[] = [];
  private readonly file: RotatingLog;

  constructor(private readonly config: PhpSupervisorConfig) {
    this.budget = new RestartBudget(config.restart ?? DEFAULTS.restart);
    this.file = new RotatingLog(path.join(config.logDir, 'php-server.log'), { maxBytes: DEFAULTS.logMaxBytes, keep: DEFAULTS.logKeep });
  }

  get port(): number | null {
    return this.currentPort;
  }

  get logPath(): string {
    return this.file.filePath;
  }

  async start(): Promise<{ port: number }> {
    await mkdir(this.config.logDir, { recursive: true });
    await mkdir(path.dirname(this.config.iniPath), { recursive: true });
    this.file.open();
    await this.reapStalePid();
    await writeFile(this.config.iniPath, this.config.iniContent, 'utf8');

    // A port that was free a millisecond ago can be taken by the time PHP
    // binds it. Rare, but "the app shows a blank screen" is not an acceptable
    // way for that to surface, so try a few.
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const port = await pickFreePort();

      try {
        await this.spawnAndAwaitReadiness(port, attempt);
        this.currentPort = port;

        return { port };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!/address already in use|EADDRINUSE|Failed to listen/i.test(lastError.message)) {
          break;
        }
        this.log(`[supervisor] port ${port} was taken between pick and bind, retrying`);
      }
    }

    await this.file.close();
    throw lastError ?? new Error('PHP server failed to start');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;

    if (child !== null && child.exitCode === null && child.signalCode === null) {
      await this.killAndWait(child);
    }

    this.child = null;
    this.currentPort = null;
    await rm(this.config.pidFile, { force: true });
    await this.file.close();
    this.config.onEvent?.({ type: 'stopped' });
  }

  // ---------------------------------------------------------------------------

  private async spawnAndAwaitReadiness(port: number, attempt: number): Promise<void> {
    const startedAt = Date.now();
    const child = this.spawnPhp(port, attempt);

    // The child exiting before it is ready is the fast-fail path: no point
    // polling for 30 seconds against a process that is already gone.
    const exited = new Promise<never>((_, reject) => {
      child.once('exit', (code, signal) => {
        reject(
          new Error(
            `PHP server exited during startup (code ${code ?? 'null'}, signal ${signal ?? 'null'}). ` +
              `Last output:\n${this.recentOutput()}`,
          ),
        );
      });
    });

    await Promise.race([this.awaitReadiness(port), exited]);

    child.removeAllListeners('exit');
    child.on('exit', (code, signal) => this.handleUnexpectedExit(code, signal));

    this.config.onEvent?.({ type: 'ready', port, elapsedMs: Date.now() - startedAt });
  }

  private spawnPhp(port: number, attempt: number): ChildProcess {
    const { args, cwd } = buildServeInvocation({
      port,
      iniPath: this.config.iniPath,
      serverRoot: this.config.serverRoot,
    });

    const child = spawn(this.config.phpBinary, args, {
      cwd,
      env: this.config.envForPort(port),
      stdio: ['ignore', 'pipe', 'pipe'],
      // No shell: the pid must be php.exe itself, not a cmd.exe wrapper whose
      // death would orphan the server. No console window either.
      shell: false,
      windowsHide: true,
    });

    child.stdout?.on('data', (chunk: Buffer) => this.log(chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => this.log(chunk.toString('utf8')));

    this.child = child;

    if (child.pid !== undefined) {
      void writeFile(this.config.pidFile, String(child.pid), 'utf8');
      this.config.onEvent?.({ type: 'spawned', pid: child.pid, port, attempt });
    }

    return child;
  }

  private async awaitReadiness(port: number): Promise<void> {
    const timeoutMs = this.config.readinessTimeoutMs ?? DEFAULTS.readinessTimeoutMs;
    const readinessPath = this.config.readinessPath ?? DEFAULTS.readinessPath;
    const deadline = Date.now() + timeoutMs;
    let lastStatus: string = 'no response';

    while (Date.now() < deadline) {
      const status = await probe(port, readinessPath);

      if (status === 200) {
        return;
      }

      lastStatus = String(status);
      await sleep(DEFAULTS.probeIntervalMs);
    }

    throw new Error(
      `PHP server did not become ready within ${timeoutMs}ms (last probe: ${lastStatus}). ` +
        `Last output:\n${this.recentOutput()}`,
    );
  }

  private handleUnexpectedExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.stopping || this.fatal) {
      return;
    }

    const port = this.currentPort;
    const willRestart = port !== null && this.budget.allow(Date.now());

    this.log(`[supervisor] PHP server exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'})`);
    this.config.onEvent?.({ type: 'exited', code, signal, willRestart });

    if (!willRestart || port === null) {
      this.fatal = true;
      this.config.onFatal(
        new Error('PHP server keeps crashing; giving up after repeated restarts.'),
        { logPath: this.logPath, recentOutput: this.recentOutput() },
      );

      return;
    }

    // Same port on purpose: the renderer learned it at boot and cannot be told
    // otherwise without a reload. It was ours a moment ago, and the dead
    // process no longer holds it.
    this.config.onEvent?.({ type: 'restarting', port });

    void this.spawnAndAwaitReadiness(port, 1).catch((error: unknown) => {
      this.fatal = true;
      this.config.onFatal(error instanceof Error ? error : new Error(String(error)), {
        logPath: this.logPath,
        recentOutput: this.recentOutput(),
      });
    });
  }

  private async killAndWait(child: ChildProcess): Promise<void> {
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();

        return;
      }
      child.once('exit', () => resolve());
    });

    killTree(child);

    await Promise.race([exited, sleep(DEFAULTS.stopGraceMs)]);
  }

  /**
   * A hard crash of Electron itself cannot run `stop()`. The pid file lets the
   * next launch find the php.exe that survived — checked by image name, so a
   * pid the OS has since handed to something else is never touched.
   */
  private async reapStalePid(): Promise<void> {
    if (!existsSync(this.config.pidFile)) {
      return;
    }

    const raw = (await readFile(this.config.pidFile, 'utf8')).trim();
    const pid = Number.parseInt(raw, 10);
    await rm(this.config.pidFile, { force: true });

    if (!Number.isInteger(pid) || pid <= 0) {
      return;
    }

    if (isPhpProcess(pid)) {
      this.log(`[supervisor] reaping stale php.exe ${pid} from a previous run`);
      killPid(pid);
    }
  }

  // --- logging ---------------------------------------------------------------

  private log(text: string): void {
    for (const line of text.split(/\r?\n/)) {
      if (line.length === 0) {
        continue;
      }
      this.recent.push(line);
      if (this.recent.length > DEFAULTS.recentLines) {
        this.recent.shift();
      }
    }

    this.file.write(text);
  }

  private recentOutput(): string {
    const server = this.recent.slice(-20).join('\n');
    const app = this.appLogTail();

    return app.length === 0 ? server : `${server}\n--- laravel.log ---\n${app}`;
  }

  /**
   * The last few *entries* of Laravel's log, each cut to its opening lines.
   *
   * Entries, not lines: a single logged exception is 40-60 lines of stack
   * trace, so a line-based tail shows `#16 {main}` and never the message. Read
   * from the end of the file without loading it — laravel.log grows for years.
   */
  private appLogTail(): string {
    const file = this.config.appLogPath;

    if (file === undefined || !existsSync(file)) {
      return '';
    }

    try {
      const size = statSync(file).size;
      const window = 64 * 1024;
      const buffer = Buffer.alloc(Math.min(size, window));
      const fd = openSync(file, 'r');
      readSync(fd, buffer, 0, buffer.length, Math.max(0, size - window));
      closeSync(fd);

      const entries: string[][] = [];
      for (const line of buffer.toString('utf8').split(/\r?\n/)) {
        if (/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/.test(line)) {
          entries.push([line]);
        } else if (entries.length > 0 && line.length > 0) {
          entries[entries.length - 1]?.push(line);
        }
      }

      return entries
        .slice(-3)
        .map((entry) => {
          const head = entry.slice(0, 4).join('\n');

          return entry.length > 4 ? `${head}\n  … (${entry.length - 4} more lines)` : head;
        })
        .join('\n');
    } catch {
      return '';
    }
  }
}

// --- process helpers ---------------------------------------------------------

/**
 * Bind port 0 on loopback, read what the OS assigned, release it. There is a
 * window between release and PHP's own bind; the caller retries on collision.
 */
export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('could not determine a free port'));

        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function probe(port: number, requestPath: string): Promise<number | 'error'> {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: requestPath, timeout: 1_000, headers: { Accept: 'application/json' } },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 'error');
      },
    );

    request.on('timeout', () => {
      request.destroy();
      resolve('error');
    });
    request.on('error', () => resolve('error'));
  });
}

/**
 * On Windows `child.kill()` only reaches the direct child. php -S has no
 * children of its own, but application code could spawn one, and an orphan
 * holding the SQLite WAL is the exact bug this module exists to prevent —
 * so the whole tree goes.
 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    killPid(child.pid);

    return;
  }

  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, DEFAULTS.stopGraceMs).unref();
}

function killPid(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });

    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

function isPhpProcess(pid: number): boolean {
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 0);

      return true;
    } catch {
      return false;
    }
  }

  const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
    windowsHide: true,
    encoding: 'utf8',
  });

  return /"php\.exe"/i.test(result.stdout ?? '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
