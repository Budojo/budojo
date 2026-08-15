/**
 * Native OS notifications for the desktop (#1225, M11 #1218).
 *
 * The server writes owner alerts to the `notifications` table (that is the
 * bell); this module turns each new row into one Windows toast, exactly once,
 * across restarts. Delivery state is the shell's, not the server's — the same
 * split as `php-server.pid`: the server owns content and history, the shell
 * owns what has reached the screen. No schema change, no auth surface.
 *
 * `planDelivery` is pure and unit-tested; `DesktopNotifier` wires it to an
 * injected lister (the artisan command), an injected presenter (Electron's
 * Notification) and an injected ledger store (a JSON file under userData).
 */

export interface PendingNotification {
  id: string;
  created_at: string;
  title: string;
  body: string;
  link: string;
  kind: string;
}

export interface DeliveryLedger {
  /** ISO instant of the newest row ever seen; the next query asks for rows after (this - 1s). */
  watermark: string | null;
  /** Ids already shown, newest last, capped — the dedupe for rows sharing the watermark second. */
  delivered: string[];
}

export const EMPTY_LEDGER: DeliveryLedger = { watermark: null, delivered: [] };

const LEDGER_CAP = 500;

/**
 * Splits fetched rows into the ones to show and the ledger to persist after
 * showing them. Rows already in the ledger are skipped; the watermark advances
 * to the newest row seen; the delivered list keeps the last 500 ids.
 */
export function planDelivery(
  rows: readonly PendingNotification[],
  ledger: DeliveryLedger,
): { toDeliver: PendingNotification[]; nextLedger: DeliveryLedger } {
  const seen = new Set(ledger.delivered);
  const toDeliver = rows.filter((row) => !seen.has(row.id));

  let watermark = ledger.watermark;
  for (const row of rows) {
    if (watermark === null || Date.parse(row.created_at) > Date.parse(watermark)) {
      watermark = row.created_at;
    }
  }

  const delivered = [...ledger.delivered, ...toDeliver.map((row) => row.id)].slice(-LEDGER_CAP);

  return { toDeliver, nextLedger: { watermark, delivered } };
}

/**
 * The instant to query from: one second before the watermark, so a row
 * committed in the same second after the previous poll is not lost — the
 * delivered list absorbs the overlap. First run: 24 hours back, so a reminder
 * that landed while the app was closed still shows on the next launch, but a
 * year of history does not.
 */
export function queryAfter(ledger: DeliveryLedger, now: Date): string {
  if (ledger.watermark === null) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date(Date.parse(ledger.watermark) - 1000).toISOString();
}

export interface DesktopNotifierOptions {
  /** Runs `budojo:list-desktop-notifications --after=<iso>` and parses its JSON. */
  list: (afterIso: string) => Promise<PendingNotification[]>;
  /** Shows one OS notification; the click handler navigates to `link`. */
  show: (notification: PendingNotification) => void;
  ledger: { read: () => Promise<DeliveryLedger>; write: (ledger: DeliveryLedger) => Promise<void> };
  log: (line: string) => void;
  now?: () => Date;
}

export class DesktopNotifier {
  private readonly now: () => Date;

  constructor(private readonly options: DesktopNotifierOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** One poll: fetch, plan, show, persist. Returns how many were shown. */
  async poll(): Promise<number> {
    const ledger = await this.options.ledger.read();
    const rows = await this.options.list(queryAfter(ledger, this.now()));
    const { toDeliver, nextLedger } = planDelivery(rows, ledger);

    for (const notification of toDeliver) {
      this.options.show(notification);
    }

    // Persist even when nothing was shown: the watermark still moved.
    if (toDeliver.length > 0 || nextLedger.watermark !== ledger.watermark) {
      await this.options.ledger.write(nextLedger);
    }

    if (toDeliver.length > 0) {
      this.options.log(`[notifier] showed ${toDeliver.length} notification(s): ${toDeliver.map((n) => n.kind || n.id).join(', ')}`);
    }

    return toDeliver.length;
  }
}

/**
 * Parses the artisan command's stdout. The command prints exactly one JSON
 * array, but PHP can prepend a warning line; the last line that parses as an
 * array wins, and anything else is an empty poll rather than a crash.
 */
export function parseListOutput(output: string): PendingNotification[] {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('['));

  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      const parsed: unknown = JSON.parse(lines[index] ?? '');
      if (Array.isArray(parsed)) {
        return parsed.filter(isPendingNotification);
      }
    } catch {
      // try the previous candidate line
    }
  }

  return [];
}

function isPendingNotification(value: unknown): value is PendingNotification {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;

  return (
    typeof record['id'] === 'string' &&
    typeof record['created_at'] === 'string' &&
    typeof record['title'] === 'string' &&
    typeof record['body'] === 'string' &&
    typeof record['link'] === 'string' &&
    typeof record['kind'] === 'string'
  );
}
