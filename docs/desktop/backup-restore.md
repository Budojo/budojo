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

Backups are taken **automatically every 6 hours** the app is open, and you can take one any time from **Data & backup → Back up now**.

### How much history is kept

Two tiers, because "I have just broken something" and "this went wrong some time last week" are different questions ([#1330](https://github.com/Budojo/budojo/issues/1330)):

| Tier | Holds | Answers |
|---|---|---|
| Recent | the **6** newest archives, whatever day they fall on | the last ~36 hours, at six-hour resolution |
| Daily | the **last archive of each of the 14 most recent days** the app ran | the fortnight behind it, one snapshot per day |

That settles at roughly **18 archives** and about **two weeks** of history. The previous policy kept a flat seven, which at six-hour spacing was 42 hours — fine for an immediate mistake, useless for one nobody noticed until Monday.

The daily tier counts **days the app actually ran**, not calendar days, so a fortnight away from the machine does not silently empty your history.

Pruning always keeps at least the newest archive and never touches a file it did not create, whatever the policy says — a retention bug must not be able to delete your last good backup.

## Backing up (what you should actually do)

1. Leave the app open enough that the 6-hourly automatic backup runs, and hit **Back up now** before anything risky (an upgrade, moving machines).
2. **Get the archives off this machine.** The `backups\` folder is on the same disk that might die — an on-disk backup does not survive a dead disk.

   The easy way is **Data & backup → Backup folder → Choose folder** ([#1320](https://github.com/Budojo/budojo/issues/1320)): pick a folder your cloud service already syncs, or an external drive, and every backup is copied there automatically. It is off until you choose one, and nothing leaves this computer before you do.

   Without it, you are copying `budojo-backup-*.zip` by hand on a schedule you'll actually keep — which is the part that tends not to happen.

That protects your **bulk data**. For the encrypted documents there is one more thing to understand — read on.

## Getting backups off this computer

**Data & backup → Backup folder → Choose folder.** Pick any folder and every backup is copied there — the six-hourly ones and the ones you take by hand.

The useful choice is a folder your cloud service already syncs: OneDrive, Dropbox, iCloud Drive, the Google Drive desktop app. Budojo writes the file; the sync client you already run carries it off the machine. A network drive or a USB stick works exactly the same way.

Budojo applies the **same retention there as on this computer** (six recent plus fourteen daily, ~18 archives), so the copy that survives a dead disk is not the shallower one. It **touches nothing else in that folder** — anything it did not create is left alone.

### If it stops working

Failures are quiet, because the copy on this computer has already been written and nothing is at risk yet. The Data & backup page is where you find out: it shows when the last copy succeeded, and the reason if the most recent attempt failed.

| What it says | What to do |
|---|---|
| The folder no longer exists | Choose it again, or pick a new one. Usually an unplugged drive or a folder that was moved. |
| No permission to write | Choose a different folder. |
| Out of space | Free some up, or choose a different one. |
| Read-only | Usually a write-protected USB stick. Choose a different folder. |

**"Last copied" is the number to read**, not the error. It tells you how old the newest copy over there is, which is what actually matters if this disk dies tonight.

**Stopping** the copying leaves the archives already in that folder alone — it is not a delete.

### What it does not solve

**The recovery code is not in the folder, and that is deliberate.** The archive already excludes your encryption keys ([see below](#the-part-that-can-silently-fail-encryption-keys)). Save the recovery code in a password manager, by hand, once — copying backups somewhere changes nothing about that.

## Restoring

From **Data & backup**, pick an archive and choose **Restore** (it asks for confirmation — a restore replaces the current data). The app:

1. holds the scheduler and the notification poll — their own `php` processes open the same database — and stops the PHP API,
2. copies the archived database and `storage/` in **beside** the live ones (`budojo.sqlite.restoring`, `storage.restoring`), then swaps by renaming: the live database (with its `-wal`/`-shm`) and `storage/` step aside as `.previous`, the copies take their place, and the `.previous` files are deleted only once every rename has succeeded,
3. restarts the API and reloads the window onto the restored data.

A restore **refuses an archive from a newer version of Budojo** than the one running (its schema would be ahead of the code) and refuses an archive with a missing or unreadable manifest — an unknown archive is not a safe one. An **older** archive is fine: the boot migrations bring it forward.

The live database is only replaced after the archive extracts and validates cleanly **and** after every copy has succeeded (#1909). Until #1909 the swap deleted the live database and then copied the archived one over it, so a copy that failed half-way — a full disk is enough — left the database replaced and the documents gone. Now every step that can run out of room happens while the live data is untouched, the half-made copies are removed if one fails, and what follows is renames on one volume. Each rename is retried for about a second when Windows reports the file busy (the antivirus scanning what was just written is the usual holder), and if one still fails, the renames already done are undone in reverse order, so the database and the documents always belong to the same backup. Anything that could not be put back stays as `.previous` and is **never deleted**: the next restore sets it aside as `….kept-<timestamp>` before it starts, and the error says which files they are. Removing the staged copies on the way out of a failure is retried the same way, and if it still fails, the copies stay for the next restore, which clears them before it starts: that cleanup never replaces the error, because after a failed undo the error is the only thing that says where the owner's data is (#1959). One restore or backup runs at a time: a second is refused as busy.

**A crash in the middle of the swap is repaired on the next launch (#1919).** The renames take milliseconds, but a power cut between two of them used to leave no `budojo.sqlite` at all, and the next boot then ran first-run setup on an empty database while the owner's own sat beside it as `budojo.sqlite.previous`. Now the very first thing the bootstrap does, before it creates a directory or opens a database, is look for that state (`planRecovery` in `desktop/src/bootstrap.ts`):

- **No database, and a `budojo.sqlite.previous`:** the restored database never came in. The staged `.restoring` copies are removed, because the restore never finished and the archive it came from is still there. Then the owner's `-wal`/`-shm` and `storage.previous` are renamed back, and **the database itself comes back last**. Its absence is the only sign of an interrupted swap, so a boot that stops partway through the recovery (a rename that fails, a second power cut) is recognised again by the next one, which finishes the job. Putting it back first would have left a `-wal` under `.previous` with nothing to notice it, and a `-wal` holds writes the main file does not have yet. The app opens on the data it had before the restore was started.
- **The restored database is in, but `storage.restoring` is still there** (a `.previous` database, and no staged database): the crash came after the database and before the documents. The staged storage is complete (every copy is made before the first rename), so the swap is **finished**: the old `storage/` steps aside as `storage.previous` and the restored one takes its place, so the database and the documents belong to the same backup. The owner's previous files stay under `.previous`, as after any restore, until the next restore sets them aside.
- **Anything else is left alone.** A `.previous` beside a database is what a finished restore could not tidy away, not a crash. A staged database still present means the crash came while copying, and a copy that may be cut short is never rolled forward.

That reading holds because the restore sets any older `.previous` aside as `.kept-*` **before** it copies anything, clears a staged storage whether or not the archive has one, and removes the staged storage **before** the staged database when it gives up. So a staged storage beside a `.previous` database, with no staged database, can only be the one this swap was putting in, never a half copy from an earlier failed attempt.

Recovery only renames onto free names and only deletes a staged `.restoring` copy, never the owner's data. A staged copy it cannot delete (Windows holding a file in it) does not stop the launch: it is logged, and the next restore clears it before staging its own. A rename that fails does stop the launch, with the error, and the next launch picks up where it stopped. What it did is written to the main-process log.

### Restoring from a file (#1909)

The list shows only the archives in the app's own folder. A backup anywhere else — your backup folder, a zip downloaded from Google Drive, a USB stick — comes back with **Data & backup → Restore from a file…**. It asks for confirmation, then opens the system file dialog, starting in your backup folder when you have one. On a new computer, where the list is empty, this is the way back, and the page leads with it: a **Coming from another computer?** block with two steps, *Enter your recovery code* first and *Restore from a file…* second (#1910). The order does not matter to the app, but a restore reloads the window and fills the list, so the block is gone by the time a second step would be read, and a restore without its keys cannot open the documents.

- The file is **checked where it is** — the same manifest and version check as a listed archive — and nothing is copied or swapped until it passes. A file that is not a Budojo backup is refused with *"This file is not a Budojo backup"*; one from a newer Budojo, with *"Update Budojo, then restore it"*.
- Once it passes it is **copied into the app's own folder**, so it shows in the list like any other, and then restored. An archive the list already holds is not copied twice, and a renamed copy (`… (1).zip` from a second download) goes in under the name its backup had, from the manifest's timestamp.
- The path comes from the system dialog in the main process, never from the page.

## The part that can silently fail: encryption keys

The medical certificates in `storage/` are encrypted with `DOCUMENT_ENCRYPTION_KEY`. Some database fields may be encrypted with `APP_KEY`. **Both keys live only in `secrets.bin`, and `secrets.bin` is not in the backup.**

It is not in the backup for a reason: the OS keychain (Electron `safeStorage` → Windows DPAPI) ties `secrets.bin` to the **Windows user account that created it**. Even copied to another machine it generally cannot be decrypted there. Bundling it into a portable archive would give false confidence, not recovery.

What this means for each recovery scenario:

| Scenario | Bulk data (athletes, attendance, payments) | Encrypted documents |
|---|:---:|:---:|
| **Same machine, same Windows user** (app reinstalled, data restored) | ✅ recovered | ✅ recovered — `secrets.bin`/DPAPI is still there |
| **New machine, WITH your recovery keys imported** | ✅ recovered | ✅ recovered — importing the recovery code restores the original keys |
| **New machine, WITHOUT the recovery keys** | ✅ recovered | ❌ **cannot be decrypted** — the new install generated *different* keys |

On a fresh machine the app installs, generates its **own** new keys, and you restore your backup on top. The relational data comes back and is fully usable. The documents come back as files but were encrypted with the **old** machine's key. Unless you also import that machine's **[recovery keys](#recovery-keys)**, the new key cannot read them — and the app does not warn: athletes, attendance and payments are all there, only document downloads fail. That silent partial failure is why recovery keys exist.

> A safety detail: if you ever restore a database into a profile whose `secrets.bin` is **missing** (rather than different), the app **refuses to boot** rather than generate fresh keys over existing data — new keys would make every encrypted field permanently unreadable while looking like a harmless reset. It fails loudly on purpose.

### Recovery keys

Budojo hands you a **recovery code** — a single line that carries both encryption keys — so a fresh-machine recovery can decrypt your documents too. This is the robust answer to the scenario above ([#1254](https://github.com/Budojo/budojo/issues/1254)).

**Save it now, before you need it** — Data & backup → *Recovery keys* → **Reveal recovery code**:

1. Reveal the code and **copy it into a password manager**. Anyone who has it can open your documents, so treat it like a password — never store it inside the backup zip.
2. That's all: the code doesn't change unless the keys are re-generated, so one saved copy covers every future backup.

**On a new machine**, after installing Budojo and restoring your backup — Data & backup → *Recovery keys* → **Restore keys from a recovery code**:

1. Paste the code and confirm. Budojo replaces this machine's keys with the originals and **restarts** under them.
2. Your medical certificates now decrypt.

Order doesn't matter — import the keys before or after restoring the backup, as long as you do both.

Also worth knowing:

- **The bulk data restores anywhere without the keys.** Athletes, attendance, payments and belts are plain relational data — a backup alone recovers them on any machine. Only the encrypted documents need the keys.
- Medical certificates are, in the worst case, re-collectable from the athletes — the backup and the recovery code are not your only path to them.

## Quick recovery checklist

1. Install Budojo on the new machine and let it finish first-run setup.
2. Make your latest `budojo-backup-*.zip` reachable from this computer: your backup folder synced by OneDrive / Dropbox / the Drive client, a download from Google Drive, or a USB stick. No need to put it anywhere in particular.
3. **Data & backup → Restore from a file… →** confirm → pick the zip. Budojo checks it, copies it into its own list and restores it.
4. **Data & backup → Recovery keys → Restore keys from a recovery code →** paste the code you saved → confirm. Budojo restarts under the original keys.
5. Verify: athletes, attendance and payments are present, and a medical certificate downloads. ✅

If you skipped step 4 (or never saved a recovery code), the relational data is still safe — only the encrypted documents stay unreadable, because their keys did not survive the old machine.

## See also

- [`architecture.md`](./architecture.md) — data layout, secrets, the boot-time key guard.
- [`install.md`](./install.md) — install, first run, upgrades.
