# Play Store listing — Budojo

Source-of-truth for the Google Play Console listing. Anything that lands on the store goes through this file first; the listing UI in Play Console is downstream of what's here.

Two locales: **English (en-US)** as the required default, **Italian (it-IT)** as the localized variant for the primary launch market. Keep both in lock-step — never edit one without the other in the same commit.

Length budgets are enforced by Play Console at upload time:

| Field             | Max chars |
| ----------------- | --------- |
| App name          | 30        |
| Short description | 80        |
| Full description  | 4000      |

The character counts at the bottom of each section are the live count after the last edit — re-run them when you change copy. Play Console enforces **character** budgets (not byte budgets), so the counts here use Python's `len()` on the unicode string. With non-ASCII text (Italian `è`, `—`, `'`) bytes and characters diverge, and the byte count is irrelevant for store acceptance — use chars. A copy edit that goes over budget is the kind of mistake the store catches at the very end of the submission flow when nobody wants to be there.

---

## App name

**EN:** `Budojo`

**IT:** `Budojo`

(13 / 30 in both locales — the brand is the brand; no localized variant.)

---

## Short description

### English

```
BJJ + martial-arts academy management: athletes, certs, attendance, payments.
```

(77 / 80)

### Italian

```
Gestione palestra BJJ e arti marziali — atleti, certificati, presenze, quote.
```

(77 / 80)

> "Quote" is the Italian word an academy owner uses for monthly dues — mirrors what they say to the parents at the door. "Pagamenti" is technically correct but reads colder.

---

## Full description

### English

```
Budojo is the all-in-one tool for the small Brazilian Jiu-Jitsu and martial-arts academy.
Track every athlete, every medical certificate, every check-in, and every payment from
your phone — no spreadsheets, no shared Google Sheet that someone always overwrites.

Built by an instructor who got tired of sticky notes on the office door.

— What you get —

• Athlete roster with belt rank, status (active / inactive / on leave), birthday, and
  contact details. Filter by belt, by status, or by name as you walk the mat.

• Documents that expire — medical certificates, insurance, parental consent. Budojo
  flags what's expiring this month so the kid doesn't show up Tuesday with an expired
  certificate and you have to send him home.

• Daily attendance in two taps. Mark who showed up, walk back to the next class.
  Backfill last week's attendance from the couch on Sunday.

• Monthly payments. Mark who paid, see at a glance who hasn't, send a reminder.
  No accounting jargon, no hidden integrations — just a list and a check mark.

• Your data, in your country. Budojo runs on European infrastructure and is built
  for GDPR from the foundation. No ad networks, no third-party trackers, no
  selling-the-list-to-anyone.

— Why mobile —

You don't run an academy from a desk. You run it from the mat, the lobby, the
parking lot before class. Budojo is built mobile-first — the same screen you use
on the phone is the same screen you'd use on a tablet or laptop, except smaller
and where you actually are.

— What it costs —

Free during the early-access period. Paid plans coming later, priced for the
single-room dojo, not for the corporate chain. You'll be told before anything
changes; you'll never be auto-billed without consent.

— Who built this —

A jiu-jitsu instructor and a small team in Italy. We use Budojo for our own
academy. If something doesn't work, you'll get an answer from a human, usually
within the day.

— Privacy —

Budojo is the data processor; your academy is the data controller. We process
athlete data on your behalf, in EU data centres, with encryption in transit (TLS)
and access controls per academy. Read our privacy policy at
https://budojo.it/privacy for the full picture, including the per-data-category
retention table and the contact for data subject requests.

Questions? support@budojo.it
```

### Italian

```
Budojo è lo strumento all-in-one per la piccola palestra di Brazilian Jiu-Jitsu e
arti marziali. Tieni traccia di ogni atleta, ogni certificato medico, ogni
presenza e ogni quota dal tuo telefono — niente fogli Excel, niente Google Sheet
condivisi che qualcuno sovrascrive sempre.

Costruito da un istruttore stanco dei post-it sulla porta dell'ufficio.

— Cosa offre —

• Anagrafica atleti con cintura, stato (attivo / inattivo / in pausa), data di
  nascita e contatti. Filtra per cintura, per stato o per nome mentre cammini sul
  tatami.

• Certificati che scadono — visita medica, assicurazione, consenso del genitore.
  Budojo ti segnala cosa scade questo mese, così martedì il ragazzo non si presenta
  con la visita scaduta e ti tocca mandarlo a casa.

• Presenze giornaliere in due tap. Segna chi è venuto, torna alla prossima lezione.
  Recuperi le presenze della settimana scorsa dal divano la domenica.

• Quote mensili. Segna chi ha pagato, vedi a colpo d'occhio chi non lo ha fatto,
  invia un promemoria. Nessun gergo contabile, nessuna integrazione nascosta —
  solo una lista e una spunta.

• I tuoi dati, nel tuo paese. Budojo gira su infrastrutture europee ed è costruito
  per il GDPR fin dalle fondamenta. Niente ad network, niente tracker di terze
  parti, niente vendita-della-lista-a-chiunque.

— Perché mobile —

Non gestisci una palestra da una scrivania. La gestisci dal tatami, dall'ingresso,
dal parcheggio prima della lezione. Budojo è pensato mobile-first — la stessa
schermata che usi sul telefono è quella che useresti su tablet o portatile, solo
più piccola e dove ti trovi davvero.

— Cosa costa —

Gratuito durante il periodo di anteprima. Piani a pagamento in arrivo,
prezzati per il dojo a sala singola, non per la catena aziendale. Verrai
avvertito prima di qualunque cambio; nessun addebito automatico senza il tuo
consenso.

— Chi lo fa —

Un istruttore di jiu-jitsu e un piccolo team in Italia. Usiamo Budojo per la nostra
palestra. Se qualcosa non va, ricevi una risposta da una persona, di solito in
giornata.

— Privacy —

Budojo è il responsabile del trattamento; la tua palestra è il titolare. Trattiamo
i dati degli atleti per tuo conto, in data center UE, con cifratura in transito
(TLS) e separazione degli accessi per palestra. Leggi la privacy policy completa
su https://budojo.it/privacy/it — c'è la tabella di conservazione per
categoria di dato e il contatto per le richieste di esercizio dei diritti.

Domande? support@budojo.it
```

> Voice is intentionally folksy / second-person ("you", "tu") — Krug's "Don't Make Me Think" applied to listing copy. The store reader is a busy academy owner browsing on a phone; long, formal copy gets skipped.

---

## Privacy policy URL

| Field          | Value                              |
| -------------- | ---------------------------------- |
| EN listing URL | `https://budojo.it/privacy`    |
| IT listing URL | `https://budojo.it/privacy/it` |

The localized variant is automatically selected by the store based on user locale. Both are public, unauthenticated routes — already shipped (#420 / cookie-banner umbrella).

---

## Data Safety section — questionnaire answers

The Data Safety form is a structured questionnaire, not free text. Answers below are the canonical truths; transcribe verbatim into the Play Console form when filling it.

### Does your app collect or share any of the required user data types?

**Yes** — the app collects user data.

### Is all of the user data collected by your app encrypted in transit?

**Yes.** TLS 1.2+ end-to-end. The SPA is served from Cloudflare Pages over HTTPS; the SPA then calls the API origin (`api.budojo.it`, Forge-managed) directly over HTTPS — Pages does not proxy the API. The API talks to MySQL over an internal connection on the same host (no public network). Every external hop is encrypted in transit.

### Do you provide a way for users to request that their data is deleted?

**Yes.** In-app account deletion lives at `/dashboard/profile` → "Delete account". Honoured within 30 days per GDPR Art. 17. Out-of-band requests at `support@budojo.it` are also accepted (covered by the privacy policy).

### Data types collected (per Play Console category)

| Category                            | Collected | Shared with third parties | Optional / required | Why                                                                                                                |
| ----------------------------------- | --------- | ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Personal info → Name**            | Yes       | No                        | Required            | Owner sign-up + each athlete record carries a name. Functional — the app cannot operate without identifying people.|
| **Personal info → Email address**   | Yes       | No                        | Required            | Login + transactional emails (medical-cert expiry digest, password reset).                                         |
| **Personal info → Phone number**    | Yes       | No                        | Optional            | Per-athlete contact field — owners use it to phone parents. Not collected from the owner directly.                 |
| **Personal info → Address**         | No        | —                         | —                   | Not stored today. (#445 M7 may add for invoicing — re-evaluate at that point.)                                     |
| **Personal info → Race / ethnicity**| No        | —                         | —                   | Never collected.                                                                                                   |
| **Personal info → Sexual orientation** | No     | —                         | —                   | Never collected.                                                                                                   |
| **Personal info → Politics / religion**| No     | —                         | —                   | Never collected.                                                                                                   |
| **Health & fitness → Health info**  | Yes       | No                        | Optional            | Medical certificate file uploads (PDF / image) for athlete fitness clearance. Treated as Art. 9 special-category data — see #224 / #227 for the encryption + retention story.|
| **Photos and videos → Photos**      | Yes       | No                        | Optional            | Owner / athlete avatar (#411). Stored on the same EU infrastructure as the rest of the app data.                   |
| **Files and docs**                  | Yes       | No                        | Optional            | Document uploads (medical, insurance, consent) under M3.                                                           |
| **App activity → App interactions** | No        | —                         | —                   | No analytics / tracking events on the user.                                                                        |
| **App activity → In-app search history**| No    | —                         | —                   | Not stored.                                                                                                        |
| **App info and performance → Crash logs**| No   | —                         | —                   | No third-party crash reporter wired (deliberate — #226-style decision).                                            |
| **Device or other identifiers**     | No        | —                         | —                   | No advertising ID, no device fingerprinting.                                                                       |
| **Financial info → Purchase history**| Yes      | No                        | Optional            | The owner records, per athlete, that the monthly dues were paid (`amount_cents` + month/year ledger). No card numbers, no IBANs, no transaction processors — Budojo never sees a card. Per Play's taxonomy this is **purchase history** even without the payment instrument.|
| **Financial info → Other (cards, IBANs, etc)**| No | —                         | —                   | Never collected. Budojo does not process payments — the academy collects offline.                                  |
| **Location → Approximate / precise**| No        | —                         | —                   | Never requested or stored.                                                                                         |
| **Web browsing**                    | No        | —                         | —                   | Not relevant.                                                                                                      |
| **Audio**                           | No        | —                         | —                   | Not relevant.                                                                                                      |
| **Messages**                        | No        | —                         | —                   | No in-app messaging today.                                                                                         |
| **Contacts**                        | No        | —                         | —                   | Never accessed.                                                                                                    |
| **Calendar**                        | No        | —                         | —                   | Never accessed.                                                                                                    |

> The two **Yes** answers that matter for review optics are health info (medical certificates) and photos (avatars). Both are user-provided uploads, both carry a retention rule documented in `/privacy`, neither is shared. If Play asks a clarifying question on either, the answer is in the privacy policy and the linked data-processing addendum (#220).

### Data security practices — additional checkboxes

| Practice                                                | Answer | Notes                                                                                                                |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Data is encrypted in transit                            | Yes    | TLS 1.2+ everywhere.                                                                                                 |
| User can request data deletion                          | Yes    | In-app + support email. 30-day SLA.                                                                                  |
| Committed to the Play Families policy                   | N/A    | App is not directed at children under 13 — owners are adults; underage athletes are dependent users of the academy.  |
| Independent security review                             | No     | Not yet — flag for re-evaluation when the audit log (#429) and at-rest encryption for medical certs (#224) ship.     |

---

## Visual assets — separate work item

The visual side of the listing — feature graphic 1024×500, icon 512×512, 4-6 portrait screenshots 1080×1920 from canonical surfaces, optional 7-inch tablet screenshots — is not in this file because none of it is text. Track it in the M9 follow-up issue (filed alongside this listing) and stage the assets in `docs/mobile/play-store-assets/` (gitignored unless we decide to commit small previews) before submission.

App icon at 512×512: `client/public/icons/icon-512.png` already exists; verify Play accepts the maskable variant or re-export a non-maskable 512×512 from the brand glyph if the rejection rule kicks in.

---

## Submission checklist (operator-facing)

When the time comes to fill the Play Console listing UI, work top-down through this list — every line is gated by a section above:

- [ ] App name (both locales) — copy from § App name
- [ ] Short description (both locales) — copy from § Short description
- [ ] Full description (both locales) — copy from § Full description
- [ ] Privacy policy URL (both locales) — copy from § Privacy policy URL
- [ ] App category — pick **one** category in Play Console (the field is single-select). Recommendation: `Productivity`. Rationale: `Sports` alone funnels the app into athlete-tracking comparisons (Strava-style apps) where Budojo doesn't win; `Productivity` matches "academy management tool" more cleanly. Use the `Tags` field (separate from category, multi-select) to add `Sports` / `Business` once the listing is live so the app surfaces in those discovery slices too.
- [ ] Content rating — fill the IARC questionnaire. No violence, no in-app purchases, no user-to-user communication today; expect a "Everyone" rating.
- [ ] Target audience — adults (academy owners). Not designed for children.
- [ ] Data Safety form — answer per § Data Safety section above.
- [ ] Visual assets — see § Visual assets — separate work item.
