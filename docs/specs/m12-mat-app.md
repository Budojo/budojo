# M12 — Budojo on the mat (PRD)

> Status: Proposed · Owner: m-bonanno · Epic [#2026](https://github.com/Budojo/budojo/issues/2026) · Milestone M12
> This milestone replaces M9 (TWA) and M10 (Capacitor), which wrapped the hosted PWA. #1230 decommissioned that PWA, so there is nothing left for them to wrap.

## 1. Problem

The owner runs the academy from the desktop app. Three things happen **on the mat, not at the PC**:
- **who came:** the check-in;
- **who paid:** a fee handed over in cash, at the edge of the mat;
- **what was taught:** tonight's techniques, and a note on the evening.

Today these wait in memory, on paper or in a note to self until someone types them in at the PC. Some never get there, and every number Budojo works out reads those rows:
- the attendance rates divide by the days the academy was *scheduled* to train, so an evening that is never registered counts against everyone (#1769);
- the arrears (#1760) read the payments;
- the coverage (#1590), the suggestions (#1566) and tonight's room (#1860) read which lessons were held and who was in them.

The owner's request (28 Sep 2026, in short): *mark attendance and payments from the phone at training; the save goes to Google Drive; at home the Windows app pulls the updates, a bit like git. Attendance, payments and techniques from the phone; documents and planning the programme from the computer.*

A karate instructor we are talking to asked about a tablet at the gym, which is the same need.

## 2. The job

JTBD, best guess from the owner's own words and `academy-profile` (small academy, adults, gi and no-gi). Not interviewed.

| | |
|---|---|
| **Situation** | Standing at the edge of the mat, 2 minutes before or after class. Phone in one hand. Noisy, often poor signal (basement gyms), sometimes sweaty hands. |
| **Functional** | Record who is on the mat. Take a fee handed over in cash. Confirm what was taught tonight. |
| **Emotional** | Leave the gym knowing nothing needs typing in again. Trust that nothing got lost on the way. |
| **Social** | Ask for the fee at the right moment, when the athlete is standing there, discreetly and without sounding like a debt collector. Look organised in front of the students. |
| **Today's workaround** | Memory, paper, a WhatsApp note to self, the PC hours later. |
| **Biggest pain** | The double entry, and what gets forgotten between the gym and the PC. Above all the cash: a payment remembered wrongly is a person asked twice for money they already paid. |

## 3. Goals

1. **Check in a class of 15 on the phone in under 60 seconds**, with no signal.
2. **Record a cash payment in two taps** from the check-in: the chip, then the confirm button.
3. **When the PC opens after training, everything from the evening is there within a minute**, with no action, and a line says what arrived.
4. **No change is ever lost silently.** Each change from the phone is either applied, or shown on the PC as a decision to make.
5. **Nothing on Google Drive is readable without the pairing key.**

## 4. Non-goals (M12)

1. **iOS, and a Play Store listing.** The APK is sideloaded.
2. **A phone without a PC.** That means the whole app on the phone, so Laravel on Android (php-wasm, experimental). The phone is the PC's field notebook.
3. **Editing anything else from the phone:** athletes, documents, the programme, the timetable, the price list. The stats are not shown either.
4. **Real-time sync, and two people working at once.** Two phones marking the same class stay correct, because every change is idempotent, but nothing is designed around it.
5. **Assistants signed in with their own Google account.** M12 assumes one account, the owner's, on the PC and the phone.
6. **Background sync with the app closed.** It is P1 (§ 11). M12 syncs while the app is open and whenever it comes back to the foreground.

## 5. Decisions

| Question | Choice | Why |
|---|---|---|
| **What syncs** | **Changes one way, a read-only snapshot the other.** Never the database file. | A synced database file loses data in two ways. Whoever saves last erases the other side's day. And a SQLite file moved by a sync client ends up as conflict copies or corrupt: `docs/desktop/backup-restore.md` explains why a live WAL file can't just be copied. Git doesn't copy one repository over another either: it sends commits. |
| **Source of truth** | **The PC** | It holds every rule: overlapping periods, carnets, arrears, regulars, lesson adoption. The phone proposes a change; the PC applies it through the same Action a click on the PC runs. |
| **What the phone writes** | **Six kinds of change** (§ 6.3) | The three jobs the owner named. A seventh needs this PRD amended. |
| **Transport** | **Google Drive, the owner's account, scope `drive.file`** | The phone at the gym and the PC at home are never on the same network. It reuses #1301's OAuth: loopback, PKCE, `drive.file`, refresh token in the OS keychain. |
| **Where on Drive** | **A visible folder, `Budojo/sync/`**, beside #1301's backups. If spike #2028 shows `drive.file` cannot cross from the desktop client to the Android client, the fallback is the hidden `appDataFolder` (`drive.appdata`, also non-sensitive). | Visible matches #1301's reasoning. For sync the contents are ciphertext either way, so the fallback costs nothing the owner uses. |
| **Privacy** | **Every file encrypted on the device (AES-256-GCM). The key is created on the PC and handed to the phone by QR at pairing.** | Budojo is local-first (#1218), and Google carries the files without being able to read them. On top of that, the snapshot carries only what the mat needs (§ 6.2). |
| **Phone tech** | **Capacitor around a second Angular application in the client workspace** (`client/projects/mat`), with the native project in a top-level `mobile/`, beside `desktop/` | It reuses the theme, i18n, PrimeNG and `<app-athlete-identity>`. The screens are designed for the mat instead of the desktop pages squeezed down. Capacitor was already the plan in M10. |
| **Phone storage** | **IndexedDB**, confirmed durable by spike #2027 | A few hundred KB of data. Capacitor keeps it in the app's private storage, which only uninstalling or "clear data" removes. |
| **Distribution** | **`Budojo-Android-X.Y.Z.apk` on every GitHub release**, beside `Budojo-Setup-X.Y.Z.exe` | Sideloaded, no store. The PC shows a QR that points at it. |
| **Package name** | **`it.budojo.mobile`** | It matches `it.budojo.desktop`. It can never change once installed or registered, and "mobile" also fits a tablet. |

## 6. How it works

### 6.1 The picture

```
 PC: the source of truth             Google Drive: Budojo/sync/            Phone at the gym
 Laravel + SQLite + every rule       (only encrypted files)                snapshot + journal, offline
 ─ publishes a snapshot ──────────▶  snapshot/<seq>.bjs ───────────────▶  pulls it on open
 ─ applies the phone's changes ◀───  journal/<device>/<ulid>.bjs ◀───────  pushes after each change
 ─ writes an ack ─────────────────▶  acks/<device>.bjs ─────────────────▶  "✓ on the PC"
                                     devices/<device>.bjs  ◀─────────────  written once, at pairing
```

**Every file is written once and never rewritten**, except the ack and the device record, which only their owner writes. Nothing is ever edited by both sides, so Drive never has a conflict to resolve: a new snapshot is a new file, and a push is a new file in the phone's own folder.

**The transport is an interface** (`SyncRemote`) with two adapters:
- `DriveRemote` for production;
- `FolderRemote`, a local directory, for the tests and for the Linux dev environment, where a phone and a PC can be simulated with no Google account.

### 6.2 The snapshot (PC → phone)

A JSON document, gzipped, then encrypted. It is built by an Action on the PC and carries only what the mat needs.

| Carries | Never carries |
|---|---|
| The academy's name, martial art, timezone, belt ladder | Codice fiscale, address, email, phone number |
| The timetable: classes with weekday, times, mode | Documents and medical certificates, or their dates |
| Active athletes: id, name, belt and stripes, `is_self`, age (for the age chip) | Date of birth, notes on the athlete, emergency contacts, guardians |
| Per athlete: the fee as resolved today and the billing period, trains free, whether this month is covered, the overdue months, a spendable carnet and its balance | Payment history beyond the overdue months |
| Per class: its regulars today (`GetClassRegularsAction`) | Stats, the audit log |
| Lessons from 7 days back to 14 days ahead: date, class, planned or taught topics, notes | |
| The in-season programme: positions and techniques, mode, from-belt | |
| Per device: the last change applied (`applied_through`), and each change parked as a conflict | |

**When the PC publishes a snapshot:**
- when the app starts;
- after it applies the phone's changes;
- every 5 minutes while the app is open, but only when the content hash has changed;
- when the app closes, with a short timeout.

It keeps the three newest. **A test walks the snapshot JSON and fails on any field from the right-hand column**, so a later change to the Action cannot quietly widen it. **Budget:** under 100 KB gzipped for 80 athletes.

### 6.3 The journal (phone → PC)

Each push is **one immutable file** holding one or more changes. The phone writes only in its own folder. A change:

```json
{
  "op_id": "01J9ZQ3K7M2V8XH0B6T4N5R1CD",
  "v": 1,
  "device": "d_7f3a…",
  "type": "payment.record",
  "at": "2026-09-30T21:04:11+02:00",
  "base_snapshot": 42,
  "data": { "athlete_id": 17, "year": 2026, "month": 9, "period_months": 1, "method": "cash", "paid_at": "2026-09-30" }
}
```

| Type | Data | The PC applies it through | Already true | Conflict |
|---|---|---|---|---|
| `attendance.mark` | athlete, class, date | `MarkAttendanceAction` (with the class) | already present → `duplicate` | athlete or class no longer exists |
| `attendance.unmark` | athlete, class, date | `DeleteAttendanceAction` on the row that key finds | no such row → `duplicate` | — |
| `payment.record` | athlete, year, month, period, method, paid on | `RecordAthletePaymentAction` | the same period already recorded → `duplicate` | an overlapping period (the Action's 422), no fee applies, athlete gone |
| `payment.void` | athlete, year, month | `DeleteAthletePaymentAction` | nothing covers the month → `duplicate` | — |
| `lesson.topic.add` / `.remove` | class, date, topic | `SetLessonTopicsAction`, read-modify-write on the PC | already in / already out → `duplicate` | topic deleted, or outside the class's mode |
| `lesson.notes.set` | class, date, text | `SetLessonNotesAction` | same text → `duplicate` | the PC changed the notes after `base_snapshot` |

**Rules that hold for every type:**
- **The date is the business date on the phone, in the academy's timezone, and it travels inside the change.** It is never resolved at apply time, because the PC may apply Tuesday's check-in on Thursday. `at` only orders one device's changes.
- **Topics are added and removed, never set as a list.** "Add the armbar" commutes with the plan the PC edited in the meantime; "the list is now X" would erase it.
- **The actor is the owner.** The audit entry says it came from the phone and names the device.

### 6.4 Applying on the PC

A table, `mat_ops`, is the PC's inbox. It holds:
- `op_id` (the primary key);
- `device`, `type`, `payload`;
- `status`: `applied`, `duplicate`, `conflict`, `discarded` or `failed`;
- `reason`, `received_at`, `applied_at`, `resolved_at`.

- **Idempotent by `op_id`.** A change seen twice is applied once. That covers an ack that got lost, and two PCs applying the same journal.
- **One device's changes are applied in `at` order;** devices are independent.
- **A conflict is parked, never dropped.** The PC shows it (§ 7.2), and the owner discards it, or fixes the data and retries.
- **A restore from backup is safe.** Restoring rolls back `mat_ops` with the rest of the database, and the journal files stay on Drive for 30 days after their ack. The next sync applies them again, idempotently.
- **Where the code lives:**
  - The domain half is in Laravel: `ApplyMatOpAction` and `BuildMatSnapshotAction`, run by the artisan commands `budojo:mat-apply` and `budojo:mat-snapshot`.
  - The transport and the crypto are in the Electron main process, which runs those commands through `php-exec` as it already does for the scheduler.
  - The browser never touches a file on Drive.

### 6.5 What the phone shows before the PC has seen it

The phone shows **the snapshot plus its own changes the PC has not applied yet**: those with an `op_id` after the device's `applied_through`. A check-in reads as done the moment it is tapped, and a payment turns the chip green at once. When the next snapshot includes them, the local layer empties. A change the PC parked as a conflict shows on the phone as *"1 change to look at on the PC"*. **The phone never resolves a conflict itself.**

### 6.6 Versions

- **The protocol has a version.** The snapshot carries `protocol` and `min_mobile_version`.
- **The phone never refuses a tap.** If the PC has moved to a newer protocol, the phone keeps recording and holds its journal, and asks for the update before it sends anything.
- **The PC reads the current and the previous version of each change type**, so the phone and the PC can be updated a day apart.

### 6.7 Security

- **The key.** 256 bits, created on the PC at pairing. It is stored:
  - on the PC in the token vault (DPAPI), like the Drive refresh token;
  - on the phone in storage backed by the Android Keystore.

  AES-256-GCM, with a random 96-bit IV per file and **the file's path as associated data**, so a file cannot be swapped for another and still decrypt.
- **Pairing.** The QR carries the folder, the key, the academy's name and the protocol. A phone that pairs while the PC's dialog is open is accepted on the spot, because the owner is standing there. A device record that shows up later waits for an explicit accept on the PC. **A photo of the QR is enough to read, not to write.**
- **Unpairing (a lost phone).** The PC rotates the key, publishes under the new one and refuses any change from the unpaired device. The other devices pair again.
- **Google.** `drive.file` only: Budojo sees the files it created and nothing else in the account. The file names are sequence numbers and ULIDs, which say nothing.
- **The APK signing key.** It is created once, and stored in the repo secrets and in the owner's password manager. If it is lost, no update installs over the old app, and the only way out is to uninstall, which loses any change not yet sent.

## 7. UX

### 7.1 The mat app

**Principles**, from the canon (`client/CLAUDE.md`, `DESIGN_SYSTEM.md`) applied to the mat:
- **One hand.** Actions sit in the lower half of the screen, and rows are at least 56 px (above the 48 px floor): the phone is held at arm's length, standing up.
- **Offline first.** No spinner ever stands between a tap and its result. The network is the sync's problem, never the check-in's.
- **The clock picks the lesson.** It opens on the class running now, or the next one today. Switching class is one tap in the header.
- **Nothing moves under the thumb.** A row does not jump when it is marked; the counter and a filter say who is in.
- **The state is always visible.** A pill in the header shows the sync state, and an unsent change is never hidden.
- **The belt spine on every person** (`<app-athlete-identity>`); state goes in a chip, never in the spine.
- **The rest of the canon:** haptic feedback on a mark, the theme follows the system, it/en with parity, screen-reader labels ("Luca Bianchi, blue belt, present, September to ask").

**Screens.** Three destinations in a bottom bar: **Stasera**, **Soldi**, **Stato**.

1. **Stasera: check-in.**
   - **Header:** the class and its time, the counter (*"14 sul tatami"*) and the sync pill.
   - **List:** a search field on top; then *Chi viene di solito* (tonight's regulars from the snapshot); then everyone else A–Z.
   - **A tap** marks the athlete present, and a second tap undoes it.
   - **The chip on the right** shows the payment state: covered, *Gratis*, a carnet with its balance, or the month due.
   - **The signature, «Da chiedere».** When an athlete who owes is **marked present**, the chip turns into *Da chiedere · settembre*. The check-in knows who is standing in front of you and owes, which is the one moment the fee is easy to ask for. Nobody else sees it: it is on the owner's phone, not on a board.
   - **A segment switches to Tecniche** (screen 3), because both are about tonight's lesson.
2. **The payment sheet**, a bottom sheet opened from the chip:
   - the athlete's identity, then the unpaid months, oldest first, with the one the chip named selected;
   - **the amount is the fee × the period, read-only.** Budojo snapshots the fee and does not model a different price (`athlete-payment.md`);
   - the method, with *Contanti* preselected because this is the mat;
   - one primary button, *Registra 60 € · contanti*, then an undo toast.
3. **Tecniche.**
   - Tonight's plan from the PC, as a checklist.
   - *Aggiungi* opens the programme, searchable, grouped by position and filtered to the class's mode, as the suggestions are.
   - A field for the evening's notes.
   - **Nothing is planned here:** the programme is the PC's job.
4. **Soldi.** *Chi deve ancora pagare* this month: tonight's people first (*"sono qui stasera"*), then the rest, with *"anche agosto"* on anyone behind. Each row opens the payment sheet.
5. **Stato.**
   - When the PC last received a change (*"Tutto arrivato sul PC · 21:47"*), and how fresh the data is (*"Dati del PC di lunedì alle 18:02"*).
   - The unsent changes, in words (*"Presente: Luca B., BJJ Gi, mar 19:30"*), and a *Invia ora* button.
   - Errors in plain language, each with its fix (*"Google ti ha scollegato: accedi di nuovo"*).
   - The paired PC, and the app version.
6. **Collega (first run), three steps:**
   1. On the PC: *Dati e backup → Telefono → Collega un telefono*.
   2. Scan the QR.
   3. Sign in to Google with the same account as the PC.

   Then the first download, and the app opens on Stasera.

**On a tablet (≥ 768 px):** the list on the left and the sheet on the right, for an instructor who leaves a tablet at the edge of the mat.

### 7.2 The PC

1. **Dati e backup → Telefono**, next to the existing Drive connection:
   - connect Google (the #1301 connection, shared);
   - *Collega un telefono* opens the QR dialog, with a second QR to download the app;
   - the paired devices: name, last contact, unsent count, *Scollega*.
2. **The state in the shell:** a small indicator beside the title bar, reading *Telefono aggiornato*, *3 novità* or *Drive non raggiungibile*.
3. **The homecoming («il rientro»).** When changes arrive, a card on Oggi says *"Dal telefono, martedì sera: 14 presenze in BJJ Gi, 2 pagamenti (120 €), 3 tecniche"*. It links to the log. This is the moment the owner was describing: back home, and everything is already there.
4. **Dal telefono**, the log:
   - the arrivals, grouped by evening and lesson, each linking to the athlete or the lesson;
   - **Da decidere** on top: each conflict in a sentence (*"Pagamento di settembre per Marco R.: sul PC c'è già un trimestrale da agosto"*), with *Scarta* or *Riprova* (after fixing the data by hand).

## 8. Plan (sub-issues of #2026)

Sizes: **S** is a day or less, **M** a few days, **L** a week or more.

| Issue | Phase | What | Size | Needs |
|---|---|---|---|---|
| [#2027](https://github.com/Budojo/budojo/issues/2027) | Prove the risky parts | The Angular mat app as a signed APK built in CI; storage that survives an update | M | — |
| [#2028](https://github.com/Budojo/budojo/issues/2028) | | Drive from a sideloaded APK, shared with the desktop client (decides § 5 "Where on Drive") | M | the owner's Google project, #2027's key |
| [#2029](https://github.com/Budojo/budojo/issues/2029) | The sync channel | The protocol, v1: layout, envelope, change and snapshot schemas, `SyncRemote` + `FolderRemote` | M | #2028's verdict |
| [#2030](https://github.com/Budojo/budojo/issues/2030) | | The snapshot, on the server | M | #2029 |
| [#2031](https://github.com/Budojo/budojo/issues/2031) | | Applying the phone's changes, on the server (`mat_ops`) | L | #2029 |
| [#2032](https://github.com/Budojo/budojo/issues/2032) | | The desktop sync engine | L | #2029, #2030, #2031 |
| [#2033](https://github.com/Budojo/budojo/issues/2033) | | Pairing a phone, on the desktop | M | #2032 |
| [#2034](https://github.com/Budojo/budojo/issues/2034) | The mat app | Pairing, first sync, local store, journal, the Stato tab | L | #2029, #2027 |
| [#2035](https://github.com/Budojo/budojo/issues/2035) | | Stasera: check-in | M | #2034 |
| [#2036](https://github.com/Budojo/budojo/issues/2036) | | The payment sheet and Soldi | M | #2034 |
| [#2037](https://github.com/Budojo/budojo/issues/2037) | | Tecniche and the evening's notes | M | #2034 |
| [#2038](https://github.com/Budojo/budojo/issues/2038) | The PC side | Dal telefono: the log and the decisions | M | #2031 |
| [#2039](https://github.com/Budojo/budojo/issues/2039) | | The homecoming: the state in the shell and the card on Oggi | S | #2032 |
| [#2040](https://github.com/Budojo/budojo/issues/2040) | Ship | The APK on every release, and its smoke test in `/release` | M | #2027 |
| [#2041](https://github.com/Budojo/budojo/issues/2041) | | Updates, the install guide, developer verification | S | #2040 |

**Testing.** The five layers apply as everywhere. On top of them:
- **The crypto** is pinned by known-answer vectors, run in both Node's crypto and WebCrypto.
- **The mat app's E2E** runs at phone width against a `FolderRemote`.
- **Every PR that touches the transport** reports a real-process harness against a real Drive folder in its body, as M11 did ("13/13 harness").

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `drive.file` access does not carry from the desktop's OAuth client to the Android one | Medium | #2028 checks it before anything is built on it. The fallback is `appDataFolder`, which belongs to the Cloud project rather than to one client; #2028 checks that too. |
| Refresh tokens expire after 7 days | Certain in Testing | Publish the consent screen to Production. `drive.file` is non-sensitive, which keeps the app out of Google's sensitive-scope review (#1301). |
| Android developer verification | Certain, global in 2027 | Register `it.budojo.mobile` and the signing key before it reaches Italy. The free limited-distribution account covers up to 20 devices. |
| A phone without Google Play services (some Huawei) | Low | Not supported; the install guide says so. |
| A phone lost or wiped with changes not sent | Low | Push on every change while online, and keep the unsent count always on screen. Background sync is P1. |
| The signing key is lost | Low, severe | Kept in the repo secrets **and** the password manager. The release flow checks that the key is present. |
| The PC's rules refuse a change (overlap, athlete gone) | Low | Parked in *Da decidere*, never dropped. |
| The phone's clock is wrong | Low | The business date travels in the change, and `at` only orders one device's changes. |
| The phone grows into the whole app | High | § 4, and six change types. A seventh amends this PRD. |

## 10. Success metrics

- **Adoption:** the share of held lessons whose check-in came from the phone. Target 80% after four weeks.
- **Speed:** the median time from a lesson's end to its payments showing on the PC.
- **Lost changes: zero.** Every `op_id` in a journal file has a `mat_ops` row within a day of the PC opening.
- **Conflicts:** under 2% of changes.
- **The owner** no longer does evening data entry at the PC. Asked after four weeks.

## 11. Later (not M12)

| Idea | What it would take |
|---|---|
| Sell a carnet at the mat | A seventh change type over `SellCarnetAction` |
| Add a trial athlete | A change that **creates** a row: an id made on the phone, mapped on the PC, and every later change naming it |
| Give a stripe at the end of class | A change over the promotion Actions, which carry the promotion history's own rules |
| Warn at check-in about an expired medical certificate | A single flag in the snapshot, after a note in `docs/legal/dpia-medical-certificates.md` |
| Background sync with the app closed | Android WorkManager through a Capacitor plugin |
| Assistants on their own Google account | Sharing the folder, which `drive.file` does not allow without the Picker |
| A tablet at the door for athletes to check themselves in | The `self` source already exists (#960) |
| iOS | Capacitor supports it; the Apple distribution costs are the question |
| The phone without a PC | Laravel in php-wasm, a spike of its own |

## 12. Owner prerequisites

1. **A Google Cloud project for Budojo:**
   - enable the Drive API;
   - OAuth consent screen: External, scope `drive.file`, **published to Production**;
   - a **Desktop app** client, whose id and secret go into the `BUDOJO_GOOGLE_CLIENT_ID` / `_SECRET` repo secrets. This also unblocks #1301;
   - an **Android** client for `it.budojo.mobile`, with the SHA-1 of the signing key (#2027 produces it).
2. **Android developer verification:** a free limited-distribution account (up to 20 devices, no ID) or the $25 full one (ID). Register the package and the key before enforcement reaches Italy in 2027.
3. **The signing key and its passwords in the password manager.**

## Deltas from spec

None yet. This section records what the implementation changed, as the other PRDs do.
