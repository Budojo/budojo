# Budojo Desktop — install & first run

Installing Budojo on Windows, what the first launch does, how to upgrade, and why Windows shows a warning on first run.

## What you download

Every stable release attaches two Windows builds to its [GitHub Release](https://github.com/Budojo/budojo/releases) (built by the `desktop-installer` job, [#1231](https://github.com/Budojo/budojo/issues/1231)):

| File | What it is | Use when |
|---|---|---|
| `Budojo Setup X.Y.Z.exe` | **NSIS installer** | The normal choice — installs into Program Files (per-user, no admin), adds a Start-menu entry, and is upgradable in place. |
| `Budojo X.Y.Z.exe` | **Portable** | Run from a USB stick or a synced folder with no installation and no admin rights. |

Both are the same application. Neither is code-signed (see [SmartScreen](#the-smartscreen-warning)).

## Install (NSIS)

1. Download `Budojo Setup X.Y.Z.exe` from the latest release.
2. Run it. Because it is unsigned, Windows will show a SmartScreen warning first — see below.
3. Choose an install location if you don't want the default (the installer allows changing it). No administrator prompt: it installs for the current user only.
4. Launch Budojo from the Start menu.

## Portable

1. Download `Budojo X.Y.Z.exe`.
2. Put it anywhere — a USB stick, a `OneDrive`/`Drive` folder, `Desktop`.
3. Double-click to run. Nothing is installed.

> **Your data is *not* inside the portable exe.** Whether you run the installer or the portable build, all data lives under `%APPDATA%\Budojo\` on the machine you run it on (database, documents, backups — see [architecture § Data layout](./architecture.md#data-layout)). Running the portable exe from a USB stick on a *different* PC starts a fresh, empty Budojo on that PC — it does not carry your gym's data with it. To move your data, use a [backup](./backup-restore.md).

## The SmartScreen warning

On first run Windows shows **"Windows protected your PC"** (Microsoft Defender SmartScreen), because the executable is not signed with a code-signing certificate.

To run it: click **More info**, then **Run anyway**.

This is expected. A code-signing certificate is a recurring paid cost, and avoiding recurring cost is the entire reason Budojo moved off hosted infrastructure ([#1218](https://github.com/Budojo/budojo/issues/1218)). The build is exactly what this repository produces — you can rebuild it yourself from the tagged commit (`desktop/` + the `desktop-installer` job). The warning fades once the file has been run a few times / gains local reputation.

## First run

The first launch does more than later ones — it bootstraps the local instance:

1. **Generates encryption keys** (`APP_KEY`, `DOCUMENT_ENCRYPTION_KEY`) and stores them encrypted in the OS keychain. **Read [backup-restore.md](./backup-restore.md) about these keys before you rely on the app** — they are the one thing a backup does not contain.
2. **Creates the database** and runs migrations.
3. **Starts the bundled PHP API** on a local port and waits for it to be healthy.
4. Signs you straight in (auto-login) and shows the **academy setup** so you can create your gym profile.

The **very first** boot can take ~10–15 seconds — Windows Defender scans `php.exe` and the runtime DLLs on first read, and PHP's opcache is cold. Every launch after that is roughly a second. This is normal; don't kill it during the first-run scan.

## Upgrading

1. Download the newer `Budojo Setup X.Y.Z.exe`.
2. Run it. It installs over the previous version.
3. Your data under `%APPDATA%\Budojo\` is untouched; any new database migrations run automatically on the next launch.

Portable users: download the newer `Budojo X.Y.Z.exe` and replace the old one. Same data directory, same automatic migration on launch.

Versioning follows the releases: `feat` changes bump the minor version, `fix` changes the patch. The in-app **What's new** screen summarises each release.

## Uninstalling

Uninstall from **Windows Settings → Apps** (or delete the portable exe). By design the uninstaller **does not delete your data** — the database, documents and backups under `%APPDATA%\Budojo\` are left in place, so an accidental uninstall or a reinstall can't wipe the gym. To remove everything, delete `%APPDATA%\Budojo\` by hand after uninstalling — but **make a [backup](./backup-restore.md) first**, and read the note there about the encryption keys, because that folder is the only copy.

## See also

- [`architecture.md`](./architecture.md) — how the desktop build works.
- [`backup-restore.md`](./backup-restore.md) — protecting and recovering your data. **Read this early, not after a disaster.**
