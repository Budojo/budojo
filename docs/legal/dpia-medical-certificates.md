# DPIA-lite — Certificati medici (#227)

> **STATO: BOZZA TECNICA — IN ATTESA DI DECISIONE STRATEGICA + REVISIONE LEGALE.**
> Questo documento è una **DPIA-lite** proporzionata alla scala attuale del trattamento (palestra singola, decine — non migliaia — di interessati per cliente). Non è una DPIA formale ai sensi dell'art. 35 GDPR completa di consultazione del Garante; serve a documentare l'analisi del rischio e la decisione strategica fra le **opzioni A e B** descritte al § 7. Quando una delle due opzioni sarà confermata dal Cliente Budojo (ovvero da chi assume il rischio residuo), questo file sarà aggiornato di conseguenza.

Versione: 0.1 (bozza) · Ultima modifica: 2026-05-09

---

## 1. Cos'è questo documento

Un **certificato medico sportivo** è un dato personale che rivela informazioni sulla salute dell'interessato (idoneità o non idoneità all'attività sportiva). Ai sensi dell'**art. 9 GDPR**, i dati relativi alla salute sono **dati di categoria particolare** e il loro trattamento è in linea di principio vietato, salvo nei casi tassativi del § 2 dello stesso articolo.

Quando un'academy carica i certificati medici dei propri atleti in Budojo, l'app entra nel perimetro del trattamento di dati sanitari. Questo cambia la classe di rischio: passiamo da un "gestionale Trello-style per palestre" a un sistema che processa **dati di categoria particolare**. Le conseguenze pratiche:

- Misure di sicurezza tecniche e organizzative **rafforzate** ai sensi dell'art. 32 GDPR.
- Obbligo di documentare formalmente l'analisi rischi (questa DPIA-lite, eventualmente promossa a DPIA piena se la scala cresce).
- Possibile obbligo di nominare un **DPO** ai sensi dell'art. 37 §1 lett. (c) GDPR ("trattamento su larga scala di categorie particolari di dati"). La soglia di "larga scala" è interpretativa; al volume attuale (singola palestra, < 100 atleti per cliente) è probabilmente sotto-soglia, ma il cumulato di N clienti la avvicina velocemente.
- Maggiore esposizione in caso di data breach (art. 33-34): la notifica al Garante è praticamente sempre dovuta quando sono coinvolti dati sanitari.

L'obiettivo del presente documento è **rendere esplicita** la scelta fra:

- **Opzione A — Tenere i PDF dentro Budojo**, con misure rafforzate (encryption-at-rest, audit log, retention rigorosa, eventuale DPO).
- **Opzione B — Non conservare i PDF**, mantenendo solo i metadati `valid yes/no + expiry`. Il file fisico vive altrove (Drive della palestra, archivio cartaceo).

Le sezioni 2-6 descrivono il trattamento attuale e l'analisi rischi indipendentemente dalla scelta. Il § 7 contiene il confronto strutturato fra le due opzioni e la raccomandazione tecnica. Il § 8 riporta lo stato della decisione (TBD finché non confermata dal Cliente Budojo).

---

## 2. Descrizione del trattamento

### 2.1 Cosa si tratta

Il trattamento riguarda i **certificati medici sportivi** (idoneità non agonistica e agonistica, certificato medico annuale, in alcuni casi consulto specialistico richiesto dalla disciplina) caricati dalla palestra in Budojo come PDF / immagine, indicizzati con:

- atleta proprietario del certificato
- data di emissione
- data di scadenza
- tipologia (campo libero corto)
- file binario su filesystem privato (campo `file_path` su `documents`)

Implementazione attuale (M3 Documents):

- Upload via UI istruttore (`/dashboard/athletes/{id}/documents`).
- Storage: filesystem privato sull'host applicativo (DigitalOcean droplet, regione `fra1`), via Laravel `Storage::disk('local')` sotto `storage/app/private/documents/`. L'accesso al file è sempre mediato dal backend autenticato; non c'è bucket/object-storage esposto. Vedere `docs/entities/document.md`.
- Lettura: download autenticato via endpoint `GET /api/v1/documents/{id}/download` con scoping `academy_id`.
- Scadenze: cron `budojo:send-medical-cert-expiry-reminders` (M5 PR-D) invia un **digest per academy** ai T-30 / T-7 / T-0 giorni dalla scadenza del singolo certificato.

### 2.2 Finalità

- **Conformità normativa.** Il D.M. Salute 24-04-2013 e le relative disposizioni regionali impongono alle ASD/SSD la verifica del certificato medico prima di ammettere l'atleta all'attività. La palestra ha bisogno di un repository per dimostrare la verifica in caso di controllo.
- **Operativa.** L'istruttore scansiona la rosa per scadenze prima di una gara, di un esame di cintura, dell'inizio del trimestre.
- **Tutela dell'atleta.** Un atleta con certificato scaduto non dovrebbe entrare sul tatami; il sistema serve a evitare che entri.

### 2.3 Chi tratta

| Soggetto                              | Ruolo            | Cosa fa                                                                           |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| L'**academy** (palestra cliente)      | Titolare         | Decide quali certificati raccogliere, per quanto tempo conservarli, chi li vede   |
| **Budojo** (la società)               | Responsabile     | Conserva i file su infrastruttura europea, fornisce gli strumenti UI + API        |
| Personale Budojo                      | Sub-incaricato   | Accesso solo su ticket documentato, vincolato da NDA, audit log via § 8           |
| Istruttori dell'academy               | Persone autorizzate dal Titolare | Possono caricare e visualizzare i certificati nella propria academy   |

### 2.4 Base giuridica

La base giuridica è duplice e va articolata caso per caso dal Titolare nella propria informativa interna:

- **Art. 9 §2 lett. (b) GDPR** — adempimento di obblighi di legge in materia di diritto del lavoro / sicurezza sociale (estensibile alle obbligazioni del D.M. Salute per le ASD/SSD);
- **Art. 9 §2 lett. (h) GDPR** — finalità di medicina preventiva o di medicina del lavoro, valutazione della capacità lavorativa del lavoratore (per analogia, la capacità sportiva dell'atleta).

In subordine, **consenso esplicito** ex art. 9 §2 lett. (a) come back-stop. Il consenso DA SOLO è considerato fragile in dottrina; meglio combinarlo con (b) o (h).

---

## 3. Necessità e proporzionalità

| Domanda                                                           | Risposta                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Il trattamento è necessario per la finalità?                      | Sì — la palestra ha l'obbligo legale di verificare il certificato prima dell'attività; conservarlo permette di dimostrare la verifica.  |
| Esiste un'alternativa meno invasiva che raggiunge la stessa finalità? | **Sì** — vedere Opzione B al § 7. Conservare solo `valid yes/no + expiry` riduce il perimetro a un fatto documentale, non al PDF. |
| I dati raccolti sono adeguati e pertinenti?                       | Sì — il certificato in sé è il dato minimo che conferma la finalità.                                                                    |
| Il trattamento è limitato a quanto necessario?                    | Solo se la retention è proporzionata: vedere § 4.                                                                                       |

---

## 4. Retention

Stato attuale (Opzione A — implicita, derivante dal "carichiamo e conserviamo"): nessuna retention attiva. I file restano fino alla cancellazione manuale o alla cancellazione dell'atleta.

Retention proposta (sia in caso di Opzione A che B):

| Evento                                              | Azione sul certificato                                         |
| --------------------------------------------------- | -------------------------------------------------------------- |
| Atleta rimosso dall'academy                         | Cancellazione **immediata e a cascata** di tutti i suoi documenti via `AthleteObserver` → `DeleteDocumentAction` (rimuove sia il record `documents` sia il file binario sul disco `local`). Già implementato.                                       |
| Certificato scaduto da > 24 mesi                    | Cancellazione automatica del singolo file (mantenendo eventualmente solo i metadati `documents.expires_at` per audit, eventualmente con un nuovo flag `purged_at` da aggiungere come parte del lavoro). **Non ancora implementato** — tracciato in #537 (DPIA #227-a).                          |
| Account utente cancellato (Titolare/istruttore)     | Cancellazione finale alla fine della grace-window 30 giorni via cron `budojo:purge-expired-pending-deletions` (#223). Distinto dal caso "atleta rimosso" qui sopra: questo cron purga *utenti*, non *atleti*; le rispettive cascate sono separate.  |
| Risoluzione del contratto Budojo dell'academy       | Cancellazione di tutti i certificati al termine del § 12 del DPA template; il processo manuale è documentato in [`docs/operations/academy-offboarding.md`](../operations/academy-offboarding.md).                                                    |

La finestra di 24 mesi è il compromesso fra "audit storico" (un controllo CONI / FGI può chiedere certificati passati) e minimizzazione. Il numero esatto è negoziabile col Titolare in fase di onboarding.

---

## 5. Identificazione dei rischi

Rischi principali per l'interessato (l'atleta), valutati su scala bassa / media / alta in termini di **probabilità** e **severità**:

| #   | Rischio                                                                       | Probabilità | Severità | Score |
| --- | ----------------------------------------------------------------------------- | ----------- | -------- | ----- |
| R1  | **Data breach** del DB / disco applicativo → esposizione dei certificati medici | Media     | Alta     | Alto  |
| R2  | **Accesso non autorizzato** all'interno della stessa academy (istruttore curioso, account compromesso) | Media | Media | Medio |
| R3  | **Cross-academy leak** — un istruttore vede certificati di un'altra palestra (bug di scoping) | Bassa | Alta | Medio |
| R4  | **Perdita di dati** (storage failure senza backup automatici)                 | Media       | Bassa    | Basso |
| R5  | **Trasferimento extra-UE non documentato** via sub-processor                  | Bassa       | Media    | Basso |
| R6  | **Conservazione oltre la finalità** (mancata cancellazione post-ritiro)       | Alta        | Bassa    | Medio |
| R7  | **Subject access request non onorabile** (no esportazione, no cancellazione)  | Bassa       | Media    | Basso |

> "Probabilità" qui è qualitativa, non statistica. La valutazione presume lo stato dell'arte attuale del codice (non in produzione presso clienti reali al momento della stesura) e va riconvalutata appena entrano i primi clienti reali con dati reali.

---

## 6. Mitigazioni — stato attuale e pianificate

| Rischio | Mitigazione attuale                                                                                  | Mitigazione pianificata                                                                                                    | Issue di riferimento |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| R1      | TLS in transito; backend autenticato; storage privato (non bucket pubblico); password bcrypt          | **Encryption at-rest** dei file medici (chiave gestita lato Budojo) — rinviata in attesa della scelta A vs B               | #224                 |
| R1      | —                                                                                                    | **Backup automatici** documentati come prerequisito di go-live; clausola DPA aggiornata quando attiva                       | DPA § 8              |
| R2      | Nessun audit log strutturato delle azioni sui documenti — solo log applicativi non-strutturati per errori HTTP. | **Audit log immutabile** delle azioni sensibili: visualizzazione/download certificati, modifica/cancellazione, accesso staff | #429                 |
| R3      | Scoping `academy_id` in tutte le query del repository documenti; coverage PEST con feature test cross-academy | Estensione della coverage a tutti gli endpoint che restituiscono documenti; test mirati di tentato cross-academy access | M7-pre               |
| R4      | Storage su droplet (single-host)                                                                     | Backup automatici (vedi sopra)                                                                                              | DPA § 8              |
| R5      | Sub-processor esclusivamente UE (DigitalOcean Frankfurt + Cloudflare con SCC); lista pubblica         | Nessun cambiamento — già mitigato                                                                                          | sub-processors.md   |
| R6      | Cancellazione cascata documenti via `AthleteObserver` → `DeleteDocumentAction` quando l'atleta è rimosso. **Implementata in #537**: cron giornaliero `budojo:purge-expired-medical-certificates` (03:15 Europe/Rome) — purga i certificati medici con `expires_at` antecedente a 24 mesi via lo stesso `DeleteDocumentAction` usato dal cascade. | — (mitigazione completata) | #537 (DPIA #227-a) — chiuso |
| R7      | Endpoint `/me/export` (#222), `/me/deletion-request` (#223); coverage PEST esplicita su `type = medical_certificate` aggiunta in #539 (Art. 15 ZIP include il binario; Art. 17 `PurgeAccountAction` rimuove il file dal disco). **Verificato in v2.3.2.** | Riapertura solo se la decisione A/B § 8 cambia la forma del binario (es. niente più PDF in Budojo). | #538 (DPIA #227-b) — chiuso da #539 |

---

## 7. Decisione strategica — Opzione A vs Opzione B

### 7.1 Opzione A — Tenere i PDF dentro Budojo

**Cosa cambia:** la situazione attuale rimane, e tutte le mitigazioni del § 6 vanno effettivamente implementate. Diventiamo "fornitore SaaS che processa dati sanitari".

**Vantaggi:**

- UX integrata: l'istruttore vede tutto in un posto, una palestra può adottare Budojo senza ridiscutere il proprio archivio fisico/digitale dei certificati.
- Differenziazione di mercato: un competitor che NON conserva i PDF è funzionalmente più povero.
- Sblocca casi d'uso futuri (verifica automatica della validità del certificato tramite OCR, scadenza, condivisione con la federazione).

**Svantaggi:**

- Implementazione di **encryption at-rest** (chiave gestita server-side, rotazione, gestione del wipe) — non banale se fatto bene.
- **Audit log immutabile** delle azioni su certificati medici (chi ha visto cosa, quando) — vincolato da art. 32 §1 lett. (b) GDPR.
- **Eventuale DPO** se il volume cumulato attraversa la soglia di "larga scala". Costo orientativo €2-4k/anno per un DPO esterno.
- **Notifica al Garante** quasi sempre dovuta in caso di breach che coinvolga certificati medici (anche se cifrati, dipende dalla qualità della cifratura).
- **DPIA piena** (non DPIA-lite) consigliata se il numero di interessati cresce: ~10-20 ore di lavoro legale-tecnico ogni 12-18 mesi.

**Costo cumulato annuo stimato:** dev (one-shot) ~80h + ongoing ~20h/anno + €2-4k DPO + costo audit/sicurezza esterni se richiesti dai clienti enterprise.

### 7.2 Opzione B — Non conservare i PDF, solo metadati

**Cosa cambia:** la UI Documents conserva la riga "certificato medico" con `valid yes/no` e `expiry_date`; l'upload del file è rimosso. Il file fisico è responsabilità della palestra (Drive proprio, cartella condivisa, archivio cartaceo).

**Vantaggi:**

- **Drasticamente fuori dal perimetro art. 9.** I metadati `valid yes/no + expiry` non rivelano informazioni sanitarie (sapere che X "ha un certificato valido fino al 31 ottobre" non dice nulla sulla sua salute). Restano dati personali ordinari.
- **Niente encryption at-rest, niente DPO probabile, niente DPIA piena, breach notification rare e meno gravi.**
- Sblocco immediato di mercato sotto-soglia DPO senza barriere di compliance.
- Il certificato resta verificabile dalla palestra in caso di controllo CONI/FGI — semplicemente, il PDF lo tira fuori dal proprio archivio quando glielo chiedono. Il sistema dimostra la **verifica avvenuta** (chi, quando ha confermato la validità) tramite audit log dei metadati.

**Svantaggi:**

- UX più povera: l'istruttore deve tenere doppia tenuta dei certificati (Budojo per le scadenze + Drive per i PDF).
- Funzionalità future (OCR del certificato per estrarre la scadenza in automatico) richiedono Opzione A.
- Marketing più difficile per chi cerca il "vero gestionale completo".

**Costo cumulato annuo stimato:** dev (one-shot) ~30h per la modifica UI + audit log dei metadati (mitiga R2/R6) + 0€/anno DPO.

### 7.3 Tabella di confronto

| Dimensione                         | Opzione A — PDF dentro                   | Opzione B — solo metadati                  |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Categoria GDPR                     | Art. 9 (categoria particolare)           | Art. 6 (dati ordinari)                     |
| Encryption at-rest                 | Necessaria                               | Non necessaria                             |
| Audit log immutabile               | Necessario                               | Consigliato (mitiga R2/R6)                 |
| DPIA formale                       | Consigliata sopra ~500 interessati totali| Non necessaria                             |
| DPO                                | Probabile sopra ~1.000 interessati totali| Non necessario                             |
| UX integrata                       | Sì                                       | Doppia tenuta (Budojo + archivio palestra) |
| Costo dev (one-shot)               | ~80h                                     | ~30h                                       |
| Costo compliance ongoing           | €2-4k/anno + 20h/anno                    | ~0                                         |
| Sblocco features future (OCR, ecc) | Sì                                       | No                                         |
| Rischio breach (probabilità × severità) | Medio-Alto                          | Basso                                      |

### 7.4 Raccomandazione tecnica

**Opzione B fino a traction sufficiente, poi rivalutare.**

Il pattern tipico di un SaaS B2B early-stage è esattamente questo: si parte sotto-soglia GDPR per evitare un costo fisso annuo (DPO) sproporzionato al fatturato, si offre l'integrazione "completa" via storage del cliente (link a Drive / Dropbox dell'academy nella riga del certificato), e si promuove a Opzione A quando la presenza di un compliance officer dedicato è già giustificata da altri requisiti enterprise.

I rischi maggiori (R1, R3) escono dal perimetro nello scenario B: non c'è più un PDF medico da esfiltrare. Questo è di fatto il meccanismo difensivo più forte possibile — non si perde quello che non si tiene.

I rischi residui (R2 = istruttore curioso, R6 = ritenzione oltre finalità) restano ma sono mitigati da audit log + cron di cleanup, già pianificati anche per altri tipi di documento.

---

## 8. Decisione e azioni conseguenti

> **DECISIONE: TBD.**
> Da confermare dal Cliente Budojo (Matteo Bonanno) editando questa sezione e cancellando il blocco TBD. Le azioni conseguenti restano commentate fino alla decisione.

### 8.1 Se Opzione A (PDF dentro)

- [ ] Riaprire #224 (`feat(security): encrypt medical certificates at-rest`) come priorità prima di accogliere il primo cliente con dati reali.
- [ ] Anticipare #429 (`feat(audit): immutable audit log of academy actions`) limitatamente ai documenti sanitari come scope iniziale; estensione successiva.
- [ ] Aggiornare § 4 del DPA template (`docs/legal/dpa-template.md`) sostituendo "DPIA pianificata" con il puntatore al presente file dopo che la decisione è formalizzata.
- [ ] Calendarizzare DPIA piena al raggiungimento di 500 atleti cumulati attraverso tutti i clienti Budojo, e nomina DPO esterno alla soglia di 1.000.
- [ ] Cron retention dei certificati scaduti da > 24 mesi — tracciato in #537 (DPIA #227-a).

### 8.2 Se Opzione B (solo metadati)

- [ ] Issue separata `feat(documents): remove PDF storage for medical certificates, retain valid + expiry`. Migrazione richiesta: rendere `documents.file_path` nullable (oggi `string` NOT NULL — vedere `2026_xx_xxxxxxxxxxxx_create_documents_table`) e gestire la transizione dei valori esistenti — spostarli in uno storage temporaneo + email proattiva all'academy con il PDF in allegato + cancellazione dopo 30 giorni.
- [ ] Aggiornare la UI Documents: row di tipo "medical" perde l'upload, mantiene il toggle "valid" e il datepicker `expiry`.
- [ ] Aggiornare il privacy-policy.md per rimuovere "certificati medici" dalla categoria art. 9 (o segnalare che, dal vX.Y.Z, Budojo non conserva più PDF medici).
- [ ] Chiudere #224 con label "Won't fix per DPIA decision (B)".
- [ ] Aggiornare § 4 del DPA template + tabella `Categorie di dati` rimuovendo "certificati medici" dalla riga art. 9.

### 8.3 Indipendentemente dalla scelta

- [ ] Audit log dei metadati medici (R2, R6) in #429 — utile in entrambe le opzioni.
- [ ] Cron di cleanup metadati di atleti cancellati / scaduti — utile in entrambe le opzioni.
- [ ] Sezione FAQ all'academy in fase di onboarding: spiegare la scelta in linguaggio chiaro (1 paragrafo) prima del checkbox di accettazione del DPA.

---

## 9. Riferimenti

- GDPR Artt. 9 (categorie particolari), 32 (sicurezza), 33-34 (breach notification), 35 (DPIA), 37 (DPO).
- D.M. Salute 24-04-2013 — certificati di idoneità sportiva.
- WP29 / EDPB Guidelines on DPIA (WP248 rev.01).
- DPA template — `docs/legal/dpa-template.md`
- Privacy policy — `docs/legal/privacy-policy.md`
- Sub-processor list — `docs/legal/sub-processors.md`
- M3 Documents PRD — `docs/specs/m3-documents.md`
- Issue #224 — encryption at-rest dei certificati medici
- Issue #429 — audit log immutabile

---

## TODO sull'issue #227 (non in scope per questo PR)

- [ ] **DECISIONE A vs B** — al Cliente Budojo. Il presente file fornisce l'analisi; la scelta è una scelta di prodotto + appetito-al-rischio.
- [ ] **Aggiornamento README.md "Documents (M3)"** dopo la decisione, per allineare la roadmap pubblica.
- [ ] **Aggiornamento `docs/specs/m3-documents.md`** dopo la decisione, per chiudere il loop fra spec e DPIA.
- [ ] **Revisione legale** del presente file (medesima posture del DPA template).
