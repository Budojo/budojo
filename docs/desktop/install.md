# Budojo Desktop — install & first run

Installing Budojo on Windows, what the first launch does, how to upgrade, and why Windows shows a warning on first run.

## What you download

Every stable release attaches the Windows installer to its [GitHub Release](https://github.com/Budojo/budojo/releases) (built by the `desktop-installer` job, [#1231](https://github.com/Budojo/budojo/issues/1231)):

| File | What it is |
|---|---|
| `Budojo-Setup-X.Y.Z.exe` | **The installer.** Installs per-user (no administrator prompt), adds a Start-menu entry, upgrades in place, updates itself, and starts in seconds. |

The other two files beside it are for the app, not for you: `latest.yml` and the `.blockmap` are how an installed copy finds and downloads updates.

It is not code-signed — see [SmartScreen](#the-smartscreen-warning).

> **There used to be a second file, `Budojo-X.Y.Z.exe` — a portable build that needed no installation.** It was removed in [#1272](https://github.com/Budojo/budojo/issues/1272). It re-extracted ~450 MB to a temporary folder on *every* launch, which took about **two minutes each time**, with no window and no progress bar while it happened — so it mostly looked broken. The installer needs no administrator rights either, which was the main thing the portable was there for.
>
> **If you are running a portable copy:** install `Budojo-Setup-X.Y.Z.exe` and delete the old exe afterwards. Your data is not inside it (see below), so nothing is lost — the installed app finds the same `%APPDATA%\Budojo\` and carries straight on.

## Install

1. Download `Budojo-Setup-X.Y.Z.exe` from the latest release.
2. Run it. Because it is unsigned, Windows will show a SmartScreen warning first — see below.
3. Choose an install location if you don't want the default (the installer allows changing it). No administrator prompt: it installs for the current user only.
4. Launch Budojo from the Start menu.

> **Your data is *not* inside the application.** It all lives under `%APPDATA%\Budojo\` on the machine you run it on — database, documents, backups (see [architecture § Data layout](./architecture.md#data-layout)). So installing Budojo on a *second* PC gives you a fresh, empty Budojo there; it does not follow you. To move your gym to another machine, use a [backup](./backup-restore.md).

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

The **very first** boot of the installed build takes ~15 seconds — Windows Defender scans `php.exe` and the runtime DLLs on first read, PHP's opcache is cold, and the database is created and migrated. Every launch after that is a couple of seconds. This is normal; don't kill it during the first-run scan.

Measured on the shipped v2.42.0 build, from launch to the local API answering:

| | First launch | Later launches |
|---|---|---|
| Installed | 13.7 s | 2.4 s |

## Upgrading

1. Download the newer `Budojo-Setup-X.Y.Z.exe`.
2. Run it. It installs over the previous version.
3. Your data under `%APPDATA%\Budojo\` is untouched; any new database migrations run automatically on the next launch.

In practice you rarely do this by hand — the installed build updates itself, see [Updates](#updates).

Versioning follows the releases: `feat` changes bump the minor version, `fix` changes the patch. The in-app **What's new** screen summarises each release.

## Uninstalling

Uninstall from **Windows Settings → Apps**. By design the uninstaller **does not delete your data** — the database, documents and backups under `%APPDATA%\Budojo\` are left in place, so an accidental uninstall or a reinstall can't wipe the gym. To remove everything, delete `%APPDATA%\Budojo\` by hand after uninstalling — but **make a [backup](./backup-restore.md) first**, and read the note there about the encryption keys, because that folder is the only copy.

## See also

- [`architecture.md`](./architecture.md) — how the desktop build works.
- [`backup-restore.md`](./backup-restore.md) — protecting and recovering your data. **Read this early, not after a disaster.**

## Updates

From v2.43.0 the installed build **updates itself**. It checks the public releases shortly after launch and every six hours, downloads a new version in the background (only the changed blocks, thanks to the published blockmap), and installs it **when you next close Budojo** — never while you are working. A desktop notification tells you when one is waiting.

Nothing to configure, and nothing to click. If the machine is offline the check simply fails and is logged; the app starts normally.

Two caveats worth knowing:

- **Copies older than v2.43.0 have no updater at all.** They will sit on their version forever with nothing telling them. Install the current release once, by hand, and it takes over from there.
- **A portable copy never updated itself either** — it could not rewrite its own running executable, so it deliberately did not try. The portable is gone ([#1272](https://github.com/Budojo/budojo/issues/1272)); install the current release once and it takes over from there.
