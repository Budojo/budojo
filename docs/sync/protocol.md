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
  - **The shell swaps it in at its next start** (on the phone, `StagedSwap.java`, #2079). The live database steps aside as `<database>.previous` **with its `-wal`**, which can hold writes the main file does not have yet; it is the copy to go back to, and where the rebase (#2031) reads this device's own writes. Then it runs `budojo:sync-reconcile`: it clears the cache, and deletes the files no row names, by the rules the deleting Actions follow. A `<database>.reconcile` file, written before the swap and removed once the reconcile succeeds, keeps a start that dies halfway from skipping it (the phone, #2034).
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
| `body` | the request body, or `null`. An uploaded file is `{ "$file": { "sha256", "name", "type" } }`; its bytes stay on the device until the entry is cleared | `{ "date": "2026-10-01", "athlete_ids": [57] }` |
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
  - **missing, or another id:** it asks the owner. It is another academy's folder, or one someone emptied;
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
- **The PC:** #2032.

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

| Situation | Do |
|---|---|
| `sync/folder.bjs` is missing or names another folder | **ask the owner** (checked before deciding) |
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
