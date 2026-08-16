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
2. **Get the archives off this machine.** The `backups\` folder is on the same disk that might die — an on-disk backup does not survive a dead disk.

   The easy way is **Data & backup → Google Drive backup → Connect Google Drive** ([#1301](https://github.com/Budojo/budojo/issues/1301)). Every backup is then copied to a folder called `Budojo` in your Drive, automatically, and the seven most recent are kept there as well. It is off until you connect an account, and nothing leaves this computer before you do.

   Without it, copy the latest `budojo-backup-*.zip` into a synced folder or onto an external drive yourself — on a schedule you'll actually keep, which is the part that tends not to happen.

That protects your **bulk data**. For the encrypted documents there is one more thing to understand — read on.

## Backing up to Google Drive

**Data & backup → Google Drive backup → Connect Google Drive** opens Google in your browser. Approve it and the app is connected; nothing else to configure.

After that, every backup — the six-hourly ones and the ones you take by hand — is copied to a folder named **`Budojo`** in your Drive. The seven most recent are kept there, the same as on this computer.

The folder is a normal, visible one on purpose. If this machine stops working entirely you can open Google Drive in any browser, download the newest `budojo-backup-*.zip` and carry it to the new one — no Budojo required to get your data back.

**Budojo can only see the files it created.** The permission it asks for (`drive.file`) does not let it read the rest of your Drive.

### What it does not solve

**The recovery code is never uploaded, and that is deliberate.** The archive already excludes your encryption keys ([see below](#the-part-that-can-silently-fail-encryption-keys)); putting them in the same Google account would mean one compromised login exposes both the archive and everything needed to read the medical certificates inside it. Save the recovery code in a password manager, by hand, once. Nothing about Drive sync changes that.

### If it stops working

Failures are quiet, because the copy on this computer has already been written and nothing is at risk yet. The Data & backup page is where you find out: it shows when the last copy succeeded, and the reason if the most recent attempt failed.

| What it says | What to do |
|---|---|
| Google revoked the connection | Reconnect the account. This happens if you removed Budojo's access from your Google account. |
| This Google account is out of space | Free some up, or connect a different account. |
| No connection to Google | Nothing — it retries at the next backup. Backups are still being saved on this computer. |

**"Last copied" is the number to read**, not the error. It tells you how old the newest copy in your Drive is, which is what actually matters if this disk dies tonight.

**Disconnecting** stops the copying and forgets the account. Archives already in your Drive are left alone — disconnecting is not a delete.

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
2. Get your latest `budojo-backup-*.zip` onto the machine — download it from the `Budojo` folder in your Google Drive if you connected one, otherwise copy it from wherever you keep it.
3. **Data & backup → Restore →** pick the archive → confirm.
4. **Data & backup → Recovery keys → Restore keys from a recovery code →** paste the code you saved → confirm. Budojo restarts under the original keys.
5. Verify: athletes, attendance and payments are present, and a medical certificate downloads. ✅

If you skipped step 4 (or never saved a recovery code), the relational data is still safe — only the encrypted documents stay unreadable, because their keys did not survive the old machine.

## See also

- [`architecture.md`](./architecture.md) — data layout, secrets, the boot-time key guard.
- [`install.md`](./install.md) — install, first run, upgrades.
