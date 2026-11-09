# Account deletion

Canonical English source — auditor- and reviewer-readable. Two SPA components mirror this content per the standing lock-step rule (`/privacy{,/it}` is the precedent): edits here MUST land in the same PR as `client/src/app/features/account-deletion/account-deletion.component.html` (English at `/account-deletion`) and `client/src/app/features/account-deletion/it/account-deletion-it.component.html` (Italian at `/account-deletion/it`).

The page was first written for Google Play's Data Safety form, which asks an app that supports account creation for a public URL describing account deletion. Since the hosted stack was shut down (#1230) it describes how to remove the data from where it actually lives (#1255).

## 1. There is no Budojo account to close

Budojo is a Windows and Android app that runs on the academy's own devices. No account lives on a Budojo server, and Budojo receives none of the data. So deleting means deleting the data where it is: on the PC, on the phone, and in the academy's Google account if it was connected.

What the code still holds, and why it does not apply: the hosted 30-day flow (`POST /api/v1/me/deletion-request` → `RequestAccountDeletionAction`, then `PurgeAccountAction` from `budojo:purge-expired-pending-deletions`) is still in the server and still scheduled, but no screen in the client calls it. The page therefore offers no in-app deletion and no grace window.

## 2. Before you delete

- If there is any chance you will want the data back, take a backup first (**Data & backup → Back up now**) and keep it somewhere safe, with your recovery code (#1254).
- To keep a readable copy, on the PC: **Settings → Account → Download my data** saves a ZIP file with the academy's data and documents (`GET /api/v1/me/export?format=zip`, GDPR Art. 15 and 20).

## 3. On the PC

1. If Google Drive is connected: in **Data & backup**, choose **Disconnect** under **Google Drive backup**. The copies stop; the backups already on Drive stay until you delete them (§ 5).
2. Uninstall Budojo from Windows.
3. Delete the folder `%APPDATA%\Budojo\`. **Uninstalling does not touch it** ([`docs/desktop/architecture.md`](../desktop/architecture.md) § Data layout): it holds the database, the documents, the local backups, the logs and the keys (`secrets.bin`).
4. Delete the archives in the backup folder, if you chose one (#1320): a USB stick, a network drive, a synced folder. Uninstalling leaves them there; Budojo only ever rotates its own archives in that folder.

## 4. On the phone

Uninstall Budojo. Its data lives only in the app's private storage, excluded from Android's cloud backup and from the transfer to a new phone (`mobile/android/app/src/main/res/xml/data_extraction_rules.xml`), so no copy of it stays on Android's side.

## 5. In the academy's Google account

Only if the academy connected Google Drive:

- Delete the `Budojo` folder in Google Drive: the backups (#1301) and the sync files (`Budojo/sync/`, `docs/sync/protocol.md`). Then empty Drive's trash.
- Delete Budojo's hidden app data (`budojo-keys.json` in `appDataFolder`, where the keys are): in Google Drive's settings, under Manage apps.
- Remove Budojo's access from the Google account's security settings.

## 6. What Budojo keeps

Nothing. Budojo operates no server and keeps no copy, log or backup of the academy's data. Update checks reach GitHub, which sees the device's IP address and never any academy data.

## 7. When an athlete asks to be erased

Athletes exercise their right to erasure (GDPR Art. 17) **with the academy**, the controller, not with Budojo.

- Removing an athlete in the app takes them off the roster and deletes their documents' files (`AthleteObserver`). Their record and history (attendance, payments, belts) stay in the database: `DELETE /api/v1/athletes/{id}` is a soft delete ([`docs/entities/athlete.md`](../entities/athlete.md)).
- Older backups keep the data until they rotate out: about two weeks of the app being open (#1330).

## 8. Contact

- **Questions about the software** — privacy@budojo.it
- **Who controls the data** — see the [Privacy Policy](/privacy) (English) or the [Informativa sulla Privacy](/privacy/it) (Italian, legal source of truth)
- **Right to lodge a complaint** with the Italian DPA (Garante per la protezione dei dati personali) — https://www.garanteprivacy.it

## 9. Versioning

This page is updated whenever the way to remove the data changes. The version number and last-updated stamp are rendered at the bottom of the SPA pages.

- Version: 2.0
- Last updated: 2026-11-09
