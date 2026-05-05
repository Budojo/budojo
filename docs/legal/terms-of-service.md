# Termini di Servizio (#420)

> **STATO: TESTO SEGNAPOSTO — IN ATTESA DI REVISIONE LEGALE.**
> Il presente documento è uno scheletro strutturale. I fatti tecnici qui sotto (descrizione del Servizio, titolarità dell'account, motivi di sospensione, foro competente) riflettono ciò che il sistema fa effettivamente in produzione, ma la formulazione esatta deve essere rivista e approvata da un legale prima che la pagina pubblica `/terms` (e la sua traduzione `/terms/it`) siano considerate giuridicamente vincolanti. Il flusso di registrazione registra comunque, da subito, il timestamp `users.terms_accepted_at` come record durevole del consenso espresso dall'utente al momento della spunta del checkbox.

Versione: 0.1 (segnaposto) · Ultima modifica: 2026-05-05

---

I presenti Termini regolano il rapporto fra **Budojo** ("il Servizio") e la persona fisica che crea e detiene un account ("l'Utente") — tipicamente il titolare di un'academy di arti marziali, l'istruttore capo o l'amministratore designato.

Tre artefatti, un solo dominio di contenuto. Le modifiche a UNO QUALSIASI di questi tre devono atterrare in lock-step nella stessa PR:

1. Questo file `docs/legal/terms-of-service.md` — sorgente canonico, leggibile da auditor.
2. `client/src/app/features/terms/terms.component.html` — rendering inglese su `/terms`.
3. `client/src/app/features/terms/it/terms-it.component.html` — rendering italiano su `/terms/it`.

## 1. Il Servizio

Budojo è un'applicazione web che consente a un'academy di arti marziali di gestire i propri atleti, le presenze, i pagamenti, i documenti e i dati operativi correlati. Il trattamento dei dati personali è disciplinato separatamente dall'[Informativa sulla Privacy](./privacy-policy.md).

## 2. Account e accettazione

La creazione di un account richiede l'accettazione esplicita dei presenti Termini tramite la casella "Accetto i Termini di Servizio" presente nel form di registrazione (`/auth/register`). Il backend Laravel applica la regola di validazione `accepted` sul campo `terms_accepted` del payload e, in caso di esito positivo, scrive `users.terms_accepted_at = now()` come record durevole del consenso. Il valore `null` su utenti precedenti all'introduzione del gate (#420) è atteso e gestito senza retroattività; l'eventuale ri-accettazione versionata è esplicitamente fuori scope.

L'Utente è responsabile delle credenziali del proprio account, delle azioni compiute tramite esso e dei dati che l'Academy carica (anagrafiche atleti, documenti, presenze, note di pagamento). L'Utente garantisce di possedere la base giuridica necessaria per caricare tali dati.

## 3. Uso accettabile

L'Utente si impegna a non:

- Utilizzare il Servizio per scopi non correlati alla gestione di un'academy di arti marziali o organizzazione di addestramento equiparabile.
- Caricare materiale illecito, diffamatorio, lesivo di diritti di terzi o contrario alla tutela dei minori.
- Tentare di accedere a dati di altre Academy, sondare il Servizio per vulnerabilità al di fuori di un canale di disclosure coordinato, o interferire con il funzionamento del Servizio.
- Rivendere, sublicenziare o ridistribuire l'accesso al Servizio a terzi senza preventiva autorizzazione scritta.

## 4. Sospensione e cessazione

Budojo può sospendere o chiudere un account che violi i presenti Termini, che mostri pattern di abuso, o per cui sia richiesta la sospensione da un'autorità competente con provvedimento legittimo. Ove possibile, l'Utente sarà avvisato via email e gli sarà concessa una finestra ragionevole per sanare la violazione.

L'Utente può chiudere il proprio account tramite il flusso "Elimina account" nella sezione Profilo, che attiva la finestra di grace di 30 giorni descritta nell'Informativa sulla Privacy. Trascorsa tale finestra, l'account è cancellato in modo irreversibile.

## 5. Disponibilità del servizio e modifiche

Il Servizio è erogato sulla base del miglior sforzo (best-effort), senza SLA contrattuale durante la fase MVP. Le finestre di manutenzione pianificata sono annunciate con preavviso laddove possibile. Le modifiche significative che impattino i dati o il workflow dell'Utente sono annunciate con almeno 30 giorni di preavviso tramite la pagina in-app "Novità" e, ove applicabile, via email.

## 6. Responsabilità

Il Servizio è erogato "così com'è". Nei limiti consentiti dalla legge applicabile, la responsabilità totale di Budojo è limitata ai corrispettivi pagati dall'Utente nei dodici mesi precedenti l'evento da cui è sorta la pretesa o, durante qualsiasi periodo in cui il Servizio sia offerto a titolo gratuito, ai danni diretti documentati strettamente attribuibili a colpa grave o dolo di Budojo. Sono esclusi danni indiretti o consequenziali, lucro cessante, perdita di opportunità di business e pretese di terzi che non derivino da inadempimento attribuibile a Budojo.

## 7. Legge applicabile e foro competente

I presenti Termini sono disciplinati dalla legge italiana. Per qualsiasi controversia è competente il foro della sede legale di Budojo, salvi i casi in cui la normativa imperativa a tutela del consumatore individui un foro diverso.

## 8. Modifiche ai Termini

Budojo può aggiornare i presenti Termini nel tempo. Le modifiche sostanziali sono annunciate con almeno 30 giorni di preavviso. La ri-accettazione versionata (richiedere a un Utente esistente di spuntare nuovamente la casella di accettazione quando i Termini cambiano) non è ancora implementata ed è esplicitamente fuori scope nella versione corrente.

## 9. Contatti

Domande o comunicazioni: legal@budojo.it _(da confermare in fase di revisione legale)_.
