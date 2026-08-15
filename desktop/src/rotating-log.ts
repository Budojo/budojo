import { createWriteStream, existsSync, renameSync, rmSync, statSync, type WriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Append-only log file with size-based rotation (`name.log`, `.1`, `.2`, …).
 *
 * Shared by the PHP supervisor and the scheduler tick: both run for as long as
 * the app does, both are chatty, and a desktop app has nobody trimming logs —
 * unbounded growth over months is the failure to design against.
 */
export class RotatingLog {
  private stream: WriteStream | null = null;
  private bytes = 0;

  constructor(
    readonly filePath: string,
    private readonly options: { maxBytes: number; keep: number } = { maxBytes: 5 * 1024 * 1024, keep: 3 },
  ) {}

  open(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.rotateIfOver();
    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.bytes = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
  }

  /** Appends `text`, adding a trailing newline if missing. Safe to call before open() (dropped). */
  write(text: string): void {
    if (this.stream === null) {
      return;
    }

    const line = text.endsWith('\n') ? text : `${text}\n`;
    this.stream.write(line);
    this.bytes += Buffer.byteLength(line);

    if (this.bytes > this.options.maxBytes) {
      this.reopenRotated();
    }
  }

  close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;

    if (stream === null) {
      return Promise.resolve();
    }

    return new Promise((resolve) => stream.end(() => resolve()));
  }

  private reopenRotated(): void {
    const stream = this.stream;
    this.stream = null;
    stream?.end();
    this.rotate();
    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.bytes = 0;
  }

  private rotateIfOver(): void {
    if (existsSync(this.filePath) && statSync(this.filePath).size >= this.options.maxBytes) {
      this.rotate();
    }
  }

  private rotate(): void {
    for (let index = this.options.keep - 1; index >= 1; index--) {
      const from = `${this.filePath}.${index}`;
      const to = `${this.filePath}.${index + 1}`;

      if (existsSync(from)) {
        rmSync(to, { force: true });
        renameSync(from, to);
      }
    }

    if (existsSync(this.filePath)) {
      renameSync(this.filePath, `${this.filePath}.1`);
    }
  }
}
