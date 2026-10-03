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
import { syncingDevices } from './folder';
import { JournalEntry } from './journal';
import { devicePath, ListedVersion, sameVersion, VersionRef, versionPath } from './layout';
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
 *    - **rebase:** the version in, staged with this device's kept writes set
 *      aside; the server replays them on it as it starts again (#2031 step 3),
 *      and the round pushes what the replay kept on top.
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
  /**
   * `PUT /sync/stage`: another device's database, for the shell to swap in.
   * With `rebase`, the server sets this device's kept journal aside first,
   * and replays it on that database once swapped in.
   */
  stage(database: Uint8Array, options?: { rebase: boolean }): Promise<void>;
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
  /**
   * Resolves only once the server serves the swapped-in database, so that
   * writes released after it land there (the phone's `restart()` waits for
   * the migrations, the reconcile and `/health`).
   */
  swapIn(): Promise<void>;
}

/** What this device remembers between rounds, kept on the device. */
export interface SyncLedger {
  /** The version its database came from or was published as; null before its first sync. */
  base: VersionRef | null;
  /** The newest of its own entries in a version it pushed, landed or not yet seen; null before its first push. */
  pushedThrough: string | null;
  /**
   * The newest of its own entries in a version **the folder has listed**: the
   * most the journal may ever be cleared through (protocol § `devices/`). A
   * push still in flight raises `pushedThrough` alone.
   */
  listedThrough: string | null;
  /**
   * Its latest push, while the journal still keeps entries of it or the folder
   * has not listed it yet (`decide.ts`).
   * Saved **before** the upload: a push whose answer was lost may have landed,
   * and is unconfirmed, never unpushed. `pushedAt` is Drive's time at the
   * first listing after it, null until then (protocol § Deciding).
   */
  unconfirmed: { version: VersionRef; parent: VersionRef | null; pushedAt: number | null } | null;
}

export const EMPTY_LEDGER: SyncLedger = {
  base: null,
  pushedThrough: null,
  listedThrough: null,
  unconfirmed: null,
};

/**
 * Everything one round needs. **What the caller owes it:**
 * - rounds on one device never overlap: one at a time;
 * - a staged database is always swapped in at the next start, as the phone's
 *   `StagedSwap` does, and a rebase's set-aside journal replayed on it: a
 *   fast-forward or a rebase saves its base once staged, before the swap, and
 *   relies on it.
 */
export interface SyncContext {
  device: string;
  /** The app version that writes a version (PRD § 5.5). */
  app: string;
  key: CryptoKey;
  remote: SyncRemote;
  server: SyncServer;
  shell: SyncShell;
  ledger: SyncLedger;
  /** Kept the moment it changes: a round that dies halfway must not forget a push that may have landed. */
  saveLedger(ledger: SyncLedger): void;
  /**
   * Runs `work` with this device's own writes held, and lets them through
   * after: the app's page is the only writer to its server. A fast-forward
   * checks the journal and swaps the database in under it, so no write lands
   * on the database about to be replaced. **It waits for the writes already
   * sent to finish before it runs `work`:** one that committed after the check
   * would be swapped away after the page showed it saved.
   */
  holdWrites<T>(work: () => Promise<T>): Promise<T>;
  /** This device's clock, for what it writes down: never for the lag, which runs on Drive's. */
  now(): number;
}

export type SyncOutcome =
  | { kind: 'nothing' }
  | { kind: 'pushed'; version: VersionRef }
  | { kind: 'pulled'; version: VersionRef }
  | { kind: 'wait' }
  | { kind: 'ask'; latest: VersionRef }
  /**
   * Its writes replayed on the other device's version, and pushed on top of
   * it (`pushed`); null when that version held every one of them already.
   */
  | { kind: 'rebased'; onto: VersionRef; pushed: VersionRef | null }
  /** A write landed while the round was deciding: nothing was swapped, and the next round decides again. */
  | { kind: 'retry' };

/** Every completed round says this too: the files this device still lacks after it. */
export interface SyncRound {
  outcome: SyncOutcome;
  missingFiles: number;
}

export async function syncOnce(context: SyncContext): Promise<SyncRound> {
  const { server, remote } = context;
  const listing = await remote.list('versions');
  if (Number.isNaN(listing.now)) {
    // The lag rule runs on Drive's clock alone: a device whose own clock is
    // wrong would rebase a push Drive has not listed yet, or wait for ever.
    throw new Error('Drive gave no time with its listing: the round is left for the next');
  }
  const now = listing.now;
  const versions = versionsIn(listing.files);
  let ledger = settlePush(context, versions, now);

  const kept = await server.journal();
  const unpushed = kept.filter(
    (entry) => ledger.pushedThrough === null || entry.id > ledger.pushedThrough,
  );
  const holdsAcademy = ledger.base === null ? await server.holdsAcademy() : false;

  await reportBeforeAnyVersion(context, ledger);

  const unconfirmed = ledger.unconfirmed;
  const decision: Decision = decide(
    {
      base: ledger.base,
      unpushed: ledger.base === null ? holdsAcademy : unpushed.length > 0,
      // Its push counts until every entry of it is cleared, **and** until it is
      // listed: a push that carried none (version 1, or one on an empty
      // folder) is still waited for, so a twin of the same number that lands
      // later never takes its place unseen.
      unconfirmed:
        unconfirmed !== null &&
        (kept.length > unpushed.length ||
          !versions.some((version) => sameVersion(version, unconfirmed.version)))
          ? { ...unconfirmed, pushedAt: unconfirmed.pushedAt ?? now }
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
        unpushedSince(kept, ledger),
        kept,
      );
      outcome = { kind: 'pushed', version: { seq: decision.seq, device: context.device } };
      break;
    case 'fast-forward': {
      const listed = versions.find((version) => sameVersion(version, decision.to)) as SeenVersion;
      const pulled = await fastForward(context, ledger, listed, kept);
      if (pulled === null) {
        outcome = { kind: 'retry' };
      } else {
        ledger = pulled;
        outcome = { kind: 'pulled', version: decision.to };
      }
      break;
    }
    case 'rebase':
      if (sameVersion(decision.onto, ledger.base)) {
        // Onto its own base: its push never showed up in the lag's time, and
        // nothing newer came. Its database is the base and its writes, so it
        // publishes them again on top (protocol § Deciding: "push again").
        ledger = await push(
          context,
          ledger,
          decision.onto.seq + 1,
          decision.onto,
          unpushedSince(kept, ledger),
          kept,
        );
        outcome = {
          kind: 'pushed',
          version: { seq: decision.onto.seq + 1, device: context.device },
        };
      } else {
        const listed = versions.find((version) =>
          sameVersion(version, decision.onto),
        ) as SeenVersion;
        const rebased = await rebase(context, listed);
        ledger = rebased.ledger;
        outcome = { kind: 'rebased', onto: decision.onto, pushed: rebased.pushed };
      }
      break;
    case 'ask':
      outcome = { kind: 'ask', latest: decision.latest };
      break;
    case 'wait':
      outcome = { kind: 'wait' };
      break;
    default:
      outcome = { kind: 'nothing' };
  }

  return finishRound(context, ledger, outcome);
}

/** The owner's answer when a round asked (PRD § 5.4, § 6.5): whose academy the folder carries on with. */
export type AskChoice = 'folder' | 'device';

/**
 * Carries out the owner's answer to `ask`: two academies, or a folder behind
 * this device. **Never merged** (§ 2):
 * - **`folder`:** this device takes the folder's latest version, as a
 *   fast-forward. What its database held goes, its journal with it: the owner
 *   chose so, knowing.
 * - **`device`:** this device publishes what it holds as a **first version of
 *   its own** (a new root), numbered above every version there, with every
 *   entry its journal keeps. Never on top of the folder's latest: the other
 *   device would then carry its own writes onto it, which is a merge. Meeting a
 *   line that is not its own, the other device asks in its turn, and its
 *   writes are never replayed into a gym they were not made in.
 *
 * **Only on the folder the owner was asked about.** If the latest moved since
 * (`seen`), nothing is done, and the round asks again on what is there now.
 */
export async function resolveAsk(
  context: SyncContext,
  choice: AskChoice,
  seen: VersionRef,
): Promise<SyncRound> {
  const { server, remote } = context;
  const listing = await remote.list('versions');
  if (Number.isNaN(listing.now)) {
    throw new Error('Drive gave no time with its listing: the round is left for the next');
  }
  const latest = latestVersion(versionsIn(listing.files));
  if (latest === null) {
    return { outcome: { kind: 'nothing' }, missingFiles: 0 };
  }
  if (!sameVersion(latest, seen)) {
    return {
      outcome: { kind: 'ask', latest: { seq: latest.seq, device: latest.device } },
      missingFiles: 0,
    };
  }
  const head: VersionRef = { seq: latest.seq, device: latest.device };
  let ledger = context.ledger;
  await reportBeforeAnyVersion(context, ledger);
  const kept = await server.journal();

  let outcome: SyncOutcome;
  if (choice === 'folder') {
    // What this device remembered describes the database it gives up.
    const pulled = await fastForward(context, EMPTY_LEDGER, latest, kept);
    if (pulled === null) {
      outcome = { kind: 'retry' };
    } else {
      ledger = pulled;
      outcome = { kind: 'pulled', version: head };
    }
  } else {
    const seq = Math.max(latest.seq, ledger.base?.seq ?? 0) + 1;
    ledger = await push(context, ledger, seq, null, kept, kept);
    outcome = { kind: 'pushed', version: { seq, device: context.device } };
  }
  return finishRound(context, ledger, outcome);
}

/** Every device has a report in the folder before it pushes or pulls a version (protocol § `devices/`). */
async function reportBeforeAnyVersion(context: SyncContext, ledger: SyncLedger): Promise<void> {
  if (!(await readReports(context)).some((report) => report.device === context.device)) {
    await writeReport(context, ledger);
  }
}

/** What every round does last, whatever it decided. */
async function finishRound(
  context: SyncContext,
  ledger: SyncLedger,
  outcome: SyncOutcome,
): Promise<SyncRound> {
  // Its report, after every round (protocol § `devices/`).
  await writeReport(context, ledger);
  await clearConfirmed(context, ledger, await readReports(context));
  // The files the database names and this device lacks, once the database is
  // final: after a fast-forward's swap, and at every later round for those
  // the folder did not have yet (`files.ts`).
  const missingFiles =
    ledger.base === null || outcome.kind === 'retry'
      ? 0
      : (await pullFiles(context.server.files, context.remote, context.key)).missing.length;
  return { outcome, missingFiles };
}

/**
 * A push's answer may be lost after the version landed. Its time starts at the
 * first listing after it; and listed on top of this device's base, it is the
 * device's base: the database was exported as that version, and every write
 * since is an entry the journal keeps as unpushed.
 */
function settlePush(
  context: SyncContext,
  versions: readonly SeenVersion[],
  now: number,
): SyncLedger {
  const ledger = context.ledger;
  const unconfirmed = ledger.unconfirmed;
  if (unconfirmed === null) {
    return ledger;
  }
  let next: SyncLedger = ledger;
  if (unconfirmed.pushedAt === null) {
    next = { ...next, unconfirmed: { ...unconfirmed, pushedAt: now } };
  }
  const onBase =
    (ledger.base === null && unconfirmed.parent === null) ||
    sameVersion(ledger.base, unconfirmed.parent);
  if (versions.some((version) => sameVersion(version, unconfirmed.version))) {
    // Listed: its entries are in a version the folder holds.
    next = { ...next, listedThrough: next.pushedThrough };
    if (onBase) {
      next = { ...next, base: unconfirmed.version };
    }
  }
  if (next !== ledger) {
    context.saveLedger(next);
  }
  return next;
}

/** The kept entries in no version the folder lists: what a push publishes again after one never landed. */
function unpushedSince(kept: JournalEntry[], ledger: SyncLedger): JournalEntry[] {
  return kept.filter((entry) => ledger.listedThrough === null || entry.id > ledger.listedThrough);
}

async function push(
  context: SyncContext,
  ledger: SyncLedger,
  seq: number,
  parent: VersionRef | null,
  unpushed: JournalEntry[],
  kept: JournalEntry[],
): Promise<SyncLedger> {
  const { server, remote, key } = context;
  const { database, schema } = await server.exportDatabase();
  const version: VersionRef = { seq, device: context.device };
  const path = versionPath({ ...version, parent });
  const plaintext = await packVersion(
    {
      protocol: PROTOCOL,
      seq,
      parent,
      device: context.device,
      schema,
      app: context.app,
      createdAt: new Date(context.now()).toISOString(),
    },
    unpushed,
    database,
  );
  // The files a version names go up before it: a device that pulls it then
  // finds every one of them, or waits for the rest at its next sync.
  await pushFiles(server.files, remote, key);
  // From here the version may land whatever the answer: kept as pushed and
  // unconfirmed before the upload, so a lost answer never makes it unpushed.
  const pending: SyncLedger = {
    ...ledger,
    pushedThrough: kept.length > 0 ? kept[kept.length - 1].id : ledger.pushedThrough,
    unconfirmed: { version, parent, pushedAt: null },
  };
  context.saveLedger(pending);
  await remote.write(path, await seal(key, path, plaintext));
  const landed: SyncLedger = { ...pending, base: version };
  context.saveLedger(landed);
  return landed;
}

/** The version's database, read, opened and checked. */
async function readVersion(context: SyncContext, listed: ListedVersion): Promise<Uint8Array> {
  const { remote, key } = context;
  const path = versionPath(listed);
  const sealed = await remote.read(path);
  if (sealed === null) {
    throw new Error(`the version ${path} went missing between the listing and the read`);
  }
  const unpacked = await unpackVersion(await open(key, path, sealed), listed);
  if (!unpacked.ok) {
    throw new Error(`the version ${path} does not read: ${unpacked.reason}`);
  }
  return unpacked.value.database;
}

/**
 * Pulls the version and swaps it in, with this device's writes held from the
 * last look at its journal to the swap: a write that landed since the round
 * decided means there is now something to carry, so nothing is swapped (null).
 */
async function fastForward(
  context: SyncContext,
  ledger: SyncLedger,
  listed: ListedVersion,
  kept: JournalEntry[],
): Promise<SyncLedger | null> {
  const { server, shell } = context;
  const database = await readVersion(context, listed);
  return context.holdWrites(async () => {
    const known = new Set(kept.map((entry) => entry.id));
    if ((await server.journal()).some((entry) => !known.has(entry.id))) {
      return null;
    }
    await server.stage(database);
    // Saved once staged, before the swap: from here the next start swaps the
    // staged database in whatever happens, so a device killed during the
    // restart wakes up as this version, and knows it.
    const next: SyncLedger = {
      ...ledger,
      base: { seq: listed.seq, device: listed.device },
      unconfirmed: null,
    };
    context.saveLedger(next);
    await shell.swapIn();
    return next;
  });
}

/**
 * Carries this device's writes onto the other device's version (#2031 step 3,
 * protocol § Rebase). The version is staged as a rebase: the server sets the
 * kept journal aside with it, and replays it on that database as it starts
 * again, before it serves. **Under the hold, as a fast-forward:** a write
 * the page sends meanwhile lands before the journal is set aside, never on
 * the database the swap replaces. No re-check is needed: a write that came
 * since the round decided is set aside with the rest.
 *
 * Then the round pushes what the replay kept: every entry it applied, found
 * already true, or turned into a conflict. One the version had dealt with
 * already is not kept, and when every one was, there is nothing to push.
 */
async function rebase(
  context: SyncContext,
  listed: ListedVersion,
): Promise<{ ledger: SyncLedger; pushed: VersionRef | null }> {
  const { server, shell } = context;
  const database = await readVersion(context, listed);
  const onto: VersionRef = { seq: listed.seq, device: listed.device };
  const rebased = await context.holdWrites(async () => {
    await server.stage(database, { rebase: true });
    // Saved once staged, as a fast-forward's base is: the next start swaps
    // it in and replays whatever happens. Every entry the replay keeps is in
    // no version on this line, so none counts as pushed or listed: a device
    // killed before the push below pushes them at its next round.
    const next: SyncLedger = { ...EMPTY_LEDGER, base: onto };
    context.saveLedger(next);
    await shell.swapIn();
    return next;
  });
  const replayed = await server.journal();
  if (replayed.length === 0) {
    return { ledger: rebased, pushed: null };
  }
  const seq = onto.seq + 1;
  return {
    ledger: await push(context, rebased, seq, onto, replayed, replayed),
    pushed: { seq, device: context.device },
  };
}

async function readReports(context: SyncContext): Promise<DeviceReport[]> {
  const { remote, key } = context;
  const reports: DeviceReport[] = [];
  const files = (await remote.list('devices')).files;
  // The two devices that sync: a refused third's report speaks for nobody.
  const syncing = syncingDevices(files);
  for (const file of files) {
    const device = /^devices\/([a-z0-9]+)\.bjs$/.exec(file.path)?.[1];
    if (device === undefined || !syncing.includes(device)) {
      continue;
    }
    const report = await openReport(key, file.path, await remote.read(file.path));
    // A report speaks for the device its path names, or counts as holding nothing.
    reports.push(report !== null && report.device === device ? report : unreadableReport(device));
  }
  return reports;
}

/** A report that does not open or parse counts as holding nothing (`devices.ts`). */
async function openReport(
  key: CryptoKey,
  path: string,
  sealed: Uint8Array | null,
): Promise<DeviceReport | null> {
  if (sealed === null) {
    return null;
  }
  try {
    const parsed = parseDeviceReport(await openJson(key, path, sealed));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
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
  // Only entries in a version the folder lists, whatever the reports say.
  const listedThrough = ledger.listedThrough;
  if (listedThrough === null) {
    return;
  }
  const confirmed = confirmedThrough(context.device, reports);
  if (confirmed === null) {
    return;
  }
  const through =
    confirmed === 'everything' || confirmed > listedThrough ? listedThrough : confirmed;
  await context.server.clearJournal(through);
  if (through === ledger.pushedThrough && ledger.unconfirmed !== null) {
    context.saveLedger({ ...ledger, unconfirmed: null });
  }
}
