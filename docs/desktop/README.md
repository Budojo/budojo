# Budojo Desktop

Budojo ships as a Windows desktop application (M11, [#1218](https://github.com/Budojo/budojo/issues/1218)): the same Angular SPA + Laravel API that ran hosted, packaged with Electron and a bundled PHP runtime so everything runs on the owner's machine — no server, no account, no monthly bill. The hosted stack was decommissioned in [#1230](https://github.com/Budojo/budojo/issues/1230).

| Doc | Read it when |
|---|---|
| [`architecture.md`](./architecture.md) | You want to know how it works — process model, `app://` transport, PHP supervision, capabilities, data layout, secrets. |
| [`install.md`](./install.md) | You're installing or upgrading — the two builds, the SmartScreen warning, what first run does. |
| [`backup-restore.md`](./backup-restore.md) | **Before you rely on the app.** How backups work, how to restore, and the one recovery scenario that fails quietly (the encryption keys). |

The decommissioned hosted stack's runbook is archived at [`../infra/archive/production-deployment.md`](../infra/archive/production-deployment.md) — a record only, nothing there is live.
