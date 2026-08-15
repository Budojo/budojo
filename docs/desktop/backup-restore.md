# Budojo Desktop — backup, restore & disaster recovery

Leaving managed hosting means leaving managed backups: no droplet snapshots, no MySQL dumps, no Forge rollback. On a laptop, one failed SSD takes out every athlete record, every attendance entry, and every medical certificate. This is how to make sure it doesn't — and, honestly, what a backup can and cannot bring back.

**Read the [encryption keys](#the-part-that-can-silently-fail-encryption-keys) section before you trust a backup with a new machine.** It is the one recovery scenario that fails quietly.

## Where your data lives

Everything is under `%APPDATA%\Budojo\` (see [architecture § Data layout](./architecture.md#data-layout)). The parts that matter here:

| | What | In a backup? |
|---|---|:---:|
| `budojo.sqlite` | The database — athletes, attendance, payments, belts. Mostly plain text. | ✅ |
| `storage/` | Laravel storage, including the **encrypted medical certificates**. | ✅ |
| `secrets.bin` | `APP_KEY` + `DOCUMENT_ENCRYPTION_KEY`, encrypted with the OS keychain. | ❌ **never** |

## What a backup is

A backup archive is a zip in `%APPDATA%\Budojo\backups\`, named `budojo-backup-YYYYMMDD-HHMMSS.zip`, containing:

- a **`VACUUM INTO` copy** of the database — not a file copy. A WAL-mode SQLite file copied from under a live connection is subtly corrupt and only fails at restore time; `VACUUM INTO` produces a clean, consistent single-file snapshot while the app keeps running.
- the **`storage/` tree** (the encrypted documents).
- a **`manifest.json`** — format version, app version, schema version (the newest applied migration), and timestamp.

It **does not** contain `secrets.bin` — the encryption keys. That is deliberate; see [below](#the-part-that-can-silently-fail-encryption-keys).

Backups are taken **automatically every 6 hours** the app is open, and you can take one any time from **Data & backup → Back up now**. The **7** most recent are kept; pruning always keeps at least the newest, so a retention bug can never delete your last good backup.

## Backing up (what you should actually do)

1. Leave the app open enough that the 6-hourly automatic backup runs, and hit **Back up now** before anything risky (an upgrade, moving machines).
2. **Copy the archives off this machine.** The `backups\` folder is on the same disk that might die — an on-disk backup does not survive a dead disk. Copy the latest `budojo-backup-*.zip` into a synced folder (OneDrive, Google Drive) or an external drive on a schedule you'll actually keep.

That protects your **bulk data**. For the encrypted documents there is one more thing to understand — read on.

## Restoring

From **Data & backup**, pick an archive and choose **Restore** (it asks for confirmation — a restore replaces the current data). The app:

1. stops the PHP API,
2. drops the live database's stale `-wal`/`-shm` files and swaps in the archived database + `storage/`,
3. restarts the API and reloads the window onto the restored data.

A restore **refuses an archive from a newer version of Budojo** than the one running (its schema would be ahead of the code) and refuses an archive with a missing or unreadable manifest — an unknown archive is not a safe one. An **older** archive is fine: the boot migrations bring it forward.

The live database is only replaced after the archive extracts and validates cleanly, so an interrupted restore leaves your current data intact.

## The part that can silently fail: encryption keys

The medical certificates in `storage/` are encrypted with `DOCUMENT_ENCRYPTION_KEY`. Some database fields may be encrypted with `APP_KEY`. **Both keys live only in `secrets.bin`, and `secrets.bin` is not in the backup.**

It is not in the backup for a reason: the OS keychain (Electron `safeStorage` → Windows DPAPI) ties `secrets.bin` to the **Windows user account that created it**. Even copied to another machine it generally cannot be decrypted there. Bundling it into a portable archive would give false confidence, not recovery.

What this means for each recovery scenario:

| Scenario | Bulk data (athletes, attendance, payments) | Encrypted documents |
|---|:---:|:---:|
| **Same machine, same Windows user** (app reinstalled, data restored) | ✅ recovered | ✅ recovered — `secrets.bin`/DPAPI is still there |
| **New machine / new Windows profile** (old machine dead) | ✅ recovered | ❌ **cannot be decrypted** — the new install generated *different* keys |

On a fresh machine the app installs, generates its **own** new keys, and you restore your backup on top. The relational data comes back and is fully usable. The documents come back as files but were encrypted with the **old** machine's key — the new key cannot read them. The app does not crash and does not warn: athletes, attendance and payments are all there, and only document downloads fail. That silent partial failure is exactly why this section exists.

> A safety detail: if you ever restore a database into a profile whose `secrets.bin` is **missing** (rather than different), the app **refuses to boot** rather than generate fresh keys over existing data — new keys would make every encrypted field permanently unreadable while looking like a harmless reset. It fails loudly on purpose.

### What to do about it

- **Keep the Windows user account alive.** The single most effective thing is not to lose the Windows profile that created the keys — same user, same machine. Reinstalling *Budojo* is safe; reinstalling *Windows* or moving to a new PC is what breaks document decryption.
- **Copy `secrets.bin` off-machine alongside your backups**, understanding it only helps a **same-Windows-user** restore (e.g. you wiped just the app, not the account). For a genuinely new machine it will not decrypt — but it costs nothing to keep.
- **Treat the bulk data as the thing a backup reliably protects.** Athletes, attendance, payments and belts restore anywhere. Medical certificates are, in the worst case, re-collectable from the athletes — the backup is not your only path to them.
- A built-in **export/import of the plaintext keys** (record them in a password manager, restore them on any machine) is the robust fix and is tracked as a follow-up — [#1254](https://github.com/Budojo/budojo/issues/1254). Until it ships, the two scenarios above are the accurate picture.

## Quick recovery checklist

1. Install Budojo on the new machine and let it finish first-run setup.
2. Copy your latest `budojo-backup-*.zip` onto the machine.
3. **Data & backup → Restore →** pick the archive → confirm.
4. Verify: athletes, attendance and payments are present. ✅
5. Try downloading a medical certificate. If it fails, you are in the new-machine key scenario above — the relational data is safe; the documents were encrypted with keys that did not survive the old machine.

## See also

- [`architecture.md`](./architecture.md) — data layout, secrets, the boot-time key guard.
- [`install.md`](./install.md) — install, first run, upgrades.
