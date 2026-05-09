# Academy offboarding runbook

> **STATO: BOZZA TECNICA — OPERATIVAMENTE FUNZIONALE.**
> Questo file è il puntatore concreto referenziato dal § 12 del DPA template (`docs/legal/dpa-template.md`) e dal § 8 della DPIA-lite (`docs/legal/dpia-medical-certificates.md`). Descrive **la procedura manuale** che il personale Budojo segue quando un'academy cliente termina il contratto. La forma "manuale" è deliberata: il volume attuale (singole accademie, terminazioni rare e mai bulk) non giustifica un'automazione, e una procedura scritta è facile da rivedere all'occorrenza.

Versione: 0.1 (bozza) · Ultima modifica: 2026-05-09

---

## Quando si applica

Questa procedura parte quando una delle tre condizioni si verifica:

1. L'academy comunica formalmente la cessazione del contratto Budojo (email, lettera raccomandata, o ticket support).
2. L'academy non rinnova al termine del periodo contrattuale e non risponde al sollecito di rinnovo entro 14 giorni.
3. Budojo risolve unilateralmente il contratto per giusta causa (uso non conforme, mancato pagamento prolungato, violazione delle norme di servizio).

In tutti e tre i casi il **giorno zero (T0)** è la data di efficacia della cessazione, NON la data della comunicazione. Quando `T0` non è esplicito (caso 2), si assume `T0 = data di scadenza del contratto`.

---

## Le tre finestre temporali

| Finestra        | Da → A          | Cosa accade                                                                                                                              |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-T0**      | T-30 → T0       | Notifica di cessazione + onboarding del cliente all'export. L'academy resta operativa.                                                   |
| **Grace export**| T0 → T+30       | L'academy NON è più operativa. I dati sono congelati ma esportabili. Cliente può scaricare un export completo.                             |
| **Purge**       | T+30 → T+60     | Cancellazione irreversibile su DB, disco applicativo, log, e (per quanto applicabile) sub-processor. Audit trail conservato 12 mesi.      |

Il cliente è informato di tutte e tre le finestre nella comunicazione di T-30 (vedere § Step 1).

---

## Step 1 — T-30 (oppure data di comunicazione + 7gg) — Notifica di cessazione

**Inviato a**: contatto amministrativo dell'academy registrato nel record `academy.email`.

**Canale**: email transazionale firmata + (per i clienti enterprise) PEC parallela.

**Contenuto canonico**:

- Conferma della cessazione e data di efficacia (T0) calcolata univocamente.
- Le tre finestre sopra, in chiaro, con date assolute.
- Istruzioni operative:
  - "Scarica il tuo export completo da `/dashboard/profile` → 'Esporta i miei dati' (#222)" — JSON + ZIP coi documenti.
  - "Salva l'export PRIMA della finestra di grace, perché il download richiede l'account ancora attivo. Dopo T0 puoi richiederlo via email a privacy@budojo.it ma può richiedere fino a 5 giorni lavorativi."
- Riferimento al § 12 del DPA per gli obblighi reciproci.
- Recapito di contatto Budojo per emergenze: `support@budojo.it`.

**Tracciamento**: il messaggio è loggato nella tabella `outbox_log` (TODO: tabella da implementare se ancora non esiste — al momento i Mailables sono stateless) con `event_type = academy_offboarding_notice`, `academy_id`, `sent_at`, `t0`. Lo schema esatto è da finalizzare al prossimo passaggio in produzione.

---

## Step 2 — T0 — Disabilitazione operativa

Eseguito da personale Budojo autorizzato (oggi: il singolo titolare; in futuro: ruoli multi-utente #428).

**Azioni in ordine, idempotenti**:

1. **Disattivare il login dell'academy.** Un campo `users.disabled_at` (o equivalente) viene impostato per ogni utente associato all'academy. Tentativi di login restituiscono 403 con messaggio "Il tuo account è in fase di offboarding — contatta support@budojo.it".

   > NOTA: oggi questa colonna NON esiste nel modello `User`. Il workaround attuale è impostare la password a un hash non-recuperabile + attivare un flag mentale "do not assist this email". È una soluzione temporanea che funziona finché il volume è zero; va sostituita con un vero campo `disabled_at` quando arriva il primo offboarding reale (TODO `#academy-offboarding-a` da aprire come issue al primo caso reale).

2. **Marcare l'academy.** Aggiungere un record nella tabella `academy_offboardings` (TODO: tabella da implementare al primo caso reale) con `academy_id`, `t0`, `t_purge` (= T+30), `reason`, `notice_sent_at`. Serve a:
   - Coordinare cron e personale durante la grace
   - Ricostruire l'audit trail post-purge
   - Bloccare riattivazioni accidentali se l'utente ricrea l'account con la stessa email

3. **Sospendere i cron operativi per l'academy.** I principali sono `budojo:send-medical-cert-expiry-reminders` (M5 PR-D) e altri reminder scheduler. La sospensione è un filtro `WHERE academy.disabled_at IS NULL` aggiunto alle query del cron. Senza questo filtro, l'academy continuerebbe a ricevere email anche dopo la cessazione — peggio: dopo il purge, le email partirebbero su academy_id orfani e fallirebbero in modo silenzioso.

4. **Notifica al titolare amministrativo Budojo** (email interna): "L'academy `<id>:<nome>` è entrata in grace export. Purge programmato per T+30 (`<data>`). Verifica la coda email outbound per gli ultimi 30 giorni e considera se cancellare reminder già schedulati."

---

## Step 3 — T0 → T+30 — Grace export

**Stato**: dati congelati ma esportabili tramite richiesta scritta a `privacy@budojo.it`.

**Operazioni eseguite su richiesta**:

- **Export su richiesta**: il personale autorizzato accede via SSH alla droplet, esegue `php artisan academy:export <academy_id>` (TODO: comando da implementare al primo caso reale; per ora si compone manualmente facendo `php artisan tinker` + `User::find(...)->export()`). Output: ZIP firmato consegnato al cliente via link Cloudflare R2 a scadenza 7 giorni.
- **Domande del cliente**: indirizzate a `privacy@budojo.it`. Risposte entro 2 giorni lavorativi.

**Operazioni NON eseguite**:

- Restore dello stato attivo: una volta entrati in grace, il ritorno operativo richiede un nuovo onboarding completo, NON una semplice re-attivazione. Questa è una regola di sicurezza, non una limitazione tecnica.
- Modifiche ai dati congelati: né l'academy né il personale Budojo possono modificare anagrafiche atleti, presenze o pagamenti durante la grace. La consultazione è ammessa; la modifica no.

---

## Step 4 — T+30 — Purge

**Eseguito da**: personale Budojo autorizzato, manualmente, in sessione tracciata. Mai automatico finché il volume non lo giustifica.

**Pre-checklist (mandatorio)**:

- [ ] L'academy ha confermato la ricezione dell'export almeno una volta, via email o ticket support? Se NO, contatto telefonico/email aggiuntivo prima di procedere; estendere la grace di 7 giorni è preferibile a un purge che il cliente percepirà come "i miei dati sono spariti senza avvertimento".
- [ ] La tabella `academy_offboardings` registra `t_purge_executed_at = NULL`? Se NON-NULL il purge è già avvenuto — abort.
- [ ] È disponibile un backup esterno della snapshot pre-purge (vedere DPA template § 8 quando i backup automatici saranno attivi). Oggi l'unica opzione è uno snapshot manuale del droplet eseguito in finestra di basso traffico, prima di procedere.

**Sequenza purge**:

1. **Documenti su disco** — `Storage::disk('local')->delete($document->file_path)` per ogni `Document` con `academy_id = X`. Attualmente eseguito via `php artisan tinker` o uno script ad-hoc; al primo caso reale, promuovere a `php artisan academy:purge <id>`.
2. **Record DB** — sequenza cascade:
   - `attendance_records` WHERE academy_id = X
   - `documents` WHERE athlete.academy_id = X (l'observer cascade `AthleteObserver` → `DeleteDocumentAction` non si attiva per il soft-delete dell'academy; va eseguito esplicitamente)
   - `athletes` WHERE academy_id = X
   - `users` con `academy_id = X` (titolare academy + eventuali istruttori)
   - `personal_access_tokens` per quegli utenti (cascade tipicamente automatico via FK; verificare)
   - `academies` WHERE id = X
   - Eventuali tabelle ausiliarie (`pending_deletions`, `password_resets`, ecc.) per gli stessi user_id.
3. **Email outbound già in coda** — purge dei job `Mail` ancora schedulati su quella academy. Comando: `php artisan queue:flush` filtrato per payload (TODO: scriver helper `php artisan academy:purge-queued-mail` al primo caso).
4. **Log applicativi** — i log Laravel ruotano automaticamente a 12 mesi (dichiarazione privacy policy § 4). Non si tocca: la rotazione fisiologica è la garanzia.
5. **Sub-processor** — Budojo non delega mai il dato grezzo a sub-processor che lo conservino fuori dalla droplet UE. Cloudflare ha solo cache effimero; DigitalOcean ospita la VM (la VM stessa è il dato — non c'è una copia separata da invalidare); Forge accede via SSH ma non conserva una copia. **Nessuna azione richiesta sui sub-processor.**
6. **Update `academy_offboardings.t_purge_executed_at = NOW()`** + nota libera `purge_notes` con eventuali deviazioni dalla checklist.

**Conferma al cliente** (se residuo contattabile): email di conferma "I dati della tua academy sono stati cancellati il `<data>`. Una copia dell'export resta nei tuoi archivi. Grazie per aver usato Budojo."

---

## Eccezioni

| Caso                                                                                                                | Azione                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Obbligo legale di conservazione** (es. dati di fatturazione 10 anni ex art. 2220 c.c.)                            | Non si purgano. Si separano: i dati identificativi del Titolare (P.IVA, denominazione, indirizzo) restano in una tabella `legal_retention_archive` con TTL 10 anni; tutto il resto procede normalmente. I dati degli atleti NON rientrano mai nell'obbligo dei 10 anni e si purgano sempre.       |
| **Richiesta di un atleta singolo (non dell'academy)** sotto art. 17 GDPR                                            | È coperta da `/me/deletion-request` (#223), NON da questo runbook. Questo runbook è per offboarding dell'academy.                                                                                                                                                                                |
| **Richiesta del Garante** o di un'autorità giudiziaria di conservare i dati                                         | Sospende il purge per il tempo strettamente necessario all'adempimento dell'ordine. Comunicazione obbligatoria al Cliente, eccetto quando l'ordine vincola il Responsabile alla riservatezza.                                                                                                       |
| **L'academy chiede di mantenere il proprio account inattivo invece di chiudere**                                    | Acconsentito una sola volta, max 6 mesi, soggetto al pagamento di una fee di maintenance (TODO: definire). Dopo i 6 mesi il flusso standard parte automatico.                                                                                                                                      |

---

## Documentazione collateral richiesta da questo runbook

- **`academy_offboardings` table** (migration + model + factory).
- **`users.disabled_at` column** (migration + model cast + middleware check al login).
- **`php artisan academy:export <id>`** (Action + comando wrapper).
- **`php artisan academy:purge <id>`** (Action + comando wrapper, con prompt di conferma a doppia digitazione).
- **`php artisan academy:purge-queued-mail <id>`** (helper).
- **Outbox log table** (eventi email, almeno per gli offboarding flows).

Ognuno è un follow-up specifico — questo runbook IS la spec funzionale per l'implementazione, e va aggiornato man mano che ciascuno dei pezzi sopra arriva in produzione.

---

## Riferimenti

- DPA template § 12 — Restituzione e cancellazione dei dati a fine contratto (`docs/legal/dpa-template.md`)
- DPIA-lite § 4 — Retention (`docs/legal/dpia-medical-certificates.md`)
- Privacy policy § 4 — Periodo di conservazione (`docs/legal/privacy-policy.md`)
- Production deployment runbook (`docs/infra/production-deployment.md`)
- GDPR Artt. 5 §1 lett. (e) (limitazione della conservazione), 17 (cancellazione), 28 (responsabili).
