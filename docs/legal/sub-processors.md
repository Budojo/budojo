# Sub-processors (#225, #1255)

Last updated: 2026-11-09

The canonical, English source of `/sub-processors` (EN) and `/sub-processors/it` (IT). The three
change together, in the same PR.

## Why Budojo has no sub-processors

A **sub-processor** processes personal data for a processor (GDPR Art. 28). Budojo is not a
processor of the academy's data: the app runs on the academy's own devices (a Windows app and an
Android app), and Budojo receives none of the data. So Budojo has no sub-processors. Each academy
is the data controller of its own data and its athletes' data (the project owner's decision,
9 Nov 2026, #1255).

The app still contacts a few third parties. Each is a service of the academy's own, or a public
endpoint; none of them works for Budojo.

## Third parties the app contacts

| Who | When | What it sees | Whose relationship |
|---|---|---|---|
| **Google** (Drive, sign-in) | Only if the academy connects its Google account: the PC's backup copy, every 6 hours while the app is open (#1301); the sync between PC and phone (M12); signing in on the phone. | The backup archives: a database that is mostly plain text, and the encrypted documents. The sync files, sealed with AES-256-GCM under the academy's sync key. The keys, in the account's hidden application data. Scopes `drive.file` and `drive.appdata`. | The academy's own Google account, under the academy's agreement with Google. |
| **GitHub** | The PC checks GitHub Releases for a new version and downloads it from there (electron-updater, `desktop/electron-builder.yml`). The phone asks `api.github.com/repos/Budojo/budojo/releases` for the latest releases, to show an update notice (`client/src/app/core/mobile/app-update.ts`). | The device's IP address and user agent. No academy data. | The public page where Budojo publishes its releases. |
| **Sites behind the links the owner opens** (YouTube, WhatsApp…) | Only when the owner clicks a technique's video link or a WhatsApp button. The link opens in the device's browser or app (`shell.openExternal` on the desktop); the app fetches nothing from these sites by itself. | What any visit shows them. A WhatsApp link also carries the phone number or the message it opens. | The owner's own browser and accounts. |

A backup folder the owner chooses (#1320) is written like any other folder. If a cloud service
syncs it, that service is the academy's own choice too.

**Google's whole reach, said plainly.** Whoever controls the academy's Google account can read the
gym's data: the database in the backups is mostly plain text, and once the phone is connected, the
keys beside it open everything else, medical certificates included (`docs/specs/m12-mat-app.md`
§ 5.4). The pages recommend Google's 2-step verification.

## What is not there

- No Budojo server, hosting or CDN. The hosted stack (Cloudflare, DigitalOcean, Laravel Forge),
  which this page used to list, was shut down in #1230.
- No email provider: the desktop runs with `MAIL_MAILER=log` (`desktop/src/php-runtime.ts`).
- No push service: the phone's reminders are local notifications
  (`@capacitor/local-notifications`).
- No analytics, error tracking or crash reporting.

The `desktop` and `mobile` runtime profiles enable only `document_upload`/`sync` and `sync`
(`server/config/budojo.php`). Community, athlete accounts, web push, email and the password-breach
check are web-only and are not shipped, so the oEmbed fetch of community shared videos
(`ResolveVideoPreviewAction`) and the `youtube-nocookie.com` player never run in the shipped apps.

## Change process

If a version of the app starts contacting a new third party, this file and the two pages change in
the same release.

## Auditing this list against the codebase

A future engineer (or auditor) can verify this list by grep:

```bash
# Every host the desktop main process calls (today: Google's three; GitHub is electron-updater's)
grep -rhoE "https://[a-z0-9.-]+" desktop/src --include=*.ts --exclude=*.spec.ts | sort -u

# Outbound HTTP from the local server (all of it is behind web-only capabilities today)
grep -rn "Http::" server/app

# Third-party SDKs in the client, the desktop and the phone
grep -rE "sentry|analytics|firebase|crashlytics|posthog|mixpanel" \
  client/package.json desktop/package.json mobile/package.json server/composer.json
```

A host that turns up there but is missing from THIS file is a third party we forgot to disclose.

## Related

- Privacy policy — `docs/legal/privacy-policy.md` (#219)
- Cookie audit — `docs/legal/cookie-audit.md` (#221)
- Account deletion — `docs/legal/account-deletion.md` (#688)
