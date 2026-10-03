# The sync protocol, version 2

How two devices of one academy share their data through the owner's Google Drive (M12, [PRD § 5](../specs/m12-mat-app.md#5-how-it-works), [#2029](https://github.com/Budojo/budojo/issues/2029)). This page is the contract: the TypeScript in `client/src/app/core/sync/` implements it, and the server's journal (#2031) must write entries that match it.

**The protocol runs in the app on both devices** (PRD § 5.6). The PC's main process and the phone's shell only supply Drive, the database file and the key store.

## Scope: two devices

**Protocol 2 is for an academy's two devices: the PC and the phone** (M12, PRD § 2). Six rounds of review (#2061) found no input that loses a write between two devices. That holds as long as:
- the rules below are kept;
- the engines treat a push whose answer was lost as unconfirmed;
- Drive's listing lags by less than the 10 minutes a device waits for its own push;
- **a database changes only through its own writes, a fast-forward or a rebase.** A device's report says what its database holds, and a database put back in time breaks that silently. The desktop's Restore (Data & backup) on a paired PC does exactly that, so #2032 refuses it there, or treats the result as an academy of its own, which asks the owner.

**A third device**, the tablet at the door (PRD § 11), is not covered. It can adopt the version that will lose a same-number race before it sees the winner. Then:
- its kept entries can name another device's rows by numbers that mean someone else on the winning line;
- a report it wrote can claim entries its database later drops.

A third device needs the protocol to map rows across every device's entries, and reports that cannot go back, before it is allowed. A device refuses to pair when the folder already has two.

## The folder

```
Budojo/                                          the folder the PC creates for its backups (#1301)
  sync/
    folder.bjs                                   the folder's id, sealed under the sync key
    versions/000001-pc4f2a.root.bjs              the academy's first version
    versions/000045-phone9c1e.000044-pc4f2a.bjs  version 45 by the phone, on top of 44 by the PC
    files/<sha256>.bjs                           a document or photo, named by its content
    devices/pc4f2a.bjs                           what one device last saw and sent
```

- **The keys are not in the folder:** they live in the account's hidden application data (§ The keys).
- **Device id:** a kind (2–8 lowercase letters) and 4 random characters, `pc4f2a`, `phone9c1e`. It is made once, when the device joins (§ Joining).
- **Sequence numbers** are six digits, from `000001`.
- **A version's name carries its parent**, so the history can be read from the listing, with no database downloaded. The name is the associated data too, so the parent cannot be changed.
- **Two devices can push the same number at once.** The names still differ, so both files exist. **The latest version** is the highest number. Between two of the same number, it is the one Drive created first (its `createdTime`, on Drive's clock), so a twin that lands later never takes the number. The lower device id breaks a tie in the same millisecond.
- **Nothing outside this layout** is ever written. A remote refuses any other path, folder by folder: a numbered version with its parent, a SHA-256, a device id.

## The envelope: every file

```
"BJS2" (4 bytes) | IV (12 bytes, random per file) | AES-256-GCM( gzip(plaintext) ) with its 16-byte tag
```

- **Key:** the academy's 32-byte sync key.
- **Associated data:** the file's path in the folder, UTF-8, for example `versions/000042-pc4f2a.000041-pc4f2a.bjs`. A file moved or renamed does not open.
- **Failures:** «not an envelope» (no `BJS2`, or too short), «wrong key or path» (the GCM tag fails: GCM cannot tell which), «corrupt» (it decrypts but does not gunzip or parse).
- **Known-answer vectors:** `client/src/app/core/sync/vectors/envelope-vectors.json`, made with Node's crypto and zlib (`make-envelope-vectors.mjs`). The WebCrypto implementation reproduces them byte for byte.

## A version

The plaintext inside a version's envelope:

```
u32 big-endian: manifest length | manifest, UTF-8 JSON | u32: journal length | journal, UTF-8 JSON | the SQLite database
```

**The manifest:**

| Field | |
|---|---|
| `protocol` | `2` |
| `seq` | this version's number |
| `parent` | the version it was made on top of, `{ "seq": 44, "device": "pc4f2a" }`, as its file name says; `null` for the academy's first |
| `device` | the device that wrote it |
| `schema` | the newest migration the database has run, `2026_09_28_120000_…`. A device never opens a newer one (PRD § 5.5). |
| `app` | the app version that wrote it |
| `journalSha256` | SHA-256 of the journal's bytes as stored |
| `createdAt` | UTC, ISO 8601 |
| `academy` | optional, from #2033: what the door shows before a restore, `{ "name": "Kaizen", "athletes": 42, "belts": { "white": 20, "blue": 12 } }` (active athletes, by belt) |

A reader checks every field it knows and ignores any it does not, so a later app can add one. **Changing what a field means is a new protocol number.** The manifest must name the version and the parent its path names. A writer checks the manifest and the journal with the readers' rules before it packs them.

### The database side (#2030)

The app packs and seals versions. The server only hands it the database and takes one back (owner-only, the `sync` capability):
- **`GET /api/v1/sync/export`:** the database as one SQLite file, taken with `VACUUM INTO`. `X-Budojo-Schema` names its newest migration, which the manifest records as `schema`.
- **`PUT /api/v1/sync/stage`:** another device's database, for a fast-forward or after a rebase.
  - **Checked before anything is written:** a SQLite file, undamaged, with Budojo's migrations, no newer than this code (`422` `newer` or `unreadable`). A migration this code lacks makes a database newer, **except a stray name no later Budojo stands behind** (`SyncDatabase::STRAY_MIGRATIONS`, #2083): the only two ever added to the repository and gone since, #443's renamed support-tickets migration and the unmerged licensing branch's (#1297). A database keeps such a row for good. The owner's PC refused every backup as newer on its first try (#2079); the door now names the row it finds.
  - **Written beside the live database** as `<database>.staged`.
  - **The shell swaps it in at its next start** (on the phone, `StagedSwap.java`, #2079). The live database steps aside as `<database>.previous` **with its `-wal`**, which can hold writes the main file does not have yet; it is the copy to go back to. A rebase sets this device's own writes aside at the stage (§ Rebase). Then it runs `budojo:sync-reconcile`: it clears the cache, and deletes the files no row names, by the rules the deleting Actions follow. A `<database>.reconcile` file, written before the swap and removed once the reconcile succeeds, keeps a start that dies halfway from skipping it (the phone, #2034).
  - **After a rebase, the reconcile runs after the replay, never between the swap and the replay.** A document uploaded offline has its file on this device but no row in the swapped-in database until the replay recreates it; reconciling first would delete the only copy.
  - **A backup the PC took is staged the same way (#2079),** by `POST /api/v1/device/backup/restore`, which the door uses before the PC publishes versions. It also stages the academy's files, `storage/app/…` from the archive, as `storage/app.staged` beside `storage/app`. **The files go first, and the database commits:** the shell swaps `app.staged` in only beside a staged database, and deletes one it finds alone, which an interrupted restore leaves. A version's stage (`PUT /sync/stage`) clears any `app.staged` first: a version carries no files.
  - **The body is bound by PHP's `post_max_size`** (Laravel checks it for every method, `413` above it). Each shell sets it above any academy's database (#2032, #2034).

### The files side (#2030)

Documents, athletes' photos, avatars and the academy's logo travel apart from the database, one file each, `files/<sha256>.bjs`, sealed like every file with its path as associated data.
- **Every row naming a file records the SHA-256 of its bytes** (`file_sha256`, `photo_sha256`, `avatar_sha256`, `logo_sha256`), as stored: an encrypted certificate is hashed and sent encrypted, under the academy's document key both devices share.
- **A file is matched by its content, never by its path.** Photos are named by the athlete's id, and ids diverge between two devices: this device's `athletes/photos/57.jpg` is not the other device's athlete 57.
- **The server says which contents its database names** (owner-only, `sync`):
  - `GET /api/v1/sync/files` lists each one once, with whether this device holds it at one of its paths (`present`, a file there with that content) and at every one (`complete`);
  - `GET /api/v1/sync/files/{sha256}` gives its bytes;
  - `PUT /api/v1/sync/files/{sha256}` writes it at every path a row names for it, after checking the bytes hash to it (`422` `mismatch`, `404` `unknown`).
- **Push** (`client/src/app/core/sync/files.ts`): before a version goes up, the device seals and sends every content it holds that `files/` lacks. A content is never sent twice: its name is its bytes.
- **Pull:** the device completes every content it lacks somewhere: from its own copy when it holds the content at another path (the same PDF for a second athlete), from the folder otherwise. One the folder does not have yet (the other device's push has not landed, or Drive's listing lags), one that does not open, or one whose bytes are not its name, is left for the next sync. Until then that document cannot be opened on this device.
- **The pull runs once the database is final:** after a fast-forward's swap, after a rebase's replay, **never between the swap and the replay**, the reconcile's rule. Until the replay, a path may hold a file this device uploaded offline (its athlete 57's photo, where the swapped-in database has another athlete 57); writing there first would destroy the only copy before the replay gives it its own row.
- **Not yet here:** deleting from `files/` what no kept version names, which belongs with the retention of versions.

## A journal entry

The journal is a JSON list of the writes that made this version from its parent, **in ULID order**. It records API writes, not rows: the rebase replays them through the same Actions (PRD § 5.2).

**The replay is idempotent, by entry id (#2031).** Every database records the id of every journal entry it has dealt with, **in the same transaction as the write or the outcome it stands for:**
- the device's own writes, as it makes them;
- every entry a replay applies;
- every entry a replay finds already true;
- every entry a replay turns into a conflict.

**With each id, the database also records the ids that entry created there.** A replay skips any entry whose id is already recorded, and still takes its recorded ids into the id map. That is what lets a device replay whenever it cannot tell whether its writes are in the latest version:
- nothing is applied twice;
- a conflict the owner has answered is never raised again;
- a later entry that names a row a skipped entry created still finds it.

**Where the journal lives (#2031).** The server records it, on a paired device only: the shell gives the device id (`BUDOJO_DEVICE_ID`), never the database, which travels. Two tables ([`sync_entries`](../entities/sync-entry.md), [`sync_journal`](../entities/sync-journal-entry.md)):
- **`sync_entries`**, what this database has dealt with, travels with it;
- **`sync_journal`**, this device's kept entries, does not: after a swap the reconcile drops other devices' rows. A rebase carries the kept entries across the swap itself.
- `GET /api/v1/sync/journal` gives the kept entries, `DELETE /api/v1/sync/journal?through=<id>` clears them up to what every other device holds, and `GET /api/v1/sync/holds` answers `holds`.

**A device's entry ids only grow.** The server gives a new entry an id above the newest that device has recorded, inside the write's transaction. A ULID taken from the clock alone can go backwards when the clock steps back, and `devices/` depends on this order (#2031).

**The entries a device keeps speak its current database's ids.** A rebase gives the device's new rows new ids on the base: an athlete created as 57 can become 103. Its journal entries are rewritten through that same id map: the `created` ids, every parameter, and every `*_id` and `*_ids` field. A second replay then starts from 103, not from a 57 the base never had.

| Field | | Example |
|---|---|---|
| `id` | a ULID | `01K6F3Q8Z4M7X2N5P9R1T3V6W8` |
| `device` | the device that made the write | `phone9c1e` |
| `at` | UTC, up to microseconds | `2026-10-01T18:32:05.123456Z` |
| `method` | `POST`, `PUT`, `PATCH` or `DELETE` | `POST` |
| `route` | the Laravel route name: dotted segments of `a-z`, `0-9`, `_` and `-`, each starting with a letter. Every write route has one, pinned by `WriteRouteNamesTest`: a journal outlives the code that wrote it, so a rename is a decision (#2031). | `attendance.store`, `academy.fee-tiers.store` |
| `params` | the route parameters, strings and numbers | `{ "athlete": 57 }` |
| `body` | the request body, or `null`, with a payment's `amount_cents`, `period_months` and `paid_at` as the row got them (§ Rebase). An uploaded file is `{ "$file": { "sha256", "name", "type" } }`; its bytes stay on the device until the entry is cleared | `{ "date": "2026-10-01", "athlete_ids": [57] }` |
| `created` | the ids the write created, by table | `{ "attendance_records": [912] }` |
| `before` | for an update or a delete, what the rows held before, by table and id; else `null` | `{ "athletes": { "57": { "first_name": "Luca" } } }` |

## The keys (`budojo-keys.json`)

**In the Google account's hidden application data** (Drive's `appDataFolder`, scope `drive.appdata`), not in the folder: Budojo's own OAuth clients read it, and nothing else does. It is not in the Drive UI, and Drive for desktop does not copy it to a disk. **Nothing seals it: the Google account is the key** (PRD § 5.4, the owner's decision of 2 Oct 2026, #2033).

`{ "v": 1, "folder": "<32 hex>", "syncKey": "<base64, 32 bytes>", "APP_KEY": "base64:…", "DOCUMENT_ENCRYPTION_KEY": "…", "createdAt": "<UTC>" }`. Written by `desktop/src/sync-keys.ts`, read by `client/src/app/core/sync/keys.ts`.
- **The two app keys** have the desktop keychain's shape and checks (`desktop/src/bootstrap.ts`), the pair the recovery code (#1254) carries. A device that brings the academy in adopts them, and opens what the other device encrypted: the medical certificates first.
- **`syncKey`** seals every file in the folder (§ The envelope).
- **`folder`** is random, made with the file. `sync/folder.bjs`, sealed under the sync key, carries the same id: `{ "v": 1, "folder": "<32 hex>" }` (`client/src/app/core/sync/folder.ts`). The first device to sync into a folder that holds nothing writes it; both devices writing it at once write the same id.
- **Written once, by the first device that has an academy:**
  - the PC writes it when the owner chooses **Collega il telefono** (Dati e backup), with its own two keys: a second consent, for `drive.appdata`, which the backups never need;
  - a phone-only academy writes its own when it connects Google (#2046).
- **Never overwritten.** A device that finds another academy's keys stops and says so: replacing them would leave that academy's documents and versions unreadable.
- **Before it syncs, a device checks `sync/folder.bjs`:**
  - **another id, or missing from a folder that holds versions or reports:** it asks the owner. It is another academy's folder, or one someone emptied of its id;
  - **missing from a folder that holds nothing:** a new folder. The device writes it, then syncs;
  - **does not open under the sync key:** the key rotated after an unpairing. It stops and writes nothing, so its deleted report stays deleted.

## `devices/<id>.bjs`

`{ "v": 1, "device": "pc4f2a", "base": { "seq": 44, "device": "pc4f2a" }, "holds": { "pc4f2a": "<ULID>", "phone9c1e": "<ULID>" }, "at": "<UTC>" }`. Each device writes its own file after every sync.

**`holds`** is, for each device, the newest of that device's journal entries this device's database holds.
- **Why one value per device is enough:**
  - a device's entry ids are ULIDs that only grow;
  - a database always holds a prefix of each device's entries, because they reach it in order (its own writes, a fast-forward, a replay).
- **It is the only ground on which a write leaves a journal.** A device clears its entries up to the oldest of what every other device reports holding of them.
  - From then on every database holds them, so every version built from then on does too.
  - No clock is involved, so an upload that lands days late cannot beat it.
  - **Every device has a file before it pushes or pulls a version.**
    - The device that creates the folder writes its report together with `folder.bjs`, before version 1.
    - A new device writes its report (`base` null, `holds` empty) when it joins, after opening `folder.bjs` and before its first pull. A device unpaired since then fails at `folder.bjs`, and leaves nothing behind.
    - A file that does not open or parse counts as holding nothing.

    So a device that exists is never mistaken for no device.
  - **Unpairing deletes the device's file** together with rotating the sync key (#2033), written to the keys file last. Left behind, it would hold nothing forever, and nobody could clear a journal again. **The order matters** (PRD § 5.4): the remaining device first fetches every file it lacks under the old key, then publishes a fresh version, its files, its report and the new key, and only then deletes everything under the old key and the unpaired device's report.
  - **A sync the unpaired device had under way** can still write its report, or a version, sealed under the old key. So after unpairing, the remaining device:
    - deletes any `devices/` or `versions/` file that fails to open as «wrong key or path»;
    - never pulls a version it cannot open.

    A file that opens but is corrupt still counts as holding nothing.
  - **With no other device's file** in `devices/`, a device clears the entries already in a version the folder lists. A device that pairs later starts from the latest version.

## Joining

There is no pairing code (#2033). **A device joins at its first «Accedi con Google» that finds the keys** (§ The keys):
1. It reads the keys file and adopts the app keys.
2. It makes its device id. From then on its server journals its writes under it (#2031).
3. It checks `sync/folder.bjs`.
4. It writes its `devices/` report, and only then pulls.

**A device that joined never publishes into a folder with no version.** It waits for the device that made the keys, which publishes the academy as version 1 (#2046). Otherwise a phone holding a backup it restored would publish it as version 1, and the PC, with the newer academy, would then meet it as another academy and ask.

**Where a device keeps what it joined with** (#2046):
- **The phone:** the device id, the folder id and the sync key in `sync.json`, beside the app keys in its private files, which neither Android's backup nor a transfer to a new phone copies. What it remembers between rounds (the `SyncLedger`) is in the page's storage, named by the device id.
- **The PC:** the device id in `sync-device.json` under its data, apart from Drive's link, with the database's epoch, which a Restore moves on. The sync key and folder id are read from the account's keys file, which the PC wrote (`docs/desktop/architecture.md` § Sync with the phone).

**A database replaced outside the sync** (the door's restore, the desktop's Restore) forgets the ledger: an academy with no base asks before it meets the folder's (§ Scope).

**A third device is refused** (§ Scope).

## Deciding

**The rule: a device never drops a write of its own silently.**

**The latest version** is the highest number. Between two of the same number, it is the one Drive created first, on Drive's clock. Every listing gives Drive's clock, from the `Date` header.

**What a device keeps:** its journal holds its own writes:
- **unpushed:** in no version yet;
- **pushed, unconfirmed:** in a version it pushed, but not yet held by every other device (`devices/`).

**While it keeps any, it never fast-forwards:** it rebases, and the idempotent replay finds what is already there.

**A push whose answer was lost is unconfirmed, never unpushed.** The upload may have landed, so the device treats its writes as pushed in that version. It waits for the version to appear, then rebases if it does not. **The 10 minutes count from the first listing after the failure,** not from the decision, so a long upload does not eat into the wait.

**Asking the owner** (#2033, PRD § 5.4, § 6.5) offers two answers, never a merge, each carried out only on the folder the owner was asked about: if the latest version moved since, nothing is done and the device asks again (`resolveAsk`, `engine.ts`).
- **The folder's:** the device fast-forwards to the latest version. What its database held goes, its journal with it.
- **This device's:** the device publishes what it holds as a first version of its own (a new root, numbered above every version there), with every entry its journal keeps. Never on top of the latest version: the other device would then carry its own writes onto it, which is a merge. Meeting a line that is not its own, the other device asks in its turn.

| Situation | Do |
|---|---|
| `sync/folder.bjs` names another folder, or is missing beside versions or reports | **ask the owner** (checked before deciding) |
| `sync/folder.bjs` is missing from a folder that holds nothing | write it: a new folder |
| Its own latest push is not listed, and the folder has also lost the version it was made on | **ask the owner** |
| … not listed, within 10 minutes of landing | **wait**: the listing lags; look again |
| … still not listed after that | rebase onto the latest, or push again if the folder is empty; **ask the owner** if it was a first version, or if the version it was made on and the latest come from two different first versions (another device's academy) |
| No base, empty folder | nothing, or push version 1 if the device holds an academy and made the keys (a device that joined waits, § Joining) |
| No base, the folder has versions | fast-forward; **ask the owner** if the device holds an academy of its own |
| The folder is empty | push base + 1 on top of the base: nothing there to lose |
| The base and the latest come from two different first versions: both devices published their own academy at once | **ask the owner** (the device whose line is the latest does nothing). Told only while the listing holds both lines down to their first versions |
| The latest is behind the base | **ask the owner:** versions were deleted on Drive |
| The latest is the base | nothing, or push base + 1 if there are unpushed writes |
| The latest is newer, and the device has writes to carry (unpushed or unconfirmed) | **rebase**: pull it and replay into it every write it lacks, then push if any were |
| The latest is newer, nothing to carry | fast-forward |

## Rebase (#2031)

**A device carries its kept writes onto the other device's version, then publishes the result on top** (`client/src/app/core/sync/engine.ts`, the server's `ReplayJournalAction`):
1. **It stages the version as a rebase** (`PUT /sync/stage?rebase=1`), with the page's writes held, as for a fast-forward. The server sets the device's kept journal aside first, beside the live database as `<database>.rebase`, then stages the database. **Every stage clears a `.rebase` left from before**, so a fast-forward or a restore never replays an older one.
2. **It saves its ledger:** the version is its base, and nothing counts as pushed or listed. Every entry the replay keeps is in no version on this line yet.
3. **The shell swaps it in.** Before the app serves, `budojo:sync-reconcile` replays the set-aside entries, **before it sweeps anything**. Until the replay gives an offline upload its row, no row names its file, and the journal's sweep or the files' reconcile would delete the only copy. The `.rebase` file goes only once every entry is dealt with: a start that dies halfway replays again, and skips what it already did.
4. **It pushes what the replay kept**, as version + 1 on top of the one it pulled. When that version held every write already, there is nothing to push. A device killed before the push pushes at its next round: its ledger counts the kept entries as unpushed.

**The replay runs each entry through the route, FormRequest and Action that made it,** as the owner, in order, its ids rewritten through the id map (§ A journal entry):
- **on the clock of the moment it was written** (its `at`): a payment marked on the 3rd without a date is paid on the 3rd, and "not after today" is that day;
- **an id the map cannot pair is lost, never kept.** An entry that made fewer rows of a table here than where it was written (an import that skipped a duplicate, a create that became a conflict) leaves those rows with no row here. A later entry that names one is a `gone` conflict: kept as it was, the id would name whatever row has it here;
- **an update sends its whole form, and changed only what its `before` recorded.** A field it carried along as it saw it, which this database holds otherwise, was changed by the other device: that change stays, and the field is left out of the replayed body;
- **a delete that names its row another way than by a model** (a month's payment, by year and month) must delete here the row it deleted there, field by field;
- **money is never left to chance:** a payment's entry carries the amount, the period and the date the row got (`ResolvedFields`), and a payment the replay makes or finds otherwise is a `differs` conflict.

Each entry ends in one state, recorded in [`sync_entries`](../entities/sync-entry.md) in the same transaction as what it did:

| Outcome | When | Kept again for the next version |
|---|---|---|
| skipped | the database dealt with it already: the version carries it | no |
| applied | | yes |
| already | what it does is true already: a presence marked on both devices, a field set to the same value, an athlete deleted on both | yes, so the other device holds it |
| conflict | below | yes |

**A conflict is never dropped.** The write waits for the owner in [`sync_conflicts`](../entities/sync-conflict.md), with both sides (PRD § 6.4; the owner's answer is #2038). What it changed is undone first: every write runs in a savepoint, rolled back when it does not apply.
- **`refused`:** the rules refuse it here (403, 409, 422).
- **`gone`:** its row is gone (404, or an update whose target was deleted here, softly too), or it names a row an earlier entry made there and none here.
- **`changed`:** a field it changes was changed here since it was written, or a delete by year and month meets another row than the one it deleted. An update is about the fields its body sets by name; the others moved with them and are derived again. One that sets none by name (a photo: `photo` sets `photo_path`) is about every field it changed.
- **`differs`:** the row it made or found here differs in a field the entry sets: the same month's payment made otherwise, or an amount the fee here works out otherwise. For money, the same month is not enough.
- **`failed`:** anything else, a server error first. **A replay never stops on an entry:** the shell runs it before the app serves, so one that stopped would stop every start.
- **`unknown-route`:** a route this Budojo no longer has.
