# UX/UI audit — Budojo Desktop v2.61

A screen-by-screen review of the app as shipped at v2.61.1, filed as epic #1614. One section per screen: what it is for, what is right about it, what is wrong and against which rule, and what would make it better. Every intervention has an issue; the positive judgements and the deliberate non-interventions live only here, so that the next person to open a screen knows what was already looked at and left alone on purpose.

**Companion pieces**

- The harness that produced every picture: [`client/cypress/inventory/desktop-audit.cy.ts`](../../client/cypress/inventory/desktop-audit.cy.ts) — `npm run design:audit` regenerates all of them, `npm run design:audit -- 22-athlete` one area.
- Mockups for the structural proposals: [`preview/audit-v2.61/`](./preview/audit-v2.61/README.md).
- The canon this judges against: [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md), [`README.md`](./README.md) (voice, casing, iconography), and `client/CLAUDE.md` § Design canon.

## Method

| | |
|---|---|
| Viewports | **1280×860**, the Electron window's default, and **960×600**, the smallest it allows (`desktop/src/main.ts`) |
| Locale | Italian, the real users' language; English checked wherever a string read wrong |
| Runtime | `profile: desktop`, no capabilities — what the shipped build exposes and nothing the web profile adds |
| Data | Stubbed and deterministic. Eight athletes, six classes, a 31-technique programme, a season two weeks old. The clock is frozen at **Monday 14 September 2026, 18:30**: in season, half an hour before the evening class, which is when the check-in actually gets opened |
| States | Populated first, then the empty state, the error state and the dialogs where a screen has them |

**Grades**

- **P1** — blocks or misleads a task: a wrong number, a dead control, an action that cannot be reached
- **P2** — costs the reader time or trust on every visit: hierarchy, copy, a canon rule broken where it shows
- **P3** — polish, or a feature the screen is visibly missing

**Not audited.** Everything frozen on the desktop profile (#1229): the athlete portal, community, support, the invite, public profiles, browser push, the email-verification flows. Nobody on the shipped build can reach them.

## Index

One row per screen, worst grade first in the column, every finding named, and the issues that carry them. Positive judgements are in the sections, not here.

| § | Screen | Route | Worst | Findings | Issues |
|---|---|---|---|---|---|
| 0.1 | Welcome | `/` | P3 | LND-1 | — |
| 0.2–0.4 | Sign in, register, forgot, reset | `/auth/*` | P1 | AUTH-1, AUTH-2, AUTH-3, AUTH-4, AUTH-5, AUTH-6, AUTH-7, AUTH-8, AUTH-9 | #1620, #1621, #1622 |
| 0.5 | Set up the academy | `/setup` | P2 | SETUP-1, SETUP-2, SETUP-3 | #1623, #1626 |
| 1.1 | Help | `/help` | P1 | HELP-1, HELP-2, HELP-3 | #1616, #1660 |
| 1.2 | Legal pages | `/privacy/it …` | P3 | LEGAL-1, LEGAL-2 | #1660 |
| 1.3 | Error pages | `/offline, /error, 404` | P1 | ERR-1 | #1617 |
| 10.1 | Academy home | `/dashboard/academy` | P2 | ACAD-1, ACAD-2, ACAD-3 | #1627, #1643 |
| 10.2 | Timetable | `/dashboard/academy/timetable` | P3 | TT-1, TT-2, TT-3, TT-4, TT-5 | #1644, #1648 |
| 10.3 | Programme | `/dashboard/academy/syllabus` | P2 | SYL-1, SYL-2, SYL-3, SYL-4, SYL-5 | #1629, #1630, #1661 |
| 10.4 | Edit academy | `/dashboard/academy/edit` | P2 | ACADE-1, ACADE-2, ACADE-3, ACADE-4, ACADE-5, ACADE-6 | #1623, #1627, #1628 |
| 10.6 | Activity | `/dashboard/academy/activity` | P2 | ACT-1, ACT-2, ACT-3 | #1624, #1631 |
| 20.1 | Roster | `/dashboard/athletes` | P1 | ATH-1, ATH-2, ATH-3, ATH-4, ATH-5, ATH-6 | #1618, #1623, #1632, #1649 |
| 20.2 | Add athlete | `/dashboard/athletes/new` | P3 | ATHF-1, ATHF-2, ATHF-3, ATHF-4 | #1628, #1650, #1651 |
| 20.3 | Import | `/dashboard/athletes/import` | P3 | IMP-1 | #1658 |
| 20.4 | Athlete header and tabs | `/dashboard/athletes/:id` | P2 | DET-1, DET-2, DET-3, DET-4 | #1623, #1633 |
| 20.5 | Documents tab | `…/documents` | P2 | DOC-1, DOC-2, DOC-3, DOC-4, DOC-5 | #1625, #1652 |
| 20.6 | Attendance tab | `…/attendance` | P2 | ATT-1, ATT-2, ATT-3 | #1635 |
| 20.7 | Payments tab | `…/payments` | P2 | PAY-1, PAY-2, PAY-3, PAY-4, PAY-5, PAY-6, PAY-7 | #1636, #1654 |
| 20.8 | Coverage and promotions tabs | `…/coverage, …/promotions` | P2 | COV-1, COV-2, COV-3, PROMO-1, PROMO-2, PROMO-3, PROMO-4 | #1624, #1646, #1647, #1653 |
| 20.9 | Edit tab | `…/edit` | P2 | EDIT-1 | #1634 |
| 23 | Expiring documents | `/dashboard/documents/expiring` | P2 | EXP-1, EXP-2, EXP-3 | #1625 |
| 30.1 | Check-in | `/dashboard/attendance` | P2 | CHK-1, CHK-2, CHK-3, CHK-4, CHK-5, CHK-6 | #1632, #1638, #1657 |
| 30.2 | Lesson sheet | `(dialog)` | P2 | LS-1, LS-2, LS-3 | #1637 |
| 30.3 | Month summary | `/dashboard/attendance/summary` | P2 | SUM-1, SUM-2, SUM-3 | #1639 |
| 40.1 | Stats — overview, attendance, payments, athletes | `/dashboard/stats/*` | P3 | STAT-1, STAT-2, STAT-3, STAT-4, STAT-5, STAT-6, STAT-7 | #1646, #1655 |
| 40.2 | Stats — programme coverage | `/dashboard/stats/syllabus` | P3 | STSY-1, STSY-2 | #1656 |
| 50 | Account | `/dashboard/profile` | P1 | PROF-1, PROF-2, PROF-3, PROF-4, PROF-5, PROF-6 | #1619, #1623, #1624, #1642 |
| 51 | Notifications | `/dashboard/notifications` | — | nothing to file | — |
| 52 | What's new | `/dashboard/whats-new` | P3 | WN-1, WN-2 | #1625, #1659 |
| 54 | More | `/dashboard/more` | P2 | MORE-1 | #1640 |
| 53 | Backup | `/dashboard/backup` | P1 | BKP-0, BKP-1, BKP-2 | #1615, #1624, #1640 |
| 55 | Search palette | `(Ctrl+K)` | — | nothing to file | — |
| 56 | Update chrome | `(title bar, banner)` | P2 | UPD-1, UPD-2 | #1641 |

## Issues

47 issues on the epic (#1614): 5 P1, 24 P2, 18 P3. Each carries its grade, its evidence, a proposal and acceptance criteria; the epic's body lists them by area.

| Issue | Grade | Findings |
|---|---|---|
| #1615 | P1 | BKP-0 — fix(backup): restore and stop-copying open no confirm — the page has no popup to show it in |
| #1616 | P1 | HELP-1, HELP-2, HELP-3 — fix(help): the FAQ describes a product that no longer ships |
| #1617 | P1 | ERR-1, X-NETWORK — fix(client): error copy blames the network on a build whose api is a local process |
| #1618 | P1 | ATH-1 — fix(athletes): first-run empty state tells a new owner to remove filters they never set |
| #1619 | P1 | PROF-1 — fix(profile): the notifications tab promises emails the desktop never sends |
| #1620 | P2 | AUTH-8 — fix(auth): forgot/reset password reachable on a build that cannot send mail |
| #1621 | P2 | AUTH-9 — feat(auth): a password recovery path that does not need email |
| #1622 | P2 | AUTH-1, AUTH-2, AUTH-5, AUTH-6, AUTH-7 — fix(auth): auth cards — inputs narrower than password fields, invisible consent checkboxes, no top margin |
| #1623 | P2 | SETUP-1, ACADE-3, ATH-2, DET-4, PROF-5, X-TERM — fix(i18n): 'academy', 'Owner' and '32y' left in English in the Italian ui |
| #1624 | P2 | ACT-2, PROMO-1, PROF-3, BKP-1, X-DATES — fix(i18n): dates rendered in English with seconds on activity, promotions, sessions and backup |
| #1625 | P2 | DOC-1, DOC-2, EXP-1, EXP-2, EXP-3, WN-2, X-ISO — fix(documents): iso dates and english status tags in the document tables |
| #1626 | P2 | SETUP-2, SETUP-3, X-FROZEN — fix(copy): frozen features described as if they existed — setup, profile, athlete form |
| #1627 | P2 | ACAD-1, ACAD-2, ACADE-4 — fix(academy): the home page leads with an empty logo uploader and a permalink the desktop has no use for |
| #1628 | P2 | ACADE-1, ACADE-2, ACADE-5, ACADE-6, ATHF-1 — feat(academy): sectioned edit form with a sticky action bar and deliberate field widths |
| #1629 | P2 | SYL-1 — feat(syllabus): search on the programme page |
| #1630 | P2 | SYL-2, SYL-3, SYL-5 — fix(syllabus): the in-season tick sits 700 px from its name; technique rows hide their edit |
| #1631 | P2 | ACT-1, ACT-3 — fix(activity): actions shown as machine keys, actor repeated on every row |
| #1632 | P2 | ATH-3, CHK-4 — fix(client): at the minimum window the roster search collapses and the check-in header wraps |
| #1633 | P2 | DET-1, DET-2, DET-3 — fix(athletes): 'modifica' is the first tab, and the header has no way to reach the athlete |
| #1634 | P2 | EDIT-1 — fix(athletes): the edit page puts email and photo below the danger zone |
| #1635 | P2 | ATT-1, ATT-2, ATT-3 — feat(athletes): draw the 90-day attendance strip the tab already fetches |
| #1636 | P2 | PAY-1, PAY-4 — feat(payments): a way to another year on the athlete's payments tab |
| #1637 | P2 | LS-1, LS-2, LS-3 — fix(lesson-sheet): 'in programma' and 'il programma' mean two things in one dialog; double clear button; radio glyphs |
| #1638 | P2 | CHK-6 — fix(attendance): clearing the date field throws on every change-detection pass |
| #1639 | P2 | SUM-1, SUM-2, SUM-3 — fix(attendance): '23 giorni di allenamento' on the month summary is the sum of presences |
| #1640 | P2 | MORE-1, BKP-2 — feat(shell): backup on the rail, with the last-backup state visible |
| #1641 | P2 | UPD-1, UPD-2 — fix(desktop): with an update pending the page drops by 44 px under an empty strip |
| #1642 | P2 | PROF-2, PROF-4, PROF-6 — fix(profile): web furniture on the desktop settings — sessions, login history, api tokens, handle, verified tick |
| #1643 | P2 | the product proposal, ACAD-3 — feat(home): a Today screen as the app's first screen |
| #1644 | P3 | X-CONFIRM, TT-5 — fix(client): confirm popups disagree with each other — vocabulary, emphasis, placement |
| #1645 | P3 | X-CLEAR — fix(client): showClear on selects that always need a value |
| #1646 | P3 | X-PLURAL, STAT-3, COV-2 — fix(i18n): plural forms used for one — '1 atleti', '1 dei suoi allenamenti non dicono' |
| #1647 | P3 | COV-1, COV-3, PROMO-3 — fix(copy): gendered and inconsistent wording on the athlete tabs |
| #1648 | P3 | TT-1, TT-2, TT-3, TT-4 — fix(timetable): plan button without a label, duration without a unit, two label styles |
| #1649 | P3 | ATH-4, ATH-5, ATH-6 — fix(athletes): roster polish — attendance header, toggle states, onboarding steps |
| #1650 | P3 | ATHF-2, ATHF-3 — fix(athletes): form polish — prefix default, instagram format, address asterisks |
| #1651 | P3 | ATHF-4 — feat(academy): a 'trains kids' flag that hides the youth belts |
| #1652 | P3 | DOC-3, DOC-4, DOC-5 — fix(documents): 'No file chosen', no expiry prefill, an overlay that flashes over the rows |
| #1653 | P3 | PROMO-2, PROMO-4 — fix(promotions): destructive control before the content; promote from the tab |
| #1654 | P3 | PAY-2, PAY-3, PAY-5, PAY-6, PAY-7 — fix(payments): ledger rows for period payers, carnet card hierarchy, bare ✓ and ✕ controls, overdue months |
| #1655 | P3 | STAT-1, STAT-2, STAT-4, STAT-5, STAT-6, STAT-7 — fix(stats): hover-only counts, a 300 px heatmap, no page title, an invisible white slice |
| #1656 | P3 | STSY-1, STSY-2 — feat(stats): plan a not-yet-taught topic straight from the coverage report |
| #1657 | P3 | CHK-1, CHK-2, CHK-3, CHK-5 — fix(attendance): check-in polish — control placement, sort read as filter, banner tone, empty-roster link |
| #1658 | P3 | IMP-1 — fix(import): rows keep the future tense after the import has run |
| #1659 | P3 | WN-1 — fix(whats-new): section headings lead with an emoji |
| #1660 | P3 | HELP-3, LEGAL-2 — fix(client): a way back at the top of long public pages |
| #1661 | P3 | SYL-4 — feat(syllabus): reorder positions and techniques |

---

## 0. Signed out

### 0.1 Welcome — `/`

**What it is for.** The first screen of a fresh install: say what the app is, get the owner to create an account, and set expectations that nothing leaves the machine.

**What is right.** One primary CTA, one text secondary, a headline that names the competitor (the spreadsheet) instead of the product. The three steps are honest about what happens next and say out loud that there is no service to sign up to. The desktop title bar carries the version, which is the first thing support will ask for. At 960 wide nothing breaks.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| LND-1 | P3 | The 40 px title bar holds only `v2.61.1`, far left, in a strip that spans the whole window. On the dashboard it earns its height (update state, drag region); on a welcome page it reads as an empty header. | MD3 — every region should carry something; Krug — noise |

**Proposals.** None beyond LND-1, and that one is cosmetic: the strip is the window's drag region and cannot go. Leave it.

### 0.2 Sign in — `/auth/login`

**What it is for.** Second launch onwards: password, in.

**What is right.** A single card, one CTA, show-password glyph, the required legal links without a cookie banner (gated off on desktop, #1508). The "forgot password" link is correctly hidden on the desktop profile (`login.component.html:120`).

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| AUTH-1 | P2 | **Plain inputs are 43 px narrower than the password fields** on every auth card (login, register, reset). `_auth-page.scss:73` sets `input.p-inputtext { width: 100% }`, but the input is projected inside `app-budojo-form-field` and the rule does not reach it; `p-password` gets its width through `::ng-deep` and does. The form's right edge zig-zags. | MD3 — alignment; Gestalt — a column of fields is one shape |
| AUTH-2 | P3 | Both fields carry a red `*`. On a two-field form where both are required the marker says nothing. | Krug — remove needless words |
| AUTH-3 | P3 | Footer link `Sub-processors` is English in the Italian UI and names a GDPR concept that has no referent on a build with no processors. Owned by the legal review in #1255; noted here so the copy is not "fixed" in isolation. | Voice — Italian UI |
| AUTH-4 | P3 | "Non hai un account? Creane uno" on every sign-in of a single-owner local app. Harmless, but it is a web-app sentence. | Krug |

### 0.3 Create account — `/auth/register`

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| AUTH-1 | P2 | Same width defect as above, on five fields. | |
| AUTH-5 | P2 | **The two consent checkboxes are nearly invisible unchecked**: a `#f0f0f0` square on a white card, no border a reader can see. The one control the form cannot be submitted without is the one with the weakest affordance. | Norman — signifier; MD3 — 3:1 contrast for UI components |
| AUTH-6 | P3 | The card sits flush against the title bar at 860 tall: the layout centres a card taller than the viewport and the top margin collapses to zero. Login and reset keep their margin because they fit. | MD3 — 8dp rhythm |
| AUTH-7 | P3 | Subtitle "Per gestori e staff di palestra": the desktop build has exactly one account and no staff role. | Voice — say what is true |

### 0.4 Forgot / reset password — `/auth/forgot-password`, `/auth/reset-password`

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| AUTH-8 | P1 | **Both routes are reachable on a build that cannot send mail.** `app.routes.ts:40-53` carries no guard; the login page hides the link, but a bookmark, a typed URL or the browser's back button lands on a form that promises "ti mandiamo un link" and can only fail. Route-guard both behind `capabilityGuard('email')`, like `/dashboard/support`. | Norman — constraints; the pairing rule already written for `support` in `app.routes.ts:498-505` |
| AUTH-9 | P2 | **There is no password recovery at all on the desktop.** The data is on the owner's disk; forgetting the password means losing the app, not just the session. Being at the machine is the credential the web build never had — a "reset from this computer" path (confirm with the recovery code from the backup page, or with OS-level access to the data folder) is the honest replacement for the email link. Feature, not fix. | Norman — feedback and recovery |

### 0.5 Set up the academy — `/setup`

**What it is for.** First run after the account: name, training days, "do you train here too", create.

**What is right.** Short, one screen, sensible defaults, and the "train here" question is asked at the one moment it matters.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| SETUP-1 | P2 | **"academy" is left in English** in the Italian UI on this one screen — heading "Configura la tua academy", CTA "Crea academy", label "Nome academy" — while every other screen says *accademia* (rail, home, edit page "Modifica academy" — see ACADE-1). Two words for the same thing on the two screens a new owner sees first. | Krug — consistency; voice |
| SETUP-2 | P2 | The "train here" explainer promises things the desktop build does not have: "i tuoi post nella community mostreranno la cintura" (`it.json:479`). Community is frozen on this profile. | Voice — say what is true |
| SETUP-3 | P3 | Placeholder "Gracie Barra Lisboa" is a real franchise's trademark. "La tua palestra" or a fictional name does the same job. | |

---

## 1. Public help, legal, errors

### 1.1 Help — `/help`

**What it is for.** The FAQ, reachable signed out from the welcome footer.

**What is right.** Search-as-you-type over the questions, prose width, sections in the order a new owner meets them.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| HELP-1 | P1 | **The FAQ answers describe a product that no longer ships.** "L'importazione massiva da CSV non è ancora rilasciata" — it shipped in #1346 and has its own page. "Dopo aver creato l'account e confermato l'email" — no email on desktop. "Riceverai un'email di conferma" for account deletion, "il digest email quotidiano delle 9:00", "chiudendo il browser", "la sidebar della dashboard ha un piccolo toggle EN ⇄ IT sopra il footer" — none of it is true of the desktop build. "La home della dashboard ha un riquadro Documenti in scadenza" — it became a button in #1456. A help page that is wrong is worse than none: the reader stops trusting the true answers. | Voice — say what is true |
| HELP-2 | P2 | **Nothing about the last year of product**: no timetable, programme, lesson topics, coverage, carnets, fee tiers, backup, updates, recovery code, or where the data lives. The questions an owner actually has today have no entry. | |
| HELP-3 | P3 | "Torna alla home" at the foot of a 3500 px page, nothing at the top. A long page needs its exit where the reader starts. | Fitts |

**Proposal.** Rewrite `help` as the desktop product's FAQ in both languages, section by section, and add one entry per feature listed in HELP-2. This is content work, not layout; the page itself is fine.

### 1.2 Legal — `/privacy/it`, `/terms/it`, `/cookie-policy/it`, `/sub-processors/it`, `/account-deletion/it`

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| LEGAL-1 | — | The texts still describe the hosted stack — DigitalOcean Frankfurt, Cloudflare, TLS, SSH, sub-processors — and carry "Bozza tecnica, in revisione legale · Versione 0.1". On a build where nothing leaves the machine these are not merely stale; they assert transfers that do not happen. **Already owned by #1255**; recorded here so the audit is complete, not filed again. | |
| LEGAL-2 | P3 | Same as HELP-3: the only way back is at the bottom of 2–4 thousand pixels. | Fitts |

No layout findings: the prose container, the IT/EN toggle and the type scale are right.

### 1.3 Error pages — `/offline`, `/error`, `/no-such-page`

**What is right.** Calm, one line, one button, the glyph in grey. The 404 copy is good.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ERR-1 | P1 | **"Sei offline — controlla la connessione" is the wrong diagnosis on the desktop.** The page is reached on any request with `status === 0` (`errorInterceptor`). On the web that means no network; on the desktop the API is a local `php.exe` on `127.0.0.1`, and status 0 means *it stopped answering*. The owner is told to check the Wi-Fi while the actual fix is to restart the app — and the page cannot get them there. On the desktop profile this page should say that Budojo's own service is not responding, offer "Riprova" and "Riavvia Budojo", and point at the log folder (#1316 is putting that folder one click away). | Norman — feedback must name the real state; Krug |

---

## 10. Academy

### 10.1 Academy home — `/dashboard/academy`

**What it is for.** The rail calls it *Accademia* and the brand link lands here; it is the summary of the academy's settings — name, permalink, phone, links, training days, season, timetable, programme — with one "Modifica" CTA.

**What is right.** The label/value rows are clean and consistent (the pattern the v2.1.0 audit asked for); the timetable and programme rows link to their pages; season shows both the label and the start date.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ACAD-1 | P2 | **The first thing on the page is an empty logo-upload card** (`academy-detail.component.html:25-43`): a dashed placeholder, "PNG, JPG, SVG o WebP, massimo 2 MB", and a "Carica" button that competes with "Modifica" for the eye. Every visit, for an academy that never uploaded one. It is a setting, not the summary's headline. Collapse it to a row (`Logo — nessuno · Carica`) or move it to the edit page. | Krug — hierarchy; one primary action per view |
| ACAD-2 | P2 | **"Permalink" is meaningless on the desktop.** `budojo-bjj-torino-1a2b3c4d` in monospace is a public-URL slug for a web app that has no public URL here. Hide the row on the desktop profile (the value can stay in the data). | Voice — say what is true; Krug |
| ACAD-3 | P3 | The page is a settings summary wearing the name "home": the brand link goes here, but `/dashboard` redirects to the roster (`app.routes.ts:235`). Two homes, neither of which is *today*. See the product proposal in § Cross-cutting. | Jakob — a home is expected to be a home |

### 10.2 Timetable — `/dashboard/academy/timetable`

**What it is for.** Named classes with a weekday, time and kind; the check-in reads it.

**What is right.** Seven rows, "OGGI" on today's, the kind as a monochrome eyebrow chip, an empty day that says "Nessuna lezione" instead of vanishing, a `+` per day, and the count in the header. This is a good page.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| TT-1 | P3 | **The per-class "plan" control is an unlabelled grey square** with a `pi-book` glyph (`timetable.component.html:101-107`). It opens the lesson sheet for the next occurrence — the feature the programme epic was built for — and nothing on the surface says so; the affordance lives in an `aria-label`. On the desktop there is room for a word. | Norman — signifier; Krug — self-evident |
| TT-2 | P3 | Clicking a class card edits it; clicking the day name does nothing. Fine, but the card gives no hover or cursor cue that it is a button. | Norman — affordance |

**Proposal.** A text-and-icon "Pianifica" button in place of TT-1's square, and a tooltip on the class card.

### 10.3 Programme — `/dashboard/academy/syllabus`

**What it is for.** The positions and techniques the academy means to cover; the "in season" tick is the coverage denominator.

**What is right.** Collapsed by default with a count per position, the kind chip only when it narrows, the tick, `+` and pencil grouped on the position row. Reads as a checklist.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| SYL-1 | P2 | **No search or filter on a list that ships with 278 techniques.** The lesson sheet searches the same tree; the page that *maintains* it cannot. Finding "kimura" means opening seven positions. | Hick; Fitts |
| SYL-2 | P2 | **A technique's "in season" tick sits at the far right of a 960 px row, 700 px from its name**, with nothing between them. The eye has to travel the row to know which tick belongs to which name, and at 1280 the gap grows. The whole row should be the toggle target, or the tick should sit beside the name. | Fitts; Gestalt — proximity |
| SYL-3 | P3 | Renaming a technique is done by clicking its name (`syllabus.component.html:137-147`) — nothing on the row says so; the position row shows a pencil, the technique row shows none. Inconsistent within one screen. | Krug — consistency |
| SYL-4 | P3 | No way to reorder positions or techniques; `sort_order` exists in the data. A programme is taught in an order. | |

**Proposal.** A search field under the header (SYL-1), row-as-toggle with the tick moved to the left (SYL-2), a pencil on technique rows (SYL-3), drag-to-reorder or up/down on the edit dialog (SYL-4).

**Inside.** The empty state offers "Parti dal programma BJJ" as the primary and "Scrivo il mio" as a text button — but 80 px below it, orphaned from the choice it belongs to (SYL-5, P3, Gestalt — proximity). The add/edit dialog is right: name, "Si allena" as a three-way segment, a one-line hint that names a concrete example.

### 10.4 Edit academy — `/dashboard/academy/edit`

**What it is for.** Every academy setting: name, contacts, address, fee, price list, carnet, season, training days.

**What is right.** Each field carries its own one-line hint that says what the value *does* ("Conta quando un atleta si allena due volte nello stesso giorno"), which is better documentation than the help page. Training days are derived from the timetable and say so, with a link.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ACADE-1 | P2 | **2,100 px of form with the only Save at the very bottom.** Changing the phone number at the top means scrolling past the address, the price list, the carnet and the season to reach "Salva", and nothing tells the reader there is more below. No sections, no anchors, no sticky action bar. | Fitts; Miller — chunk it; MD3 — forms of this length are sectioned |
| ACADE-2 | P2 | **Field widths zig-zag with no rule behind them.** Name, website, Facebook, Instagram, fee and carnet price are 255 px; the phone number, street and city stretch to 900 px. A URL field at 255 px truncates its own placeholder (`https://facebook.com/yourpag`). Short fields for short values is a fine rule; it is not the rule being applied. | MD3 — text field width matches expected content; alignment |
| ACADE-3 | P2 | "Modifica **academy**", "Se l'**academy** ha più di una quota…" — the same term left in English as on `/setup` (SETUP-1). One issue for both. | Voice |
| ACADE-4 | P3 | The Permalink box ("segnalibri e link condivisi continuano a funzionare") is the edit-page half of ACAD-2: hide on the desktop profile. | |
| ACADE-5 | P3 | `showClear` (✕) on the phone-prefix, province and season selects. A prefix and a province are never "cleared"; the ✕ beside the chevron is noise, and on the season it silently means "settembre". | Krug — needless controls |
| ACADE-6 | P3 | "Lascia tutti i campi vuoti per rimuovere l'indirizzo salvato" — deleting an address by blanking five fields is a hidden gesture. A "Rimuovi indirizzo" text button says the same thing in two words. | Norman — signifier |

**Proposal.** Group the form into cards — *Identità*, *Contatti*, *Indirizzo*, *Quote e carnet*, *Stagione* — with a sticky "Annulla / Salva" bar at the foot of the scroll area; make short fields short on purpose (fee, price, entries, CAP, province) and everything else full width. Mockup in `preview/audit-v2.61/academy-edit.html`.

### 10.5 Timetable and programme dialogs

| ID | Grade | Finding | Rule |
|---|---|---|---|
| TT-3 | P3 | "Durata" shows its unit only once a value is in it ("60 min"); the empty field on a new class is a bare spinner with no hint that it wants minutes. A placeholder does it. | Krug — self-evident |
| TT-5 | P3 | The remove confirm opened from inside the dialog pokes out below the dialog's edge (the popup anchors to the button and ignores the dialog's bounds). | Polish; see X-CONFIRM |
| TT-4 | P3 | Field labels are dark and medium-weight in the timetable dialog, small and muted in the programme dialog — two dialogs from the same epic with two label styles. | Consistency |

### 10.6 Activity — `/dashboard/academy/activity`

**What it is for.** The audit log: who did what, when.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ACT-1 | P2 | **Actions are shown as their machine keys** — `attendance.marked`, `lesson.topics_updated`, `academy_class.created` — in monospace, and the filter's placeholder is "es. athlete.deleted": the owner has to know the code's vocabulary to read or filter their own log. Each action has a sentence in it ("Presenza registrata", "Argomenti della lezione aggiornati"); the filter should be a select of those. | Voice — the product speaks to a coach; Krug |
| ACT-2 | P2 | **Timestamps render in English** — "Sep 14, 2026, 6:12:00 PM" — in the Italian UI, with seconds nobody needs. The rest of the app formats dates through the active locale. | i18n; consistency |
| ACT-3 | P3 | "Matteo Bonanno → Sara Colombo" on every row: on a single-owner build the actor is always the same person, and the arrow reads as a transfer. Lead with the subject; keep the actor for the day there are two. | Krug — needless words |

---

## 20. Athletes

### 20.1 Roster — `/dashboard/athletes`

**What it is for.** The screen the app is really about: everyone, their belt, how often they come, whether they have paid, and the way into each of them.

**What is right.** The belt spine with stripes reads at a glance; the payment chip carries a glyph so paid and unpaid survive colour-blindness (#1444); the alerts control stays put and goes grey when there is nothing to say (#1482); one primary CTA, import as a secondary; the row's whole name is the link and the pencil is the shortcut to edit.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ATH-1 | P1 | **The first-run empty state tells a new owner to remove filters they never set.** With zero athletes the table says "Nessun atleta trovato. Prova a rimuovere i filtri o la ricerca" and offers a primary "Rimuovi filtri" — directly under the onboarding card that says "Aggiungi il primo atleta". The no-results state and the no-athletes state are one template; they are two situations with two answers. | Krug; Norman — feedback names the real state |
| ATH-2 | P2 | **Untranslated words on every row**: the age chip is `32y` (`age-badge.component.ts:28` builds the string as `years + 'y'`), the owner's row says `Owner` (`it.json:1825`). The same badge appears on the check-in and on the athlete header. | i18n — every visible string in the JSON |
| ATH-3 | P2 | **At the minimum window the search field collapses to ~85 px** — the placeholder reads "Cer". The filter row does not wrap, so the one control people type into is the one that gives way. | Responsive — the page must work at 960 |
| ATH-4 | P3 | The attendance column stacks two fractions ("5/8" over "143/8") under one header, "Presenze". Which is the month and which the season is in a tooltip. A reader should not need a hover to read a number. | Krug — self-evident |
| ATH-5 | P3 | Inactive toggles (Pagamento sort, reveal-inactive, reveal-deleted) render in the same grey as a disabled control. The active one (Cintura) is tinted, so the pair reads as "enabled / disabled" rather than "on / off". The payment sort also renames itself when pressed — "Pagamento" off, "Pagato" on — and "Pagato" reads as a filter for paid athletes. | Norman — state must be visible; MD3 — disabled ≠ unselected |
| ATH-6 | P3 | The onboarding checklist has no step for the timetable or the programme — the two things the last epic added and the check-in now depends on. | |

**Proposal.** Two empty states (ATH-1): "Nessun atleta ancora" with *Aggiungi* + *Importa* when the roster is empty, the current one only when a filter or search is active. Translate the badge and chip (ATH-2). Let the filter row wrap below 1100 px with the search first and full-width (ATH-3). Add "mese" / "stagione" as a two-line header (ATH-4).

**Error state.** "Impossibile caricare gli atleti — controlla la connessione e riprova": the network-blaming copy again; see ERR-1, which covers every place that says it.

### 20.2 Add athlete — `/dashboard/athletes/new`

**What is right.** This is the form the academy edit page should look like: four eyebrow-labelled sections (*Anagrafica*, *In palestra*, *Contatti*, *Indirizzo*), hints that say what a field does, "Iscritto" defaulting to today, one primary CTA at the foot of a card that fits in two screens.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ATHF-1 | P3 | The address section is headed "(opzionale — compila tutti i campi o lasciali tutti vuoti)" and then marks four of its fields with the red `*` that everywhere else means "required". Two signals, opposite meanings. The academy form has the same pair. | Krug — consistency of signifiers |
| ATHF-2 | P3 | The phone prefix opens empty ("Prefis…✕⌄", truncated) on an academy whose own number is +39. Default it to the academy's prefix. | Norman — defaults |
| ATHF-3 | P3 | Instagram takes a URL here (`https://instagram.com/iltuoprof…`, truncated at 275 px) and a handle on the academy form (`budojo_torino`). One product, two formats for the same field. | Consistency |
| ATHF-4 | P3 | The belt select lists the IBJJF youth belts for an academy with no kids programme. A per-academy "trains kids" flag would halve the list where it is not needed. | Hick |

### 20.3 Import — `/dashboard/athletes/import`

Clean and honest: one card, one CTA, a hint that names the Excel menu path and says accents and Italian dates are handled. The preview is the best table in the app — column mapping above, one row per line with a verdict chip and the reason under it ("Già in lista · C'è già qualcuno con questo nome"), a CTA that counts what it will do ("Importa 2 atleti").

| ID | Grade | Finding | Rule |
|---|---|---|---|
| IMP-1 | P3 | After the import runs, the summary says "2 atleti importati" and a toast confirms it — but every row still reads "Verrà importato", future tense, under a heading in the past. The rows should flip to "Importato". | Voice — tense follows the state |

### 20.4 Athlete header and tabs — `/dashboard/athletes/:id`

**What it is for.** Who this is, and the way into everything about them.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| DET-1 | P2 | **"Modifica" is the first tab.** An action sits in a strip of content sections, ahead of Documenti, and the page lands on the second tab. Tabs answer "what do I want to see"; editing answers "what do I want to do". Put a *Modifica* button in the header (pencil, top right) and let Documenti lead the strip. | Krug — self-evident; Jakob — tabs are sections |
| DET-2 | P2 | **The header has no contact affordance.** Name, age, belt, status, joined date, and an Instagram icon — no phone, no email, on the one screen a coach opens to reach someone. Both are in the data. | Norman — the affordance is missing where the need is |
| DET-3 | P3 | "Iscritto il 2 settembre 2024" under a woman's name. "Iscrizione: 2 settembre 2024" (or "Dal 2 settembre 2024") does not gender the reader. | Voice |
| DET-4 | P3 | The `32y` chip, as ATH-2. | |

### 20.5 Documents tab

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| DOC-1 | P2 | **Status tags are English** — `Expiring`, `Valid`, `Expired` — hard-coded in `expiry-status-badge.component.ts:13-14`, in the Italian UI. Also on the expiring-documents page. | i18n |
| DOC-2 | P2 | **Dates are raw ISO** — `2025-09-20`, `2026-09-30` — straight from the payload (`documents-list.component.html:168-169`), while every other screen writes "2 settembre 2024". The design README fixes the rule: ISO in inputs, human in display. Same on the expiring-documents page. | Voice — dates |
| DOC-3 | P3 | The upload dialog's file control says "No file chosen": the browser's native English, not a string of ours. | i18n |
| DOC-4 | P3 | "Scade il" is typed by hand every time. A medical certificate is valid a year; when the type is *Certificato medico* and "Emesso il" is set, prefill expiry at +12 months (editable). | Norman — good defaults |
| DOC-5 | P3 | The table's loading overlay flashes over rows that are already on screen: the tab fetches once on init and again when the persisted "show cancelled" toggle settles (`documents-list.component.ts:95-116`). The harness caught the overlay in three of four first frames. One fetch, or no overlay for a refetch that has rows to show. | Feedback — no phantom loading |

### 20.6 Attendance tab

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| ATT-1 | P2 | **The "Percentuale di presenze" card is 380 px of white with a number in the middle.** The endpoint returns a 90-point `series` (one flag per training day); the template draws only the rate and one line of text (`attendance-summary-chart.component.html`). The data for a strip — attended / missed per day — is fetched and thrown away, and the card's height is what a chart would need. | MD3 — every region earns its space; Tufte — data-ink |
| ATT-2 | P3 | Two rate visuals for one athlete: the big 57% (90 days) in the card and a knob ring (this month) above the calendar. Different windows, no label saying so. | Krug |
| ATT-3 | P3 | The calendar uses white, tinted and grey cells with no legend: attended, not attended, not a training day, and future all have to be inferred. | Norman — signifiers |

### 20.7 Payments tab

**What is right.** The carnet panel and the ledger on one tab ("this athlete's money", #1364); paid/unpaid tags read the same as the roster chips; the period sub-label ("Da gennaio a marzo 2026") makes a quarterly payment legible.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| PAY-1 | P2 | **There is no way to another year.** The heading says "Pagamenti — 2026" and nothing on the page moves it; an athlete who joined in 2024 has two years of history that cannot be opened (`payments-list.component.html:4` is the only place `year` appears). | Norman — constraints without an escape |
| PAY-2 | P3 | A quarterly payer gets twelve rows for four payments: three identical "Pagato · — · 2 gennaio 2026" lines per quarter, the amount on the first and "—" on the other two, which reads as missing data. Group a period into one row, or grey the continuation rows. | Krug — reduce noise |
| PAY-3 | P3 | The carnet card leads with the code `A7K2` at 28 px monospace; the number that matters — 3 of 10 left — is second. Swap the hierarchy. | Krug — hierarchy |
| PAY-4 | P3 | Subtitle "70,00 € al mese per 7 lezioni a settimana" on an athlete who pays quarterly: the period is only discoverable from the rows. "Trimestrale · 210,00 €" belongs in the subtitle. | |
| PAY-5 | P3 | The unmark control on every paid row is a bare ✕ at the row's end, the glyph the rest of the app uses for "close" and "clear"; the mark control on an unpaid row is a bare ✓. Neither has a visible label. | Norman — mapping; consistency |
| PAY-6 | P3 | July, August and September all read "Non pagato" in the same amber when July is two months overdue and September is the current month. "In ritardo" for a past unpaid month is the one word an owner chasing money needs. | Norman — feedback; hierarchy |
| PAY-7 | P3 | "Registrare il pagamento di Giulia Ferraro per **Da** settembre a novembre 2026?" and "…che copre **Da** luglio…" — a capitalised period label glued into a sentence. | Voice |

### 20.8 Coverage and promotions tabs

**Coverage** is the best-reasoned screen in the app (four states, a denominator that is what the academy taught, the caveat said out loud). Copy only:

| ID | Grade | Finding | Rule |
|---|---|---|---|
| COV-1 | P3 | "3 su 6 **cose** che la palestra ha fatto" — they are techniques; say so. | Voice |
| COV-2 | P3 | "1 dei suoi allenamenti non **dicono**" — the plural form is used for one; the `…One` / `…Other` pair exists for exactly this. | i18n — plural rule |
| COV-3 | P3 | "COSA SI È PERSO" genders the athlete; "COSA HA PERSO" does not. | Voice |

**Promotions.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| PROMO-1 | P2 | **Dates in English** — "Jun 15, 2026", "Dec 20, 2025" — in the Italian UI. Same defect as the activity log (ACT-2): one issue. | i18n |
| PROMO-2 | P3 | Each row opens with the date and, immediately after it, the pencil and the red bin — the destructive control before the content it destroys. Every other list puts actions at the row's end. | Consistency; Norman — reading order |
| PROMO-3 | P3 | "strisciette" here, "Gradi" on the form: two words for stripes. | Voice |
| PROMO-4 | P3 | The tab's only action is "Aggiungi una promozione passata". Promoting somebody *today* — the common case — is done by editing the belt on the form, where nothing says a promotion will be recorded. A "Promuovi" action here would make the tab the place promotions happen. | Feature |

### 20.9 Edit tab

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| EDIT-1 | P2 | **Email and photo are below the danger zone.** The form card ends with "Salva modifiche", then the red "Elimina atleta" section, and *then* an Email card and a Foto card. Anything after "delete this athlete" reads as an afterthought; the email is a contact and belongs in *Contatti* (where it is absent), the photo belongs with the identity at the top. | Gestalt — grouping; Krug — reading order |

### 23. Expiring documents — `/dashboard/documents/expiring`

**What it is for.** The list the roster's ⚠ button leads to: who has no medical certificate, and which documents run out soon.

**What is right.** Two sections in the order they matter — the missing certificates first, each with a "Carica →" that lands on the athlete's documents tab; then the expiring table with the athlete as a link. The subtitle counts both.

| ID | Grade | Finding | Rule |
|---|---|---|---|
| EXP-1 | P2 | `Expiring` / `Expired` tags in English — the same badge as the documents tab (DOC-1). | i18n |
| EXP-2 | P2 | `2026-09-30` as the expiry — raw ISO, as on the documents tab (DOC-2). | Voice — dates |
| EXP-3 | P3 | The column shows the date and leaves the arithmetic to the reader; "tra 16 giorni" / "scaduto da 4 giorni" is what the notification already says and what the list is for. And "Sara Colombo — Expired" sits under a heading that says "in scadenza": "Da rinnovare" covers both. | Krug |

---

## 30. Check-in

### 30.1 Tonight — `/dashboard/attendance`

**What is right.** The two class chips with their times, the one the clock points at already on; the topic row under them; the count in the title; a date that jumps to the last training day with a banner when today is not one; a good empty state for the roster. The row tint for "present" reads at a glance.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| CHK-1 | P3 | The present/absent circle sits at the far right of a 960 px row, 850 px from the name, exactly as the programme's tick (SYL-2). The row tint carries most of the meaning; the control that changes it is where the eye is not. | Fitts; Gestalt — proximity |
| CHK-2 | P3 | "Cintura" (the sort) renders tinted-active next to "Tutte le cinture" (the filter); at a glance it reads as a second belt filter that is on. | Krug |
| CHK-3 | P3 | The not-a-training-day banner is amber, the warning colour, for a message that is information ("stai vedendo la sessione di sabato"). | MD3 — tone matches meaning |
| CHK-4 | P3 | At 960 wide the title wraps to two lines and "3 presenti" to a third column: the header has four things in a row and no wrap rule. | Responsive |
| CHK-5 | P3 | The empty-roster state says "aggiungine uno dalla pagina Atleti" as plain text, with no link and no button. | Norman — affordance |

### 30.2 Lesson sheet

**What is right.** Search first, what was done as chips, suggestions with their reason and a dismiss, what was done lately, then the tree — Hick's law applied in the order the questions are asked. Save stays pinned.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| LS-1 | P2 | **"IN PROGRAMMA" and "IL PROGRAMMA" in the same dialog mean two different things** — the lesson's state (planned, not yet held) and the syllabus. The eyebrow chip should say the state in a word the syllabus does not use: "PIANIFICATA" / "SVOLTA". | Voice — one word, one meaning |
| LS-2 | P3 | Typing in the search shows **two clear buttons** side by side: the browser's native `type="search"` ✕ and ours. | Polish |
| LS-3 | P3 | Suggestion and topic rows use a radio circle (○) for a multi-select; the visual says "pick one". A checkbox square or a `+` says what it does. | Norman — mapping |

**Inside.** Marking somebody flips the row and raises an undo toast ("Matteo Bonanno segnato presente · Annulla") — the right pattern for a cheap, reversible action. Switching to the second class re-reads the room and shows its own (empty) topic row. The belt filter lists the four youth belts first (see ATHF-4).

| ID | Grade | Finding | Rule |
|---|---|---|---|
| CHK-6 | P2 | **Clearing the date field throws.** With the input emptied, `dayClasses` reads `selectedDate().getDay()` on `null` (`daily-attendance.component.ts:319-322`) and the console fills with `TypeError` on every change-detection pass until a valid date is typed. Reproduced by the harness (`_console/30-attendance-date-cleared__*.json`). Guard the computed, or refuse an empty date in the picker. | Robustness — a form field must not be able to break the page |

### 30.3 Month summary — `/dashboard/attendance/summary`

**What is right.** One table, sorted by days, with the rate beside the fraction; the month stepper; a name filter.

| ID | Grade | Finding | Rule |
|---|---|---|---|
| SUM-1 | P2 | **"23 giorni di allenamento" is not what the number is.** `totalDays` is the sum of every athlete's count (`monthly-summary.component.ts` — `rows().reduce((acc, r) => acc + r.count, 0)`), i.e. 23 *presences*, and the header calls them training days. An owner reads it as "we trained 23 days this month" — for a September with 8 so far. | Voice — a label must name the quantity |
| SUM-2 | P3 | Months before the first timetable schedule show bare counts with no fraction or rate (the denominator is null), while the current month shows "6 / 8 · 75%". Nothing says why the columns differ. | Krug |
| SUM-3 | P3 | Names are plain text; the athlete's attendance tab is one link away and there is none. | Norman — affordance |

---

## 40. Stats

### 40.1 Overview, attendance, payments, athletes

**What is right.** The heatmap (attendance) is honest about its scale and says so in words under the legend; the leaderboard shows sessions *and* hours.

| ID | Grade | Finding | Rule |
|---|---|---|---|
| STAT-1 | P3 | The belt pie hides its counts behind hover ("Passa sopra a una fetta per il conteggio"). The legend has room for "Bianca · 3". | Krug — don't hide what the reader came for |
| STAT-2 | P3 | The heatmap is 300 × 150 px in a 960 px column: 12 px cells for a reader standing at a desk. Scale the cells to the width, or add the week totals beside the grid. | MD3 — use the space; legibility |
| STAT-3 | P3 | "1 **atleti** senza data di nascita" — the plural for one, again (COV-2). | i18n |
| STAT-4 | P3 | The overview's subtitle — "calcolata in tempo reale dai tuoi atleti" — is a note to the developer, not the reader. | Voice |
| STAT-5 | P3 | The stats page has no title: the tab strip is the first thing under the title bar, and "Statistiche" is only on the rail. Every other page names itself. | Consistency |
| STAT-6 | P3 | The white-belt slice of the belt doughnut is near-white on a white card: the largest group at most academies is the one the eye cannot find. A hairline between slices, or a slightly darker fill for white, fixes it. | MD3 — contrast |

### 40.2 Programme coverage — `/dashboard/stats/syllabus`

**What is right.** The report the epic was built for, and it reads as one: a headline that says what it divides, three states with a legend, per-position bars, the season line, the not-yet list with the parent beside each name, the last-time list with "UNA VOLTA" chips. The empty state points at the programme.

| ID | Grade | Finding | Rule |
|---|---|---|---|
| STSY-1 | P3 | The "NON ANCORA FATTO (20)" list is where the next lesson gets decided, and nothing on it acts: a "Pianifica" on a row — add to the next occurrence's sheet — closes the loop the suggestions opened. | Feature — from report to action |
| STSY-2 | P3 | The empty state's action is an underlined text link ("Apri il programma") where every other empty state uses a filled button. | Consistency |

---

## 50. Account — `/dashboard/profile`

**What it is for.** The owner's own account: name, photo, password, notifications.

**Findings.**

| ID | Grade | Finding | Rule |
|---|---|---|---|
| PROF-1 | P1 | **The Notifiche tab promises emails the desktop never sends.** "Sempre inviate — Email transazionali: benvenuto, link di reset password, verifica email, conferma cancellazione, invito atleta" and three accordions of email/digest preferences, on a build with no mail transport (#1229: `email` is not a desktop capability). An owner who turns "digest non pagati" on and waits for it has been lied to by a settings screen. Gate the tab's email sections on the capability, as the login page already gates its link. | Voice — say what is true; Norman — feedback |
| PROF-2 | P2 | **Sicurezza and Account carry the web product's furniture**: "Sessioni attive — dispositivi e browser collegati", a login history of `127.0.0.1`, API tokens "per script e integrazioni" (whose list fails to load on this profile), a social handle, an email "verified" tick for a verification that never ran. None of it is wrong in the data; all of it is a hosted SaaS talking to a single owner at a single PC. Keep password and 2FA; hide the rest on the desktop profile, or say what each is for here. | Krug — needless words; Voice |
| PROF-3 | P2 | Dates in English with seconds ("Sep 14, 2026, 6:20:00 PM") on sessions and login history — the same defect as ACT-2. | i18n |
| PROF-4 | P3 | "Aggiorna password", "Conferma e attiva", "Salva" (name edit) are all secondary grey buttons: the forms have no primary action, and the name editor puts "Salva" *before* "Annulla", the reverse of every other form. | One primary per view; consistency |
| PROF-5 | P3 | "Mi alleno in questa palestra" explains itself with "i tuoi post community" and "un'etichetta Owner" — frozen feature, English word. | Voice |
| PROF-6 | P3 | The API-token dialog lays labels to the *left* of inputs; every other form in the app puts them above. Its "Abilità" section renders no choices. | Consistency |

---

## 51–56. Notifications, what's new, more, backup, palette, update

**Notifications** — right: Tutte / Non lette with the count, "Segna tutte come lette", Nuove / Prima groups, relative times, a calm empty state ("Sei in pari"). Nothing to file.

**What's new** — the cards read well. Two small things:

| ID | Grade | Finding | Rule |
|---|---|---|---|
| WN-1 | P3 | Section headings lead with an emoji ("□ Correzioni", "□ Tre proposte per stasera" — tofu where no emoji font is installed). The content voice rules say no emoji in product UI; the release notes are product UI. | `docs/design/README.md` — Emoji: none |
| WN-2 | P3 | Release dates as ISO in monospace (`2026-09-12`), the DOC-2 rule again. | Voice — dates |

**More — `/dashboard/more`** — a mobile hub still reachable on the desktop, and on the desktop it is the *only* way to Backup and Attività:

| ID | Grade | Finding | Rule |
|---|---|---|---|
| MORE-1 | P2 | **Backup has no place on the rail.** The one feature that stands between an owner and losing a season of data is two clicks deep under "Altro", with no indication anywhere on the shell of when the last backup ran. Give it a rail item (or a rail footer line: "Ultimo backup: 2 ore fa") and keep "Altro" for the rest. | Information architecture; Norman — visibility of system state |

**Backup — `/dashboard/backup`** — the copy is the best on the desktop ("I tuoi dati sono su questo computer. Fai il backup, così un guasto al disco non significa ricominciare da capo"). Two findings:

| ID | Grade | Finding | Rule |
|---|---|---|---|
| BKP-0 | P1 | **"Ripristina" and "Smetti di copiare" open nothing.** Both are `app-confirm-destructive-button`s, which asks `ConfirmationService` to show a popup — and the backup page renders no `<p-confirmpopup />` for it to show in (`backup.component.html` has the folder button at line 79 and Restore at line 200, and no popup anywhere; the documents tab and the timetable each carry one). The harness clicked Restore and waited 1.5 s for any confirm surface; none came. #1324 fixed the provider so the buttons *render*; nothing yet makes them *work*. Verify on the packaged app before fixing — if it reproduces, restore has been unreachable since the button appeared. | Correctness — the most important button on the desktop |
| BKP-1 | P2 | "Sep 14, 2026, 1:00:00 AM" — English dates with seconds, four times on the page (ACT-2). | i18n |
| BKP-2 | P3 | The archives are automatic and nothing says so: the page shows a schedule's output without naming the schedule. One line — "Budojo fa un backup ogni sei ore mentre è aperto" — turns three timestamps into a promise. (Corrected while fixing #1616: the audit first read "ogni notte all'1:00" from the seeded timestamps; the real cadence is `intervalMs: 6 * 60 * 60_000` in `desktop/src/main.ts:524`, which is the point — a laptop closed at night gets no backup, and the page must not imply one.) | Norman — visibility of system state |

**Search palette (Ctrl+K)** — right: one field, results as you type, a calm no-results line. Nothing to file.

**Update chrome** — the title bar carries the update state (a dot, the version, "Installa"; a spinner and "Scaricamento…"):

| ID | Grade | Finding | Rule |
|---|---|---|---|
| UPD-1 | P2 | **With an update pending, the page content drops by ~44 px under an empty strip.** In both the downloading and the ready state the `app-update-banner` takes its height and paints nothing visible in it (a hairline at most). Either the banner should say something — "v2.62.0 pronta · si installa alla chiusura" — or it should not take the room. Verify on Windows; the harness fakes the bridge. | Feedback; MD3 — every region earns its space |
| UPD-2 | P3 | "● v2.62.0 Installa" reads as "you are on 2.62.0". The running version disappears the moment a newer one exists. "v2.61.1 → 2.62.0 · Installa" keeps both. | Krug |

---

## Cross-cutting findings

These recur across screens and are filed once each.

| ID | Grade | Finding | Where it shows |
|---|---|---|---|
| X-DATES | P2 | Dates rendered through an English formatter with seconds — `Sep 14, 2026, 6:12:00 PM` — while the rest of the app writes "14 settembre 2026". | Activity (ACT-2), promotions (PROMO-1), sessions and login history (PROF-3), backup (BKP-1) |
| X-ISO | P2 | Dates rendered as raw ISO strings. | Documents tab and expiring list (DOC-2), what's new (WN-2) |
| X-TERM | P2 | "academy" left in English in the Italian UI, on three screens, against "accademia" everywhere else; "Owner" and `32y` untranslated. | Setup (SETUP-1), academy edit (ACADE-3), athlete form hints, roster (ATH-2), profile (PROF-5) |
| X-NETWORK | P1 | Error copy that blames the network on a build whose API is a local process. | Offline page (ERR-1), roster error (20.1), and every "controlla la connessione" toast |
| X-CONFIRM | P3 | Confirm popups disagree with each other: "Tieni / Rimuovi", "Annulla / Elimina", "No / Sì"; the safe action is a filled button in some and text in others; the athlete-delete popup overflows into the rail; a popup opened from inside a dialog pokes out of the dialog's bottom edge. One vocabulary (Annulla / verb), the safe action as text, the destructive one filled. | Timetable, documents, payments, athlete edit, backup |
| X-CLEAR | P3 | `showClear` ✕ on selects that always need a value (phone prefix, province, season, fee tier). | Academy edit (ACADE-5), athlete form (ATHF-2) |
| X-PLURAL | P3 | The plural form used for one: "1 atleti", "1 dei suoi allenamenti non dicono". | Stats (STAT-3), coverage (COV-2) |
| X-FROZEN | P2 | Copy that describes frozen features as if they existed: community posts, chip Owner, email digests, invites. | Setup (SETUP-2), profile (PROF-1, PROF-5), help (HELP-1) |

## The product proposal that is not a fix

**Budojo has no home.** The app opens on the roster (`/dashboard` → `athletes`); the rail's first item, "Accademia", is a settings summary with a logo uploader on top. Nothing anywhere answers the questions an owner has when they open the laptop at 18:30: *what is on tonight, who has not paid, whose certificate runs out this month, what should I teach, when was the last backup.* Every one of those answers already exists on some screen; none of them is on the first one.

A **Today** screen — tonight's classes with a one-tap way into the check-in, the alerts the roster already computes, the three suggestions the lesson sheet already fetches, and one line of system state (last backup, update pending) — would make the first screen the one the owner actually needs, and would give Backup (MORE-1) and the coverage suggestions (STSY-1) the visibility they lack. Mockup in `preview/audit-v2.61/today.html`. Filed as a P2 feature, the only one in this audit graded above P3, because it is the difference between an app that is opened and an app that is used.
