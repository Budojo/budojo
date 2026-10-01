# The sync protocol, version 2

How two devices of one academy share their data through the owner's Google Drive (M12, [PRD § 5](../specs/m12-mat-app.md#5-how-it-works), [#2029](https://github.com/Budojo/budojo/issues/2029)). This page is the contract: the TypeScript in `client/src/app/core/sync/` implements it, and the server's journal (#2031) must write entries that match it.

**The protocol runs in the app on both devices** (PRD § 5.6). The PC's main process and the phone's shell only supply Drive, the database file and the key store.

## The folder

```
Budojo/                                          the folder the PC creates for its backups (#1301)
  sync/
    keys.bjs                                     the app keys, sealed under the sync key
    versions/000001-pc4f2a.root.bjs              the academy's first version
    versions/000045-phone9c1e.000044-pc4f2a.bjs  version 45 by the phone, on top of 44 by the PC
    files/<sha256>.bjs                           a document or photo, named by its content
    devices/pc4f2a.bjs                           what one device last saw and sent
```

- **Device id:** a kind (2–8 lowercase letters) and 4 random characters, `pc4f2a`, `phone9c1e`. It is made once at pairing.
- **Sequence numbers** are six digits, from `000001`.
- **A version's name carries its parent**, so the history can be read from the listing, with no database downloaded. The name is the associated data too, so the parent cannot be changed.
- **Two devices can push the same number at once.** The names still differ, so both files exist. The latest version is the highest number, and between two of the same number, the lower device id.
- **Nothing outside this layout** is ever written. A remote refuses any other path, folder by folder: a numbered version with its parent, a SHA-256, a device id.

## The envelope: every file

```
"BJS2" (4 bytes) | IV (12 bytes, random per file) | AES-256-GCM( gzip(plaintext) ) with its 16-byte tag
```

- **Key:** the academy's 32-byte sync key.
- **Associated data:** the file's path in the folder, UTF-8, for example `versions/000042-pc4f2a.bjs`. A file moved or renamed does not open.
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

A reader checks every field it knows and ignores any it does not, so a later app can add one. **Changing what a field means is a new protocol number.** The manifest must name the version and the parent its path names. A writer checks the manifest and the journal with the readers' rules before it packs them.

## A journal entry

The journal is a JSON list of the writes that made this version from its parent, **in ULID order**. It records API writes, not rows: the rebase replays them through the same Actions (PRD § 5.2).

| Field | | Example |
|---|---|---|
| `id` | a ULID | `01K6F3Q8Z4M7X2N5P9R1T3V6W8` |
| `device` | the device that made the write | `phone9c1e` |
| `at` | UTC, up to microseconds | `2026-10-01T18:32:05.123456Z` |
| `method` | `POST`, `PUT`, `PATCH` or `DELETE` | `POST` |
| `route` | the Laravel route name: dotted segments of `a-z`, `0-9`, `_` and `-`. The server gives every write route one (#2031). | `attendance.store`, `fee-tiers.store` |
| `params` | the route parameters, strings and numbers | `{ "athlete": 57 }` |
| `body` | the request body, or `null` | `{ "date": "2026-10-01", "athlete_ids": [57] }` |
| `created` | the ids the write created, by table | `{ "attendance_records": [912] }` |
| `before` | for an update or a delete, the values it saw before; else `null` | `{ "amount_cents": 4500 }` |

## `keys.bjs`

`{ "v": 1, "APP_KEY": "base64:…", "DOCUMENT_ENCRYPTION_KEY": "…" }`. It has the desktop keychain's shape and checks (`desktop/src/bootstrap.ts`), the same pair the recovery code (#1254) carries.

## The pairing code

```
protocol (1 byte) | sync key (32 bytes) | first 2 bytes of SHA-256 over the first 33
```

**Spelled in Crockford's base32:** 56 characters in 14 groups of four.
- **Reading it back** ignores case, spaces and dashes. It also takes `O` as 0, and `I` or `L` as 1.
- **A mistyped character fails the check** and is refused. It is never turned into a wrong key.
- **The QR carries** `BUDOJO-PAIR:` and the 56 characters.

## Deciding

**The rule: a device never drops a write of its own silently.** Its journal holds three kinds of write:
- **unpushed:** made since its base, in no version yet;
- **pushed, unconfirmed:** in a version it pushed, which it has not yet seen on the line;
- **confirmed:** in a version on the line.

**The line** is the latest version and its ancestors, followed through the parents in the names. A device keeps a pushed write until it sees its version on the line, however long it is away. Only then does it clear the write. That way a race lost while the device was offline can still be replayed after the losing version is pruned.

**Whether the base is on the line:**
- **yes** when the walk down the parents meets it, or meets a version naming it as parent (the base itself may be pruned);
- **no** when the walk passes the base's number without meeting it;
- **unknown** when a pruned parent stops the walk above it.

| Base | The folder | This device's writes | Do |
|---|---|---|---|
| none | empty | none | nothing |
| none | empty | unpushed | push version 1 |
| none | has versions | none | fast-forward to the latest |
| none | has versions | unpushed | **ask the owner:** an academy of its own meets another |
| B | empty | any | push B + 1 on top of B: nothing there to lose |
| B, on the line | latest is B | none / unpushed | nothing / push B + 1 |
| B, on the line | latest is newer | none / unpushed | fast-forward / rebase |
| B, off the line | latest is older than B | any | **ask the owner:** versions deleted, or another account's folder |
| B, off the line or unknown | latest is newer or the same number | pushed, unconfirmed | **rebase**, never a fast-forward |
| B, off the line or unknown | latest is newer or the same number | none / unpushed | fast-forward / rebase |

**When the line is unknown and writes are unconfirmed,** the rebase may replay writes that are already there. The replay finds them already true, or the owner sees a duplicate. **A duplicate shows; a lost write does not.**
