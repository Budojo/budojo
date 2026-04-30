# Data Processing Agreement (DPA) — Template (#220)

> **STATO: BOZZA TECNICA — IN REVISIONE LEGALE.**
> Il testo definitivo è in fase di revisione da parte di un legale. La struttura, le clausole essenziali ai sensi dell'art. 28 GDPR e i fatti tecnici (sub-processor, regione di hosting, finestra di retention, incident response) sono accurati e corrispondono a quanto effettivamente fatto in produzione. Il legale potrà rivedere la formulazione delle singole clausole, non i fatti tecnici.

Versione: 0.1 (bozza) · Ultima modifica: 2026-04-30

---

## Cos'è questo documento

Quando una palestra (o associazione sportiva, club, dojo — di seguito "**Cliente**") usa Budojo come gestionale, è il **Cliente** che decide quali dati personali raccogliere dai propri atleti, per quale finalità, e per quanto tempo conservarli. In termini GDPR: **il Cliente è il titolare del trattamento (data controller); Budojo è il responsabile del trattamento (data processor)**.

L'art. 28 GDPR richiede che la relazione titolare ↔ responsabile sia regolata da un contratto scritto vincolante. Questo documento è il **template** di tale contratto, da firmare al primo onboarding di una palestra cliente. La versione vigente è sempre disponibile in `/legal/dpa` (#220 follow-up) e su questa pagina del repository.

> **English version:** the bilingual (IT + EN) variant tracked in #220 is a planned follow-up. This first iteration ships the Italian-only template that covers the launch market.

---

## Parti

- **TITOLARE** — la palestra/associazione sportiva/club che ha sottoscritto un contratto di servizio Budojo. I dati identificativi (denominazione, sede, P.IVA / CF, legale rappresentante) sono inseriti dal Cliente al primo onboarding nel record `academy`. _Pianificato (#220 follow-up): un timestamp di accettazione del DPA + l'IP da cui è stata effettuata la sottoscrizione saranno aggiunti al medesimo record una volta implementato il workflow di accettazione descritto fra i TODO in fondo a questo documento._
- **RESPONSABILE** — Budojo, con sede in Italia, contattabile a `privacy@budojo.it` (mailbox da confermare in fase di revisione legale).

## 1. Oggetto del trattamento

Il Responsabile si impegna a trattare per conto del Titolare i dati personali che il Titolare carica nel Servizio Budojo nell'ambito della gestione anagrafiche atleti, presenze, documenti, pagamenti e comunicazioni di servizio collegate.

## 2. Durata

Il presente DPA ha la stessa durata del contratto di servizio Budojo sottoscritto fra le Parti. Cessa automaticamente alla risoluzione del contratto, salve le clausole sulla restituzione/cancellazione dei dati di cui al § 12.

## 3. Natura e finalità del trattamento

| Finalità | Operazioni effettuate sui dati |
|---|---|
| Gestione anagrafiche atleti | Inserimento, lettura, modifica, cancellazione record `Athlete`. |
| Tracciamento presenze | Inserimento + lettura record `attendance_records` (data + atleta + tipo allenamento). |
| Documenti tesseramento, certificati medici, identità | Upload, conservazione cifrata-in-transito, lettura, cancellazione, monitoraggio scadenze. |
| Pagamenti (ledger interno) | Tracciamento mensile dell'incassato per atleta/quota. NON include processore di pagamenti — Budojo NON elabora carte di credito al momento. |
| Comunicazioni di servizio | Email transazionali (verifica account, reminder scadenze, conferme di azioni). |

## 4. Tipo di dati personali e categorie di interessati

| Categoria interessato | Categorie di dati |
|---|---|
| Atleta adulto | Dati identificativi (nome, cognome, data di nascita, CF se inserito), dati di contatto, dati sportivi (cintura, tesseramento, status), documenti caricati (certificati medici — **dati sanitari art. 9 GDPR**, tesseramenti, documenti d'identità), presenze, pagamenti. |
| Atleta minore | Come sopra + dati identificativi e di contatto del/dei tutori legali. |
| Istruttore / amministratore della palestra | Dati identificativi e di contatto, credenziali (hash bcrypt). |

I dati relativi alla salute (certificati medici) sono trattati con misure rafforzate documentate in `docs/legal/dpia-medical-certificates.md` (DPIA, #227 — pianificata).

## 5. Obblighi del Responsabile

Il Responsabile si impegna a:

1. **Trattare i dati esclusivamente sulla base di istruzioni documentate del Titolare.** Le istruzioni del Titolare sono espresse tramite l'uso normale del Servizio (ogni inserimento/modifica/cancellazione è un'istruzione esplicita).
2. **Garantire la riservatezza** del personale autorizzato al trattamento mediante NDA o equivalente contrattuale.
3. **Adottare le misure di sicurezza** elencate al § 8 e mantenerle aggiornate rispetto allo stato dell'arte e al rischio.
4. **Coadiuvare il Titolare** nell'adempimento degli obblighi di risposta alle richieste degli interessati (artt. 15-22 GDPR), fornendo gli strumenti tecnici di esportazione (`/me/export`) e cancellazione (`/me/deletion-request`).
5. **Coadiuvare il Titolare** nell'effettuazione di DPIA quando richieste dalla natura del trattamento.
6. **Restituire o cancellare i dati** a fine contratto, secondo le modalità del § 12.
7. **Mettere a disposizione del Titolare** tutte le informazioni necessarie per dimostrare il rispetto degli obblighi di cui al presente DPA, inclusi audit secondo § 11.

## 6. Sub-processor

Il Responsabile è autorizzato in via generale ad avvalersi di sub-responsabili del trattamento per l'esecuzione dei servizi, a condizione che:

1. La lista canonica e aggiornata dei sub-processor è pubblicata in tempo reale in [/sub-processors](/sub-processors) (`docs/legal/sub-processors.md`).
2. Ogni modifica della lista (aggiunta o sostituzione) è preceduta da **preavviso al Titolare di almeno 30 giorni**, con comunicazione via email all'indirizzo amministrativo registrato.
3. Il Titolare può **opporsi per iscritto** entro i 30 giorni; un'opposizione vincolante comporta la rinuncia del Responsabile alla modifica oppure la facoltà del Titolare di risolvere il contratto pro-quota.
4. Il Responsabile rimane **responsabile in solido** verso il Titolare per le inadempienze dei propri sub-processor.
5. Il Responsabile sottoscrive con ciascun sub-processor un contratto che impone obblighi di protezione dei dati equivalenti a quelli del presente DPA.

I sub-processor in essere alla data di firma del presente DPA sono:

- **Cloudflare, Inc.** — DNS, edge proxy, CDN, TLS termination
- **DigitalOcean, LLC** — hosting VM (regione UE, Frankfurt — `fra1`)
- **Laravel Forge / Tighten Co.** — provisioning e deploy automation

## 7. Trasferimenti extra-UE

I dati sono **conservati in UE** (DigitalOcean Frankfurt). Cloudflare opera un'infrastruttura globale di edge node: il traffico HTTP transita su PoP geograficamente vicini all'utente, con garanzie di trasferimento rette dalle **Standard Contractual Clauses (SCC)** della Commissione UE 2021/914. Nessun trasferimento sistematico fuori UE è previsto al di fuori di quanto sopra.

## 8. Misure di sicurezza

Il Responsabile adotta le seguenti misure tecniche e organizzative:

### Sicurezza tecnica

- Trasmissione cifrata TLS 1.2+ per ogni richiesta verso il Servizio.
- Password salvate solo come hash bcrypt; mai in chiaro.
- Autenticazione tramite token Bearer (Laravel Sanctum); nessun cookie di sessione.
- Accessi amministrativi via SSH con autenticazione a chiave; password disabilitate.
- Patch management automatizzato del sistema operativo.

> **Backup — pianificato.** Una strategia di backup automatizzata (decisione fra DigitalOcean Managed Database, `mysqldump` cron su object store, oppure snapshot del droplet) è documentata come prerequisito di go-live in `docs/infra/production-deployment.md` § Backups. Sarà implementata e questa clausola aggiornata prima del primo cliente con dati reali in produzione. Fino ad allora, i fattori di rischio aggiuntivi sono divulgati al Cliente in fase di onboarding e l'eventuale uso del Servizio è limitato a contesti compatibili con la mancanza di backup automatici.

### Sicurezza organizzativa

- Personale autorizzato vincolato da clausola di riservatezza.
- Principio del minimo privilegio: accesso ai dati solo per il personale strettamente necessario, su base ticket.
- Audit periodico del codice sorgente (PHPStan livello 9 + PEST + lint frontend) prima di ogni rilascio.
- Audit periodico dei sub-processor secondo § 6.

### Logging e monitoraggio

- Log applicativi di errori e accessi sospetti, con retention massima 12 mesi.
- I log NON contengono dati identificativi degli atleti oltre l'`id` numerico (PII discipline — vedi #247).

## 9. Data breach notification

In caso di violazione dei dati personali (art. 33 GDPR) il Responsabile:

1. Notifica al Titolare **senza ingiustificato ritardo**, e comunque entro **48 ore** dalla scoperta della violazione.
2. La notifica include: descrizione della natura della violazione, categorie e numero approssimativo di interessati, conseguenze probabili, misure adottate o proposte per contenere/rimediare.
3. Coadiuva il Titolare nell'adempimento dei propri obblighi di notifica al Garante (entro 72 ore) e, se applicabile, agli interessati.
4. Documenta ogni violazione in registro interno disponibile al Titolare su richiesta.

## 10. Diritti degli interessati

Il Responsabile mette a disposizione del Titolare gli strumenti tecnici per coadiuvare la risposta alle richieste degli interessati ex artt. 15-22 GDPR:

| Diritto | Strumento tecnico |
|---|---|
| Accesso ai dati (art. 15) | Endpoint `/me/export` — JSON + ZIP coi documenti (#222) |
| Rettifica (art. 16) | UI "Profilo" + endpoint REST |
| Cancellazione (art. 17) | "Elimina account" con grace window 30 giorni + cron `budojo:purge-expired-pending-deletions` (#223, #247) |
| Limitazione (art. 18) | Tramite ticket a `privacy@budojo.it` |
| Portabilità (art. 20) | L'export di cui sopra è in formato JSON aperto |
| Opposizione (art. 21) | Tramite ticket a `privacy@budojo.it` |

## 11. Audit

Il Titolare ha diritto, con **preavviso scritto di almeno 14 giorni**, di effettuare audit (anche tramite terzi qualificati) sull'aderenza del Responsabile al presente DPA. L'audit:

- non può ostacolare l'operatività del Servizio
- è soggetto a clausola di riservatezza
- avviene al massimo una volta l'anno, salvo violazione documentata o richiesta del Garante
- i costi dell'audit sono a carico del Titolare, salvo emergano violazioni sostanziali (in tal caso a carico del Responsabile)

## 12. Restituzione e cancellazione dei dati a fine contratto

Alla risoluzione del contratto di servizio Budojo, il Responsabile:

1. Mette a disposizione del Titolare l'**export completo** dei dati associati al suo account (formato JSON + ZIP coi documenti) per **30 giorni** dalla data di risoluzione.
2. Decorso tale termine, **cancella in modo irreversibile** tutti i dati del Titolare e dei suoi atleti dalla base dati e dai backup, salvo obblighi di legge contrari (es. dati di fatturazione conservati per 10 anni ex art. 2220 c.c. — limitati ai dati identificativi del Titolare, NON degli atleti).
3. La cancellazione è eseguita automaticamente dal cron `budojo:purge-expired-pending-deletions` per gli account utente; per la chiusura completa di un'academy un processo manuale documentato in `docs/operations/academy-offboarding.md` (TODO follow-up) è eseguito da un membro autorizzato del personale Budojo.

## 13. Responsabilità e indennizzo

Le Parti rispondono ciascuna per la propria condotta. Il Responsabile risponde dei danni cagionati da inadempimento delle proprie obbligazioni ai sensi del presente DPA o del GDPR. La responsabilità è limitata ai termini del contratto di servizio Budojo sottoscritto fra le Parti, salvo dolo o colpa grave.

## 14. Modifiche al DPA

Le modifiche sostanziali al presente DPA sono comunicate al Titolare con preavviso di almeno 30 giorni. Il Titolare può opporsi alla modifica risolvendo il contratto di servizio entro tale termine; la prosecuzione del rapporto oltre la data di entrata in vigore della modifica vale come accettazione.

## 15. Legge applicabile e foro competente

Il presente DPA è regolato dalla **legge italiana**. Per ogni controversia è competente in via esclusiva il foro del luogo di domicilio del Titolare, salvo le competenze esclusive previste dalle norme inderogabili di legge.

## 16. Disposizioni finali

In caso di conflitto fra il presente DPA e il contratto di servizio Budojo, prevale il presente DPA per quanto attiene al trattamento dei dati personali. Per quanto non espressamente disciplinato, si applicano il GDPR e la normativa nazionale italiana sulla protezione dei dati personali.

---

## Riferimenti

- [Sub-processor list](./sub-processors.md) (#225)
- [Cookie audit](./cookie-audit.md) (#221)
- Privacy policy — `docs/legal/privacy-policy.md`, in lavorazione su #219; link diretto attivato una volta che #219 sarà mergato.
- DPIA certificati medici — `docs/legal/dpia-medical-certificates.md`, pianificata su #227; link attivato una volta che il documento sarà redatto.
- GDPR Art. 28 — responsabili del trattamento
- Standard Contractual Clauses Commissione UE 2021/914

## TODO sull'issue #220 (non in scope per questo PR)

- [ ] **Versione inglese** parallela. Il template italiano sopra copre il mercato di lancio; la versione bilingue è un follow-up quando emergerà il primo cliente non italiano.
- [ ] **Generazione PDF firmabile** e workflow di sottoscrizione. Inizialmente: PDF + scansione firmata via mail. Decisione su firma elettronica (DocuSign/Yousign) rimandata dopo lancio.
- [ ] **Workflow nel signup**: la palestra accetta il DPA al primo login (checkbox + log con timestamp + IP). Migrazione + Action server-side + UI.
- [ ] **Pagina `/legal/dpa`** che renderizza questo template per consultazione post-onboarding.
