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
2. Get your latest `budojo-backup-*.zip` onto the machine — from your backup folder if you set one up, otherwise from wherever you keep them.
3. **Data & backup → Restore →** pick the archive → confirm.
4. **Data & backup → Recovery keys → Restore keys from a recovery code →** paste the code you saved → confirm. Budojo restarts under the original keys.
5. Verify: athletes, attendance and payments are present, and a medical certificate downloads. ✅

If you skipped step 4 (or never saved a recovery code), the relational data is still safe — only the encrypted documents stay unreadable, because their keys did not survive the old machine.

## See also

- [`architecture.md`](./architecture.md) — data layout, secrets, the boot-time key guard.
- [`install.md`](./install.md) — install, first run, upgrades.
