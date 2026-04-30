# Informativa sulla Privacy (#219)

> **STATO: BOZZA TECNICA — IN REVISIONE LEGALE.**
> Il testo definitivo è in fase di revisione da parte di un legale (issue #219). I fatti tecnici sotto (responsabili del trattamento, regione di hosting, finestra di retention, sub-processor, base giuridica) sono accurati e corrispondono a quanto effettivamente fatto in produzione. Il legale potrà rivedere la formulazione, non i fatti tecnici (che richiederebbero una modifica del software prima di un cambio del documento).

Versione: 0.1 (bozza) · Ultima modifica: 2026-04-30

---

La presente informativa è resa ai sensi dell'**art. 13 del Regolamento UE 2016/679 ("GDPR")** a tutti gli interessati i cui dati personali vengono trattati nell'ambito del servizio Budojo (di seguito "Budojo" o "il Servizio").

## 1. Titolare del trattamento

**Budojo**
Sito web: [budojo.it](https://budojo.it)
Email per richieste privacy: privacy@budojo.it _(da confermare in fase di revisione legale)_

In molti scenari d'uso, **il vero titolare del trattamento dei dati degli atleti è la palestra (academy)** che usa Budojo come gestionale: in tal caso Budojo opera come **responsabile del trattamento (processor)**, secondo i termini del DPA (Data Processing Agreement) sottoscritto fra Budojo e l'academy. La presente informativa copre invece il trattamento per cui Budojo è **direttamente titolare**: la registrazione e gestione del rapporto con l'utente che apre l'account (titolare academy o istruttore amministratore).

## 2. Categorie di dati raccolti

Budojo raccoglie e tratta esclusivamente i dati strettamente necessari al funzionamento del Servizio:

| Categoria | Esempi | Fonte |
|---|---|---|
| **Dati identificativi e di contatto** | Nome, cognome, email | Forniti dall'utente al momento della registrazione |
| **Credenziali di autenticazione** | Hash della password (bcrypt), token Sanctum opachi | Generati dal sistema |
| **Dati dell'academy** | Nome palestra, indirizzo, recapiti telefonici e link ai contatti | Forniti dall'utente al primo setup |
| **Dati degli atleti** | Nome, cognome, data di nascita, cintura, status di tesseramento, recapiti dei tutori (per i minori) | Inseriti dall'academy in qualità di titolare del trattamento |
| **Dati di presenza** | Date di check-in degli atleti agli allenamenti | Generati durante l'uso quotidiano del Servizio |
| **Documenti caricati** | Certificati medici, tesseramenti, documenti d'identità | Caricati dall'academy o dall'atleta su richiesta dell'academy |
| **Metadati tecnici** | Indirizzo IP, user-agent, timestamp di richiesta — limitatamente a finalità di sicurezza e diagnostica errori | Generati dall'infrastruttura |

**Budojo NON raccoglie**: dati di geolocalizzazione, dati di profilazione marketing, identificatori pubblicitari, cookie di tracciamento di terze parti.

## 3. Finalità e base giuridica del trattamento

| Finalità | Base giuridica (art. 6 GDPR) |
|---|---|
| Erogazione del Servizio richiesto dall'utente | **Esecuzione di un contratto** (art. 6.1.b) |
| Gestione del rapporto contrattuale, fatturazione, comunicazioni di servizio | **Esecuzione di un contratto** (art. 6.1.b) |
| Adempimenti fiscali e contabili | **Obbligo di legge** (art. 6.1.c) |
| Sicurezza dell'infrastruttura, prevenzione abusi, log diagnostici | **Legittimo interesse** (art. 6.1.f) — sicurezza del titolare e degli utenti |

I dati degli atleti, in quanto trattati per conto dell'academy-titolare, sono regolati dal **DPA fra Budojo e l'academy** (#220) e dalla base giuridica scelta dall'academy (tipicamente: contratto di tesseramento o consenso del genitore per i minori).

## 4. Periodo di conservazione

| Dato | Durata conservazione |
|---|---|
| Account utente attivo | Per tutta la durata del rapporto |
| Account in cancellazione (cancellazione richiesta dall'utente) | **30 giorni di grace window** entro cui l'utente può annullare la richiesta; dopo tale finestra l'account è **hard-deleted** in modo irreversibile (#223) |
| Dati di fatturazione e contabilità | 10 anni dalla data di emissione (obbligo art. 2220 c.c.) |
| Log applicativi (errori, accessi sospetti) | Massimo 12 mesi |

## 5. Modalità di trattamento e misure di sicurezza

I dati sono trattati con strumenti elettronici, ospitati in **datacenter UE (Frankfurt — DigitalOcean `fra1`)**, e protetti dalle seguenti misure:

- Trasmissione cifrata (TLS 1.2+) per ogni richiesta
- Password salvate solo come hash bcrypt
- Autenticazione tramite token Bearer (Laravel Sanctum) — nessun cookie di sessione
- Backup giornalieri della base dati con retention 30 giorni
- Accessi amministrativi via SSH con autenticazione a chiave
- Audit periodico dei sub-processor (vedi § 7)

I certificati medici, in quanto **dati relativi alla salute** ex art. 9 GDPR, sono oggetto di una valutazione separata documentata in `docs/legal/dpia-medical-certificates.md` (#227).

## 6. Cookie e archiviazione lato browser

Budojo **non usa cookie di tracciamento** né cookie di profilazione di terze parti. L'audit completo è documentato in [`docs/legal/cookie-audit.md`](./cookie-audit.md) (#221) ed è disponibile pubblicamente. In sintesi:

- **Cookie HTTP**: nessuno
- **localStorage**: solo `auth_token` (token di sessione, strettamente tecnico) e `documents.showCancelled` (preferenza UI, non identificativa)
- **sessionStorage / IndexedDB**: nessuno usato direttamente dalla SPA

Per questo motivo non è richiesto un cookie banner ai sensi delle linee guida del Garante del 10 giugno 2021.

## 7. Destinatari dei dati — sub-processor

I dati possono essere trasmessi ai seguenti soggetti, nel ruolo di **sub-responsabili del trattamento**, esclusivamente per le finalità tecniche del Servizio. La lista canonica e aggiornata è pubblicata su [`/sub-processors`](/sub-processors) (#225):

- **Cloudflare, Inc.** — DNS, edge proxy / CDN, TLS termination
- **DigitalOcean, LLC** — VM hosting (regione UE, Frankfurt)
- **Laravel Forge / Tighten Co.** — automazione di provisioning e deploy

Ogni modifica dell'elenco è preceduta da un preavviso di **30 giorni** all'academy.

I dati **non vengono ceduti né venduti** a terzi per finalità di marketing o profilazione.

## 8. Trasferimenti extra-UE

I dati personali sono **conservati in UE** (DigitalOcean Frankfurt). Cloudflare opera tuttavia un'infrastruttura globale di edge nodes: il traffico HTTP transita su PoP geograficamente vicini all'utente, con **garanzie di trasferimento** rette dalle Standard Contractual Clauses (SCC) della Commissione UE.

## 9. Diritti dell'interessato

In ogni momento puoi esercitare i seguenti diritti previsti dagli **articoli 15–22 GDPR**:

| Diritto | Come esercitarlo |
|---|---|
| Accesso ai dati (art. 15) | Esporta tramite `/me/export` (#222) — JSON + ZIP coi documenti |
| Rettifica (art. 16) | Modifica direttamente dalla sezione "Profilo" |
| Cancellazione (art. 17) | "Elimina account" dalla sezione "Profilo" — finestra di grace 30 giorni (#223) |
| Limitazione (art. 18) | Email a privacy@budojo.it |
| Portabilità (art. 20) | L'export di cui sopra è in formato JSON aperto |
| Opposizione (art. 21) | Email a privacy@budojo.it |

## 10. Reclamo all'autorità di controllo

Hai diritto di proporre reclamo all'autorità di controllo competente: per l'Italia il **Garante per la protezione dei dati personali**, via [garanteprivacy.it](https://www.garanteprivacy.it).

## 11. Modifiche all'informativa

Eventuali modifiche sostanziali saranno notificate all'utente via email almeno 30 giorni prima dell'entrata in vigore. Il numero di versione e la data dell'ultima modifica sono pubblicati in cima al documento.

## 12. Riferimenti

- [Sub-processor](./sub-processors.md) (#225)
- [Cookie audit](./cookie-audit.md) (#221)
- [DPIA certificati medici](./dpia-medical-certificates.md) — pianificata (#227)
- [DPA template per academy](./dpa-template.md) — pianificato (#220)
