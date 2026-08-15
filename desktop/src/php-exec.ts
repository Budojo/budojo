import { spawn } from 'node:child_process';

/**
 * Runs the bundled php.exe to completion and returns its exit code and
 * combined output. Used for everything that is not the long-lived server:
 * artisan during bootstrap (#1223), the scheduler tick (#1226), snapshots.
 *
 * Same discipline as the supervisor's spawn: no shell (the pid is php.exe's
 * own), hidden console window, our php.ini via -c, the caller's whitelisted
 * environment.
 */
export interface PhpExecOptions {
  phpBinary: string;
  iniPath: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs?: number;
}

export interface PhpExecResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

export function runPhp(options: PhpExecOptions): Promise<PhpExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.phpBinary, ['-c', options.iniPath, ...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    let output = '';
    let timedOut = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? 120_000);

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}
