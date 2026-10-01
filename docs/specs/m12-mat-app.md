# M12 — Budojo on the phone (PRD)

> Status: Proposed, **v2** · Owner: m-bonanno · Epic [#2026](https://github.com/Budojo/budojo/issues/2026) · Milestone M12
> **v2 (28 Sep 2026) replaces v1 the same day.** v1 gave the phone six kinds of change and a read-only snapshot. The owner then asked for **most actions** on the phone, and for the phone to **work without a PC**. That is a different product: v1's approach would have rebuilt every screen and every rule a second time. [§ Deltas from spec](#deltas-from-spec) records what changed and what stayed.
> This milestone replaces M9 (TWA) and M10 (Capacitor), which wrapped the hosted PWA. #1230 decommissioned that PWA, so there is nothing left for them to wrap.

## 1. Problem

The owner runs the academy from the desktop app. The day at the gym happens on the mat, not at the PC:
- who came;
- who paid, in cash;
- the new person trying a class, whose details go in on the spot;
- the stripe given at the end of class.

Today these wait in memory or on paper until someone types them in at the PC, and some never get there. Every number Budojo works out reads those rows:
- the attendance rates divide by the scheduled days, so an evening that is never registered counts against everyone (#1769);
- the arrears (#1760) read the payments;
- the promotion history reads the promotions.

**The owner's request, 28 Sep 2026, in two steps:**
1. *"Mark attendance and payments from the phone at training; the save goes to Google Drive; at home the Windows app pulls the updates, a bit like git."*
2. Then: *"Let's take it for granted that most actions can be done from the phone, not only the ones I listed."*

**Two more users are in view.** The owner, when the PC is not around (broken, a trip). And instructors with no PC at all: a karate instructor we are talking to asked about a tablet.

## 2. Decisions the owner took (28 Sep 2026)

Asked in four rounds, answered by the owner. They are requirements, not proposals.

| Question | Answer | What it means for the build |
|---|---|---|
| Who uses the phone app? | **The owner only.** Friends like Fede get their own academy (§ 12). | One Google account, no roles on the phone. |
| Can the phone work without the PC? | **Yes, for both cases:** the owner without their PC, and instructors with no PC | The phone is a **full Budojo**, not a satellite: it can create an academy, and every screen works on it. The PC becomes optional. |
| Which devices? | **PC + phone** | Two copies. The design allows more; M12 tests two. |
| Signal at the gym? | **Poor or patchy** | Offline is the normal case at the gym. The two copies *will* diverge sometimes, so reconciling them is core, not an edge case. |
| PC and phone on the same day? | **Same day, different times** | Divergence happens when the phone works offline after the PC changed something that afternoon. |
| Two changes to the same thing? | **Always ask me** | No silent last-writer-wins. A conflict stops and asks, on whichever device finds it. |
| Documents on the phone? | **View only** | Files sync so they can be opened; uploading stays on the PC for now (§ 11). |
| Reminders? | **Real phone notifications**, with the **full text on the lock screen** | The phone schedules them with Android, so they arrive with the app closed. The owner accepted the visibility. |
| Protection? | **Fingerprint to open** | A biometric lock on opening, and on returning after a few minutes away. |
| Home screen? | **Depends on the time** | Around a lesson it opens that lesson's check-in; otherwise Oggi. |
| First version? | **Check-in and payments, athlete records, promotions and grades** | Techniques and the lesson's notes come after (§ 8). |
| Updates? | **Notify me, I install** | A notice and one tap; Android asks for the confirmation. |
| Backup for a phone-only user? | **Strongly recommended** | They can start without Drive, and Budojo keeps reminding them until it is connected. |
| Other instructors? | **Free, to a few friends** | Google's free *limited distribution* developer account (up to 20 devices); their Gmail is added by hand as a Google test user. |
| Anything public? | **Nothing online**, the same day | The Google project stays in Testing, so each device signs in again every 7 days. No website, no hosted pages. |

## 3. Goals

1. **Everything in the first version works on the phone, offline:** the check-in, a payment, adding or editing an athlete, giving a promotion. No step waits for the network.
2. **Check in a class of 15 in under 60 seconds** on the phone. **Record a payment in two taps** from the check-in.
3. **Nothing is ever lost, and nothing is overwritten silently.** When both copies changed, every change is either applied or put to the owner as a question.
4. **When one device opens after the other worked, it is up to date within a minute,** and a line says what arrived.
5. **A phone with no PC is a complete Budojo:** it creates its academy, and backs up to Drive once connected.
6. **Nothing on Google Drive is readable without the academy's keys.**

## 4. Non-goals (M12)

1. **iOS, and a Play Store listing.** The APK is sideloaded.
2. **Several people working on one academy:** assistants, and roles on the phone. One owner, and their own devices.
3. **Real-time sync.** Copies meet when they can: at start, after a change, and on returning online.
4. **Uploading documents from the phone.** It is view only; a photographed certificate is in § 11.
5. **Athlete self check-in, and a shared tablet at the door.**
6. **Techniques and the lesson's notes, phone-first,** in the *first* version. They are the next step (#2037). Until then the PC's lesson sheet works at phone width.

## 5. How it works

### 5.1 The same Budojo on both devices

The phone runs **the same application as the PC**, with the same screens and the same rules:
- the Angular SPA, which is already written to work at phone width (`client/CLAUDE.md` § Desktop first, still usable on a phone);
- the Laravel API and its Actions;
- a SQLite database.

**How it differs from the desktop:**
- The shell is Capacitor instead of Electron, and the runtime profile is `mobile` instead of `desktop`. The same mechanism (`RuntimeProfile` + capabilities, `docs/desktop/architecture.md`) turns off what the phone does not have.
- A few screens get a phone-first version where the mat asks for one: the check-in, the payment sheet, the home screen by time of day.

**Why not a separate phone app (v1's approach).** "Most actions" would mean rebuilding most screens and re-expressing most rules for the phone, and the two copies of each rule would drift. One application answers the request, and the phone gets every feature the PC gains from then on.

**PHP on Android: settled by spike #2044 (28 Sep 2026). Native PHP works.** The WebAssembly fallback is not needed.

**How it runs:**
- a static PHP 8.4 for arm64, built from source in CI (`mobile/php/`);
- shipped inside the APK as `libphp.so`;
- started by the app on `127.0.0.1` with the framework's router, as the desktop runs `php.exe`.

**Measured on the owner's phone,** a real APK with a seeded demo academy (40 athletes, about 4,500 presences, 378 payments):

| | |
|---|---|
| Cold start after an install (unpacking the server, 1.2–1.5 s, happens once per update) | 2.0–2.2 s |
| Migrations at start | 0.3–0.5 s |
| The server ready | 0.27 s |
| The first request, which compiles the framework into OPcache's file cache | 156–170 ms |
| The athlete list, 20 times | p50 73–87 ms · p95 98–110 ms |
| A real check-in (a new row each time), 10 times | p50 86 ms · p95 86 ms |
| Logging in (bcrypt, deliberately slow; once per device, not per use) | 0.7–0.8 s |
| APK size | 26 MB |

**Three Android differences the spike had to meet,** each found on the phone and each now enforced by CI:
1. **W^X.** An app executes files only from its native library directory, so the binary travels as a library, with `useLegacyPackaging`.
2. **OPcache's shared-memory lock is refused** (*Cannot create lock - Permission denied*), so OPcache runs file-cache-only.
3. **The seccomp policy kills a process that calls `accept`,** and allows only `accept4`: exit 159, SIGSYS. PHP's two `accept()` calls are patched to `accept4(…, SOCK_CLOEXEC)`. The flag matters, because musl's `accept4` with flags 0 falls back to `accept`. CI serves a page from every build under a seccomp policy that kills on `accept`.

**Not measured yet:**
- battery over hours;
- RAM;
- a warm start after a force-stop (estimated at about 0.8 s: migrations plus the server).

**Our shell stays: decided by #2051 (1 Oct 2026),** against [NativePHP for Mobile](https://nativephp.com/mobile). NativePHP maintains PHP-on-Android for a living, and calls PHP in-process with no web server, so difference 3 cannot happen to it. It was weighed against what Budojo needs, from its source (v4.5.2) and its price list:

| Need | Our shell | NativePHP |
|---|---|---|
| **The Angular SPA** over REST | `fetch` to `127.0.0.1` | Works on a side path. A script wraps `fetch` and XHR and hands every request body to Kotlin in base64, and a URL containing `/js/`, `/images/` or `/fonts/` is served as a file. Its first-class UI is Blade, Livewire and its own native components. |
| **The fingerprint lock, notifications** (§ 2: €0) | Free Capacitor plugins, local notifications among the official ones | Biometrics is **$49, proprietary**; local notifications come only in paid bundles. €0 means writing both ourselves. |
| **Drive's authorization** (#2028) | Our own plugin | Our own plugin |
| **Our key, a sideloaded APK** | Done (#2027) | Possible: `native:package --keystore` builds locally |
| **The server codebase** | Unchanged | `nativephp/mobile` and its dependencies in `server/`, and Laravel **kept alive between requests** with a reset its own code calls "not Octane". Sanctum's guard keeps the first request's user (`RequestGuard::user()` caches it, and `setRequest` does not clear it), so a logout would not take effect until a restart. Every piece of long-lived state in the server would need an audit. |
| **The PHP binary** | Built from source in CI, pinned, tested under seccomp | Downloaded prebuilt from `bin.nativephp.com`, built in a repository that is not public |
| **Who keeps PHP-on-Android working** | Us: three quirks, each written down (`mobile/CLAUDE.md`) and pinned by CI | Them. This is its real advantage. |
| **The pace of change** | Ours | v3 in Feb 2026, v4.5.2 by Sep 2026: two majors in seven months |

**The verdict rests on what the source and the price list say, not on a measurement,** so no prototype was built. The one number NativePHP could win is the time per request, because it boots Laravel once. That would not change the verdict: p95 is already 110 ms, well inside the 400 ms in which a tap feels immediate.

**PHP called in-process from our own shell: not now, and kept as the way out.** It is what NativePHP's JNI bridge and its body-passing script are, a large piece of work for a problem we have already solved. **Revisit it if Android stops a server process in a way CI cannot reproduce:** a new seccomp rule, for instance, or the phantom process killer (Android 12+) killing it every time the app goes to the background.

**What #2034 takes from this:** when the app comes back to the foreground, it checks the server and restarts it if Android killed it in the background.

### 5.2 Sync: git for the database

The owner described git, and the design is git.

| Git | Budojo |
|---|---|
| a commit | a **version**: the whole database, published to Drive as one encrypted file, numbered, never rewritten |
| the commit's diff | the **journal**: every change the device made since the version it started from, recorded as it happened |
| `pull` | there is a newer version on Drive and nothing done locally: the device swaps in the newer database (**fast-forward**) |
| `push` | there are local changes and nothing newer on Drive: the device publishes its database as the next version |
| `rebase` | **both sides changed**: the device takes the newer version and **replays its own journal on top**, through the real Actions |
| a merge conflict | a replayed change the rules refuse, or that meets a different change to the same thing: **it stops and asks the owner** |

```
 PC                              Google Drive: Budojo/sync/                  Phone
 Budojo + SQLite                 versions/000041-pc.bjs                      Budojo + SQLite
   │ push v42 ─────────────────▶ versions/000042-pc.bjs      ──── pull ───▶  (at home, online)
   │                                                                          … at the gym, offline:
   │                                                                          check-ins, payments
   │ (afternoon: edits → v43) ─▶ versions/000043-pc.bjs                       its base is v42 …
   │                             versions/000044-phone.bjs   ◀── rebase ───  replays its journal on v43,
   │ ◀── pull (v44) ─────────────                                            asks on conflicts, pushes v44
   │ "Dal telefono: 14 presenze, 2 pagamenti"
```

**The rules that make it safe:**
- **A version is written once, under a new name.** Two devices never write the same file, so Drive never has to pick a winner.
- **A device pushes only on top of the latest version it can see.** If there is a newer one, it rebases first, so no push can erase the other side's work.
- **The journal records API writes, not rows**: the route, its parameters and the body, plus the ids the write created. For an update, it also records the values it saw before.
- **Replaying it runs the same Actions** with the same validation (#2031):
  - Ids the diverged side created (a new athlete) get new ids on the base, and the replay maps the old ones to them for every later change that names them.
  - A change that is already true, **exactly**, is skipped: a presence marked twice. For money, "the same month" is not enough. `RecordAthletePaymentAction` hands back the row it finds for the month (`createOrFirst` on athlete, year and month), so the replay compares the period, the amount, the method and the date, and anything that differs is a conflict (§ 2: always ask).
  - A change the rules refuse, or one whose field was changed on the base since, is a **conflict** and waits for the owner (§ 6.4).
- **Files travel apart from the database:** documents and athletes' photos, one encrypted file each, named by its content hash, uploaded once. The phone downloads one when it is opened (documents are view only there), and on Wi-Fi ahead of time.
- **A fast-forward is a restore, and does what lies outside the database too.** Swapping in a newer database runs no Observer, so the device then reconciles:
  - files no row names any more are deleted, as `DeleteDocumentAction` deletes them on the device where the athlete or document was removed. That rule is GDPR, not tidiness;
  - missing files are fetched when needed;
  - the application cache is cleared. The desktop's cache is on files (`CACHE_STORE=file`), and would otherwise answer from the old database, for example the attendance summaries.
- **The keys travel once, at pairing.** Encrypted fields and documents need the same `APP_KEY` and `DOCUMENT_ENCRYPTION_KEY` on both devices, and the recovery code (#1254) already carries both. The sync key goes with them.

**When a device syncs:**
- on opening, and on coming back to the foreground: pull, or rebase;
- a few seconds after a change: push;
- on regaining the network;
- on the PC, also every few minutes while the app is open, and on closing.

Nothing waits for the sync, and its state is always on screen (§ 6.2).

**Retention:** the latest versions, plus one a day for two weeks, **the same policy as the backups** (#1228, #1330). A version on Drive *is* a backup. For a phone-only user this is the Drive backup of § 2, with nothing else to build.

### 5.3 Transport and keys

- **Google Drive, the owner's account, scope `drive.file`.** The PC reuses #1301's OAuth; the phone uses Android's authorization client with the "Budojo Android" OAuth client (#2028). **The project stays in Testing** (§ 2): every 7 days a device signs in to Google again, in one tap from the sync state, and meanwhile keeps working offline with its versions waiting.
- **Every file is encrypted on the device:** AES-256-GCM with a random IV, and **the file's path as associated data**, so a file cannot be swapped for another and still decrypt. The key is the academy's sync key, which never leaves the devices except inside the pairing code.
- **Where on Drive:** a visible folder, `Budojo/sync/`. If #2028 finds that `drive.file` does not carry between the two OAuth clients, the fallback is the hidden `appDataFolder` (`drive.appdata`).
- **The transport is an interface,** `SyncRemote`: `DriveRemote` in production, and `FolderRemote` (a local directory) for the tests and the Linux dev environment, where two copies sync with no Google account.

### 5.4 Pairing, both ways

The device that has the academy shows a **pairing code**: a QR, plus the same code as words to type on a PC with no camera. It carries:
- the recovery code (the app keys);
- the sync key;
- the Drive folder;
- the protocol version.

**The new device:**
1. reads the code;
2. signs in to Google with the same account;
3. pulls the latest version.

**Either side can start it:** the PC can add the phone (the owner's case today), and a phone-only academy can later add a PC.

**Unpairing a lost phone:** the other device rotates the sync key and publishes under it, so the lost phone can read nothing new and its pushes stop being accepted. The app keys cannot rotate without re-encrypting the documents; the fingerprint lock (§ 6.1) is what protects the lost phone's local copy.

### 5.5 Versions of the app

- **Each version on Drive names the schema it was written with.** A device never opens a newer database than its code knows: it asks for the update first, as a backup restore already refuses a newer archive.
- **A device can pull an older database:** the boot migrations bring it forward, as they do for a restored backup.
- **The update notice** reads the latest GitHub release, and one tap downloads the APK. Android asks for the confirmation (§ 2).

## 6. UX

### 6.1 The phone

**Principles**, from the canon (`client/CLAUDE.md`, `DESIGN_SYSTEM.md`) applied to a hand at the edge of the mat:
- **One hand.** Actions sit in the lower half of the screen, rows are at least 56 px, and **there is no hover state**: a tap is not a hover, and hover sticks on touch (#2034's first finding).
- **Offline first.** No spinner stands between a tap and its result. The network is the sync's problem, never the screen's.
- **Nothing moves under the thumb.** Rows do not jump; a counter says who is in.
- **The belt spine on every person** (`<app-athlete-identity>`). State goes in a chip, never in the spine.

**What opens, by the clock.** From 15 minutes before a lesson to 30 minutes after it ends, the app opens on **that lesson's check-in**. Otherwise it opens on **Oggi**, the PC's own home screen. Each is one tap from the other.

**The fingerprint:**
- on opening, and on returning after 5 minutes in the background;
- the phone's own PIN is the fallback, through Android's biometric prompt;
- on a phone with no biometrics, the screen lock.

**The mat screens, where the phone gets its own version:**
- **Check-in:**
  - the class is picked by the clock;
  - *Chi viene di solito* (the class's regulars) first, then everyone;
  - a tap marks the athlete present, and a second tap undoes it.
- **«Da chiedere».** Once someone who owes is marked present, their payment chip says *Da chiedere · settembre*. The check-in knows who is standing in front of you and owes: the one moment the fee is easy to ask for. It shows only on the owner's phone.
- **The payment sheet,** opened from the chip:
  - the months due, oldest first;
  - the amount is the fee × the period, read-only;
  - *Contanti* preselected;
  - one button: *Registra 60 € · contanti*.
- **A new athlete in three fields:** first name, last name, belt. The rest waits for later. It is the trial class that walks in.
- **A promotion from the athlete's row:** belt and stripes, dated today.

**Everything else is the PC's screen at phone width,** which the canon already requires to work. The first version checks each flow it ships on a real phone (#2045).

### 6.2 The sync state, on both devices

A pill in the shell:
- ✓ *Allineato · 21:47*
- ↑ *3 da inviare · senza rete*
- ⚠ *1 da decidere*
- *Google ti ha scollegato: tocca per riconnettere*

Tapping it opens the detail:
- the last version on each side;
- the unsent changes, **in words**;
- *Sincronizza ora*.

**The homecoming («il rientro»).** When a device pulls the other's work, a card on Oggi says *"Dal telefono, martedì sera: 14 presenze in BJJ Gi, 2 pagamenti (120 €), 1 nuovo atleta"*. It reads the version's journal, so the owner sees what arrived without looking for it.

### 6.3 Notifications

- **The reminders are the scheduler's own** (#1226): the unpaid-fees digest, medical certificates and academy documents expiring, and the missed streak. **Birthdays are new.** Nothing reminds of them today; only the roster filter and Oggi's list read `BirthdayWindow`. The phone adds one reminder, from that same window.
- **With the app closed, Android runs nothing.** So each time the app opens or syncs, it works out the reminders due in the next days and **schedules them with Android** as local notifications. They arrive on time with the app closed.
- **A reminder about something that has changed since** (the fee got paid on the PC) is dropped at the next sync.
- **The full text shows on the lock screen,** as the owner chose (*"Marco R. deve settembre, 60 €"*): the notification channel is public. It can become a setting later.

### 6.4 «Da decidere»: conflicts

A conflict is a question, asked on whichever device found it. **It is never resolved silently** (§ 2).

- **One sentence per conflict, with both sides:** *"Pagamento di settembre per Marco R.: dal telefono 60 € in contanti il 30/9; sul PC c'è già un trimestrale da agosto."*
- **The choice:** *Tieni quello del telefono* · *Tieni quello del PC* · *Apri l'atleta*, to fix it by hand, then *Fatto*.
- **Until it is decided, the device keeps working.** The other changes of the same rebase are already applied; only the question waits, and the sync pill counts it.
- **What is never a conflict:**
  - a change that is already true (the same presence twice), which is skipped;
  - two changes to different things, which both apply.

### 6.5 The phone-only academy

- **First launch:** *"Hai già Budojo sul PC?"*
  - **Yes:** pair (§ 5.4).
  - **No:** create the academy on the phone, with the PC's own onboarding.
- **Then:** *"Salva su Google Drive"*, strongly recommended. Until it is connected, a line on Oggi at every launch says the data lives only on this phone. It is not a modal: it states the fact and blocks nothing.

## 7. Security and privacy

- **What the phone holds:** the whole database, as the PC does: athletes, payments, codice fiscale, document metadata. Documents are downloaded when they are opened.
- **How it is protected:** the fingerprint (§ 6.1), and Android's app-private storage.
- **No Android backup** (`allowBackup="false"`, already set in #2027). The copy that survives a lost phone is the versions on Drive, encrypted.
- **Google** sees only ciphertext, under names that mean nothing: sequence numbers and content hashes.
- **The APK signing key** was created in #2027. It is held in the repo secrets and in the owner's password manager; if it is lost, no update installs over the app.
- **The lock-screen text** shows names and amounts, the owner's choice (§ 6.3). It is recorded here because it is the one place the phone shows data without the fingerprint.

## 8. Plan (sub-issues of #2026)

Sizes: **S** is a day or less, **M** a few days, **L** a week or more. The **first version** (§ 2) is Phases 0–4; techniques follow it.

| Issue | Phase | What | Size | Needs |
|---|---|---|---|---|
| [#2027](https://github.com/Budojo/budojo/issues/2027) ✅ | 0 · Prove | The APK: the Capacitor shell, the release key, the CI build, storage that survives an update. Done 28 Sep. | M | — |
| [#2044](https://github.com/Budojo/budojo/issues/2044) ✅ | | **Laravel on Android:** Budojo's API running offline on the phone with SQLite. Native PHP works (§ 5.1). Done 28 Sep. | M | #2027 |
| [#2051](https://github.com/Budojo/budojo/issues/2051) ✅ | | NativePHP Mobile against our own shell, before the runtime. Our shell stays (§ 5.1). Done 1 Oct. | S | #2044 |
| [#2028](https://github.com/Budojo/budojo/issues/2028) | | Drive from the phone, shared with the desktop's OAuth client | M | #2027 |
| [#2029](https://github.com/Budojo/budojo/issues/2029) | 1 · Sync | The protocol v2: versions, journal, documents, envelope, `SyncRemote` | M | #2028 |
| [#2030](https://github.com/Budojo/budojo/issues/2030) | | Versions: export, fast-forward, retention (server) | M | #2029 |
| [#2031](https://github.com/Budojo/budojo/issues/2031) | | The journal and the rebase, with conflicts (server). `--deep` review. | L | #2029 |
| [#2032](https://github.com/Budojo/budojo/issues/2032) | | The sync engine on the desktop | L | #2030, #2031 |
| [#2033](https://github.com/Budojo/budojo/issues/2033) | | Pairing, both ways, with the keys | M | #2032 |
| [#2034](https://github.com/Budojo/budojo/issues/2034) | 2 · Budojo on the phone | The phone runtime: the SPA + Laravel in the shell, the `mobile` profile, offline. It retires `projects/mat`. | L | #2051 |
| [#2046](https://github.com/Budojo/budojo/issues/2046) | | The sync engine on the phone, the sync state, the fingerprint lock | M | #2034, #2032 |
| [#2035](https://github.com/Budojo/budojo/issues/2035) | | Home by the clock, and the phone check-in | M | #2034 |
| [#2036](https://github.com/Budojo/budojo/issues/2036) | | «Da chiedere», the payment sheet, Soldi | M | #2034 |
| [#2045](https://github.com/Budojo/budojo/issues/2045) | | Athletes and promotions on the phone: the new athlete in three fields, the promotion from the row, every flow checked on a phone | M | #2034 |
| [#2047](https://github.com/Budojo/budojo/issues/2047) | | Notifications scheduled with Android | M | #2034 |
| [#2048](https://github.com/Budojo/budojo/issues/2048) | | The phone-only academy: onboarding on the phone, the Drive nudge | S | #2046 |
| [#2038](https://github.com/Budojo/budojo/issues/2038) | 3 · Both sides | «Da decidere»: the conflicts screen, on both devices | M | #2031 |
| [#2039](https://github.com/Budojo/budojo/issues/2039) | | The homecoming card and the sync pill | S | #2032 |
| [#2040](https://github.com/Budojo/budojo/issues/2040) | 4 · Ship | The APK on every release, and its smoke test in `/release` | M | #2034 |
| [#2041](https://github.com/Budojo/budojo/issues/2041) | | The update notice, the install guide, developer verification | S | #2040 |
| [#2037](https://github.com/Budojo/budojo/issues/2037) | After the first version | Techniques and the lesson's notes, phone-first | M | #2034 |

**Testing.** The five layers apply as everywhere. On top of them:
- **The rebase is pinned by a harness:** two SQLite copies diverge through the real API, the journal is replayed, and the result is compared with the same changes applied in order. Every conflict kind has a fixture.
- **The crypto is pinned by known-answer vectors,** run in Node's crypto and in WebCrypto.
- **Every PR that touches the transport or the phone runtime** reports a real-process harness in its body: a real Drive folder, a real phone. That is how M11 accepted every surface.

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **PHP does not run well on Android:** boot time, memory, APK size, battery | ~~Medium~~ **Settled** | #2044 measured it on the owner's phone (§ 5.1): sub-100 ms requests, a 26 MB APK. Battery and RAM are still to measure. **Keeping PHP-on-Android working** (three quirks so far) is the remaining cost. #2051 weighed handing it to NativePHP and kept it, with in-process PHP as the way out (§ 5.1). |
| **The rebase maps an id wrongly, or replays a change twice** | Medium | The Actions are idempotent, each rebase keeps a mapping table, and the harness (§ 8) and a `--deep` review cover it. Every version is kept, so a bad rebase can be undone by going back one version. |
| **A long offline stretch piles up conflicts** | Low for one owner | Conflicts wait without blocking, the pill counts them, and the owner decides them on one screen. |
| **`drive.file` does not carry between the two OAuth clients** | Medium | #2028 checks it before anything is built on it; the fallback is `appDataFolder`. |
| **The weekly Google sign-in in Testing** | Certain (the owner's choice) | One tap from the sync pill, and work continues offline meanwhile. |
| **Android developer verification** (global in 2027) | Certain | The free limited-distribution account (up to 20 devices), registered before enforcement reaches Italy. |
| **A phone lost with changes not yet pushed** | Low | Push a few seconds after each change whenever online, and keep the unsent count always visible. |
| **A phone-only user never connects Drive** | Medium | The line on Oggi at every launch (§ 6.5). The data is theirs, and the nudge is honest about the risk. |
| **The APK signing key is lost** | Low, severe | Kept in the repo secrets **and** the password manager (#2027). |

## 10. Success metrics

- **Adoption:** the share of held lessons checked in from the phone. Target: 80% after four weeks.
- **Lost changes: zero.** Every journal entry ends applied, skipped as already true, or decided by the owner.
- **Conflicts:** under 2% of the changes replayed, and none resolved without the owner.
- **The owner** no longer does evening data entry at the PC. Asked after four weeks.
- **A phone-only academy** (Fede's, if he adopts it) runs for a month with no PC.

## 11. Later (not M12's first version)

| Idea | What it would take |
|---|---|
| Photograph a document on the phone | Uploading from the phone (the camera plugin), for phone-only academies first |
| Techniques and the evening's notes, phone-first | #2037, right after the first version |
| Assistants with their own phone and account | Roles on the phone, and a Drive folder shared across accounts, which `drive.file` does not allow without the Picker |
| A tablet at the door for self check-in | The `self` source already exists (#960); a locked-down mode on top of it |
| iOS | Capacitor supports it; PHP on iOS and Apple's distribution costs are the question |
| A lock-screen setting for the notification text | A preference over the channel's visibility (§ 6.3) |

## 12. Owner prerequisites

1. ✅ **A Google Cloud project,** done 28 Sep 2026:
   - `Budojo`, in Testing, scope `drive.file`, with the owner as test user;
   - a Desktop client, whose id and secret are repo secrets;
   - an Android client for `it.budojo.mobile`, with the release key's SHA-1.
2. **Android developer verification:** the free limited-distribution account (up to 20 devices, no ID). Register the package and the key before enforcement reaches Italy in 2027.
3. ✅ **The signing key** (created in #2027): into the password manager, with an offline copy.
4. **For each friend's academy:** add their Gmail as a test user in the Google project.

## Deltas from spec

- **28 Sep 2026: v1 → v2, the same day.** The owner widened the phone from three jobs to most actions, and asked that it work without a PC. v1's plan, a phone subset with six typed changes and a snapshot, would have rebuilt each screen and re-expressed each rule for the phone.
  - **What changed:** the phone runs the whole Budojo, and the sync exchanges whole database versions, plus a journal that is replayed on divergence (§ 5.2).
  - **What stayed:**
    - the transport (Drive, `drive.file`) and the encryption;
    - pairing by QR;
    - the check-in and payment designs, «Da chiedere» included;
    - the homecoming card;
    - the APK and its key (#2027);
    - the principle that no change is lost or overwritten silently.
- **1 Oct 2026: our shell stays (#2051).** NativePHP for Mobile was weighed against it before the runtime (#2034) was built on it, and lost on cost (€0), on fit with the Angular SPA and the server, and on where its PHP binary comes from (§ 5.1). PHP called in-process from our shell is the way out, kept for a reason we do not have yet.
