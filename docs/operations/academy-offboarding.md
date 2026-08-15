# Academy offboarding runbook

> ⚠️ **OBSOLETO SULLA BUILD DESKTOP (M11, #1218).** Questa procedura descrive
> lo stack **multi-utente ospitato** (droplet DigitalOcean via SSH, sub-processor
> Cloudflare / Forge) dismesso in #1230. Sulla build desktop Budojo è un'app
> a singolo proprietario, con i dati sul PC dell'utente: non esistono "academy
> clienti" da offboardare, né accesso SSH, né sub-processor. Conservato come
> riferimento per l'era ospitata e per i documenti legali che lo citano
> (`docs/legal/`), che richiedono una revisione legale separata alla luce del
> passaggio a locale — vedi #1232.

> **STATO: BOZZA TECNICA — OPERATIVAMENTE FUNZIONALE.**
> Questo file è il puntatore concreto referenziato dal § 12 del DPA template (`docs/legal/dpa-template.md`) e dal § 4 (Retention) della DPIA-lite (`docs/legal/dpia-medical-certificates.md`). Descrive **la procedura manuale** che il personale Budojo segue quando un'academy cliente termina il contratto. La forma "manuale" è deliberata: il volume attuale (singole accademie, terminazioni rare e mai bulk) non giustifica un'automazione, e una procedura scritta è facile da rivedere all'occorrenza.

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

**Inviato a**: l'email del titolare dell'academy. Lo schema attuale ha la relazione 1:1 `academies.user_id` → `users.id`, quindi il contatto amministrativo è `Academy::find($id)->owner->email` (oggi non esiste un campo `email` sulla tabella `academies`, e fino a quando il pattern multi-utente di #427/#428 non sblocca più owner per academy, l'unico contatto è quello).

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

1. **Disattivare il login dell'owner.** L'unica colonna oggi disponibile come switch sicuro è la cancellazione manuale del `password` di `users` con un valore non-bcrypt-validabile (es. `'OFFBOARDING-DISABLED'`), che fa fallire ogni `Hash::check()` al login senza droppare la riga. Tentativi di login restituiscono 401. Soluzione di transizione: la regola adatta — un `users.disabled_at nullable` o `academies.disabled_at nullable` con middleware esplicito — è documentata nei TODO finali.

2. **Marcare l'academy come offboarding.** Per assenza, oggi, di una tabella `academy_offboardings`, il marker è un record in un foglio Google interno (id academy + nome + T0 + T+30 + reason). Manuale ma traceable. Quando il volume giustifica l'automazione, si crea la tabella e il marker diventa una riga DB. **Senza marker**: la coda email + i cron scheduler continuerebbero a partire sull'academy cessata.

3. **Sospendere i cron operativi per l'academy.** I principali sono `budojo:send-medical-cert-expiry-reminders` (M5 PR-D) e altri reminder scheduler. Oggi non c'è un filtro applicativo per saltare un'academy specifica. **Cosa NON fare**: soft-deletare gli atleti dell'academy "per silenziare i cron" — sembra una scorciatoia ma ha due effetti collaterali distruttivi: (a) `AthleteObserver::deleting()` invoca `DeleteDocumentAction`, che (i) **soft-deleta** la riga `documents` (la riga sopravvive in DB con `deleted_at` valorizzato, recuperabile solo via `withTrashed()`) e (ii) chiama `Storage::disk('local')->delete($file_path)` che invece **rimuove fisicamente il binario dal disco in maniera irreversibile** — incluso il binario del certificato medico, **prima** che il Cliente abbia avuto la grace export; (b) `ExportUserDataAction` (Step 3) fa `$user->load('academy.athletes…')` senza `withTrashed()`, quindi gli atleti soft-deleted **non entrano** nell'export consegnato al Cliente. Il combinato fa svanire il dato dal Cliente ed elimina il file in maniera irreversibile prima ancora che T+30 arrivi (la riga DB esiste ancora ma punta a un file che non c'è più). **Cosa fare oggi**: tollerare uno o due cicli di reminder in più durante la grace export — il cron emette al massimo una email-digest al giorno per academy, l'effetto pratico è una mail "i tuoi certificati scadono" inviata in finestra di offboarding (rumore lieve, nessuna perdita di dato). **Cosa fare quando il volume cresce**: il filtro `academies.disabled_at IS NULL` aggiunto al query path del cron è il fix definitivo — vedere § "Documentation collateral required" in fondo.

4. **Notifica al titolare amministrativo Budojo** (email interna): "L'academy `<id>:<nome>` è entrata in grace export. Purge programmato per T+30 (`<data>`). Verifica la coda email outbound per gli ultimi 30 giorni e considera se cancellare reminder già schedulati."

---

## Step 3 — T0 → T+30 — Grace export

**Stato**: dati congelati ma esportabili tramite richiesta scritta a `privacy@budojo.it`.

**Operazioni eseguite su richiesta**:

- **Export su richiesta**: il punto di ingresso canonico è l'`ExportUserDataAction` (rotta `GET /api/v1/me/export`, #222). Per un utente cessato, l'access token Sanctum non è più valido (Step 2 ha bloccato il login), quindi il personale Budojo accede via SSH alla droplet ed esegue manualmente l'Action sull'utente target — concretamente: `app(\App\Actions\User\ExportUserDataAction::class)->execute(User::find($id))` da `php artisan tinker`, o un comando wrapper `php artisan academy:export <user_id>` quando lo scriviamo (TODO finali). Output: ZIP firmato. Consegna **diretta via email allegata** se < 25 MB; altrimenti upload manuale su un canale già usato col cliente (la palestra in genere ha un proprio Drive). **Non** si introduce un nuovo sub-processor (es. object storage) per il solo caso offboarding — il sub-processor list è la lista del DPA, e ogni aggiunta richiede un preavviso di 30 giorni che fa più rumore della consegna stessa.
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

**Schema reale attuale (per onestà operativa)**: la catena di cascade DB è `users → academies (academies.user_id, FK cascade) → athletes (athletes.academy_id, FK cascade) → documents + attendance_records (entrambe FK athlete_id cascade)`. Significato pratico: cancellare l'`User` owner dell'academy, in DB, fa il 90 % del lavoro automaticamente. Ciò che il cascade DB **non** copre: il file binario su disco di ogni `Document` (la cascade tocca la riga, non `storage/app/private/documents/<file>`), i token Sanctum (`personal_access_tokens.tokenable_type/_id` è polimorfico, non c'è FK), i job email in coda. Quindi:

1. **Documenti su disco** — PRIMA del cascade DB: per ogni `Document` raggiungibile dall'academy (via join `documents.athlete_id → athletes.academy_id = X`), `Storage::disk('local')->delete($document->file_path)`. Equivalente runnable in tinker:
   ```php
   $academy = Academy::findOrFail($id);
   $academy->athletes->each(fn ($a) => $a->documents->each(
       fn ($d) => Storage::disk('local')->delete($d->file_path)
   ));
   ```
   Questo va FATTO PRIMA della cancellazione DB perché altrimenti si perdono i `file_path` necessari a sapere cosa eliminare. Quando il primo offboarding reale arriva, promuovere a `php artisan academy:purge <id>` con questa logica racchiusa nell'Action.

2. **Record DB** — `User::destroy($academy->owner->id)` innesca la catena: l'`academies` cascade-elimina, gli `athletes` cascade-eliminano, i loro `documents` + `attendance_records` cascade-eliminano. Altre tabelle correlate al solo user (es. `pending_deletions`, `password_reset_tokens` — nota: `password_reset_tokens` è chiavata su `email` non `user_id`, va eliminata separatamente con `DB::table('password_reset_tokens')->where('email', $email)->delete()`).

3. **Token Sanctum** — Sanctum usa `morphs('tokenable')` (`tokenable_type` + `tokenable_id`), NON una FK. Il cascade su `users` non li tocca. Cancellazione esplicita:
   ```php
   DB::table('personal_access_tokens')
       ->where('tokenable_type', User::class)
       ->where('tokenable_id', $userId)
       ->delete();
   ```
   Eseguire DOPO `User::destroy()` perché l'ID sopravvive nel binding fino al delete. Senza questo step, i token resterebbero orfani in DB — non danno accesso (il `tokenable` non risolve più), ma sono dati personali che non devono restare.

4. **Email outbound già in coda** — `php artisan queue:flush` cancella **l'intera coda**, non solo i job dell'academy: usarlo è sproporzionato al singolo offboarding. Realtà attuale: la coda è piccola, i reminder schedulati sono per i prossimi pochi giorni, e dopo il purge DB i reminder che provassero a colpire l'academy fallirebbero in `MailerJob` con un model-not-found e finirebbero in `failed_jobs`. **Cosa fare oggi**: lasciare scadere la coda; pulire `failed_jobs` dopo 7 giorni con `php artisan queue:prune-failed`. **Cosa fare quando il volume cresce**: scrivere un `php artisan academy:purge-queued-mail <id>` che ispeziona i job serializzati e droppa solo quelli legati all'academy specifica (TODO finali). Documentato come TODO per evitare che qualcuno usi `queue:flush` come scorciatoia.

5. **Log applicativi** — i log Laravel ruotano automaticamente a 12 mesi (dichiarazione privacy policy § 4). Non si tocca: la rotazione fisiologica è la garanzia.

6. **Sub-processor** — la lista canonica del DPA (Cloudflare, DigitalOcean, Laravel Forge) NON conserva copie indipendenti del dato applicativo: Cloudflare cachea solo asset statici della SPA, DigitalOcean ospita la VM (il dato È la VM, non c'è copia separata), Forge accede via SSH ma non conserva. **Nessuna azione richiesta sui sub-processor**, e non ne vengono introdotti di nuovi durante l'offboarding (es. NON si carica l'export su un object storage di terzi; vedere § Step 3 per il protocollo di consegna).

7. **Update del marker** — il foglio interno (cf. Step 2) registra `t_purge_executed_at = NOW()` + nota libera per eventuali deviazioni. Quando esiste la tabella `academy_offboardings`, lo stesso campo si scrive in DB.

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
- Production deployment runbook (archived, hosted stack decommissioned in #1230 — `docs/infra/archive/production-deployment.md`)
- GDPR Artt. 5 §1 lett. (e) (limitazione della conservazione), 17 (cancellazione), 28 (responsabili).
