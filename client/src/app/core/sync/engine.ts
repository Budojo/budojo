import { utf8 } from './bytes';
import { decide, Decision, latestVersion, SeenVersion, versionsIn } from './decide';
import {
  confirmedThrough,
  DeviceReport,
  parseDeviceReport,
  serializeDeviceReport,
  unreadableReport,
} from './devices';
import { open, openJson, seal } from './envelope';
import { pullFiles, pushFiles, SyncFilesApi } from './files';
import { JournalEntry } from './journal';
import { devicePath, ListedVersion, VersionRef, versionPath } from './layout';
import { SyncRemote } from './remote';
import { packVersion, PROTOCOL, unpackVersion } from './version';

/**
 * One sync round between this device and the folder (PRD § 5.2,
 * `docs/sync/protocol.md` § Deciding), the same code on the phone and the PC
 * (§ 5.6). What a round does:
 * 1. **Decides** from the folder's versions and what this device keeps (`decide.ts`).
 * 2. **Acts:**
 *    - **push:** files, then the version;
 *    - **fast-forward:** the version in, swapped by the shell, then the files;
 *    - **rebase:** not yet. The server's replay is #2031's step 3, and until
 *      then the round says so and changes nothing.
 * 3. **Reports** what this device holds (`devices/`), and clears from its
 *    journal what every other device reports holding.
 *
 * **The rule it keeps: a device never drops a write of its own silently.** A
 * fast-forward happens only with nothing to carry, and the journal loses an
 * entry only once every other device holds it.
 */

/** This device's own server: the database, the journal and the files, over its API. */
export interface SyncServer {
  /** `GET /sync/export`: the database, and the newest migration it has run. */
  exportDatabase(): Promise<{ database: Uint8Array; schema: string }>;
  /** `PUT /sync/stage`: another device's database, for the shell to swap in. */
  stage(database: Uint8Array): Promise<void>;
  /** `GET /sync/journal`: this device's kept entries, oldest first. */
  journal(): Promise<JournalEntry[]>;
  /** `DELETE /sync/journal?through=`: clears up to what every other device holds. */
  clearJournal(through: string): Promise<void>;
  /** `GET /sync/holds`: per device, the newest of its entries this database holds. */
  holds(): Promise<Record<string, string>>;
  /** Whether the database holds an academy: one never synced, holding one, is pushed as version 1. */
  holdsAcademy(): Promise<boolean>;
  files: SyncFilesApi;
}

/** What only the shell can do: swap a staged database in, by restarting the server. */
export interface SyncShell {
  swapIn(): Promise<void>;
}

/** What this device remembers between rounds, kept on the device. */
export interface SyncLedger {
  /** The version its database came from or was published as; null before its first sync. */
  base: VersionRef | null;
  /** The newest of its own entries in a version it pushed; null before its first push. */
  pushedThrough: string | null;
  /** Its latest push, while the journal still keeps entries of it (`decide.ts`). */
  unconfirmed: { version: VersionRef; parent: VersionRef | null; pushedAt: number } | null;
}

export const EMPTY_LEDGER: SyncLedger = { base: null, pushedThrough: null, unconfirmed: null };

export interface SyncContext {
  device: string;
  /** The app version that writes a version (PRD § 5.5). */
  app: string;
  key: CryptoKey;
  remote: SyncRemote;
  server: SyncServer;
  shell: SyncShell;
  ledger: SyncLedger;
  /** Kept the moment it changes: a round that dies halfway must not forget a push that landed. */
  saveLedger(ledger: SyncLedger): void;
  now(): number;
}

export type SyncOutcome =
  | { kind: 'nothing' }
  | { kind: 'pushed'; version: VersionRef }
  | { kind: 'pulled'; version: VersionRef; missingFiles: number }
  | { kind: 'wait' }
  | { kind: 'ask'; latest: VersionRef }
  | { kind: 'needs-rebase'; onto: VersionRef };

export async function syncOnce(context: SyncContext): Promise<SyncOutcome> {
  const { server, remote } = context;
  let ledger = context.ledger;
  const kept = await server.journal();
  const unpushedEntries = kept.filter(
    (entry) => ledger.pushedThrough === null || entry.id > ledger.pushedThrough,
  );
  const holdsAcademy = ledger.base === null ? await server.holdsAcademy() : false;
  const listing = await remote.list('versions');
  const versions = versionsIn(listing.files);
  const now = Number.isNaN(listing.now) ? context.now() : listing.now;

  // Every device has a report in the folder before it pushes or pulls a version.
  const reports = await readReports(context);
  if (!reports.some((report) => report.device === context.device)) {
    await writeReport(context, ledger);
  }

  const decision: Decision = decide(
    {
      base: ledger.base,
      unpushed: ledger.base === null ? holdsAcademy : unpushedEntries.length > 0,
      unconfirmed: kept.some((entry) => !unpushedEntries.includes(entry))
        ? ledger.unconfirmed
        : null,
    },
    versions,
    now,
  );

  let outcome: SyncOutcome;
  switch (decision.kind) {
    case 'push':
      ledger = await push(
        context,
        ledger,
        decision.seq,
        decision.parent,
        unpushedEntries,
        kept,
        now,
      );
      outcome = { kind: 'pushed', version: { seq: decision.seq, device: context.device } };
      break;
    case 'fast-forward': {
      const listed = versions.find(
        (version) => version.seq === decision.to.seq && version.device === decision.to.device,
      );
      const pulled = await fastForward(context, listed ?? (latestVersion(versions) as SeenVersion));
      ledger = { ...ledger, base: decision.to, unconfirmed: null };
      context.saveLedger(ledger);
      outcome = { kind: 'pulled', version: decision.to, missingFiles: pulled.missing };
      break;
    }
    case 'rebase':
      return { kind: 'needs-rebase', onto: decision.onto };
    case 'ask':
      return { kind: 'ask', latest: decision.latest };
    case 'wait':
      return { kind: 'wait' };
    default:
      outcome = { kind: 'nothing' };
  }

  await writeReport(context, ledger);
  await clearConfirmed(context, ledger, await readReports(context));
  return outcome;
}

async function push(
  context: SyncContext,
  ledger: SyncLedger,
  seq: number,
  parent: VersionRef | null,
  unpushed: JournalEntry[],
  kept: JournalEntry[],
  now: number,
): Promise<SyncLedger> {
  const { server, remote, key } = context;
  const { database, schema } = await server.exportDatabase();
  const listed: ListedVersion = { seq, device: context.device, parent };
  const path = versionPath(listed);
  const plaintext = await packVersion(
    {
      protocol: PROTOCOL,
      seq,
      parent,
      device: context.device,
      schema,
      app: context.app,
      createdAt: new Date(now).toISOString(),
    },
    unpushed,
    database,
  );
  // The files a version names go up before it: a device that pulls it then
  // finds every one of them, or waits for the rest at its next sync.
  await pushFiles(server.files, remote, key);
  await remote.write(path, await seal(key, path, plaintext));
  const newest = kept.length > 0 ? kept[kept.length - 1].id : ledger.pushedThrough;
  const next: SyncLedger = {
    base: { seq, device: context.device },
    pushedThrough: newest,
    unconfirmed: { version: { seq, device: context.device }, parent, pushedAt: now },
  };
  context.saveLedger(next);
  return next;
}

async function fastForward(
  context: SyncContext,
  listed: ListedVersion,
): Promise<{ missing: number }> {
  const { server, remote, key, shell } = context;
  const path = versionPath(listed);
  const sealed = await remote.read(path);
  if (sealed === null) {
    throw new Error(`the version ${path} went missing between the listing and the read`);
  }
  const unpacked = await unpackVersion(await open(key, path, sealed), listed);
  if (!unpacked.ok) {
    throw new Error(`the version ${path} does not read: ${unpacked.reason}`);
  }
  await server.stage(unpacked.value.database);
  await shell.swapIn();
  // Once the database is final: after the swap (`files.ts`).
  const files = await pullFiles(server.files, remote, key);
  return { missing: files.missing.length };
}

async function readReports(context: SyncContext): Promise<DeviceReport[]> {
  const { remote, key } = context;
  const reports: DeviceReport[] = [];
  for (const file of (await remote.list('devices')).files) {
    const device = /^devices\/([a-z0-9]+)\.bjs$/.exec(file.path)?.[1];
    if (device === undefined) {
      continue;
    }
    const sealed = await remote.read(file.path);
    let parsed: ReturnType<typeof parseDeviceReport> | null = null;
    try {
      parsed = sealed === null ? null : parseDeviceReport(await openJson(key, file.path, sealed));
    } catch {
      parsed = null;
    }
    reports.push(parsed !== null && parsed.ok ? parsed.value : unreadableReport(device));
  }
  return reports;
}

async function writeReport(context: SyncContext, ledger: SyncLedger): Promise<void> {
  const report: DeviceReport = {
    device: context.device,
    base: ledger.base,
    holds: await context.server.holds(),
    at: new Date(context.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  const path = devicePath(context.device);
  await context.remote.write(
    path,
    await seal(context.key, path, utf8(JSON.stringify(serializeDeviceReport(report)))),
  );
}

/**
 * Clears from the journal the pushed entries every other device holds. Never
 * one still unpushed: those are in no version yet.
 */
async function clearConfirmed(
  context: SyncContext,
  ledger: SyncLedger,
  reports: DeviceReport[],
): Promise<void> {
  const pushedThrough = ledger.pushedThrough;
  if (pushedThrough === null) {
    return;
  }
  const confirmed = confirmedThrough(context.device, reports);
  if (confirmed === null) {
    return;
  }
  const through =
    confirmed === 'everything' || confirmed > pushedThrough ? pushedThrough : confirmed;
  await context.server.clearJournal(through);
  if (through === pushedThrough && ledger.unconfirmed !== null) {
    context.saveLedger({ ...ledger, unconfirmed: null });
  }
}
