# Certificati medici e documenti legali — le decisioni che restano (#227, #1255)

> Non sono un avvocato e questo non è un parere legale. Sono i fatti tecnici, verificati nel codice,
> messi accanto alle domande che restano aperte — così se poi vuoi farlo vedere a un legale, gli dai
> qualcosa di preciso invece di un'app da esplorare.

Versione: 2026-09-11 · Per: #227 (decisione A/B sui certificati) e #1255 (revisione dei doc legali)

> Stato: **in attesa delle risposte al § 4.** Finché non arrivano, il software resta com'è
> e i documenti in `docs/legal/` restano quelli scritti per lo stack ospitato.

---

## 1. La premessa di entrambe le issue non esiste più

#227 è di maggio, #1255 di giugno. Le due analisi partono da Budojo come **SaaS ospitato**: Budojo
riceve i dati, Budojo è responsabile del trattamento, Budojo firma un DPA con la palestra, Budojo ha
sub-processor da dichiarare.

Quella cosa è stata spenta a #1230. Oggi Budojo è un'app desktop locale (M11, #1218).

**Cosa ho verificato nel codice, non dedotto:**

| | |
|---|---|
| `config/budojo.php` | `'desktop' => []` — il profilo desktop ha **zero capability**. Niente email, niente community, niente account atleta, niente web push |
| `grep` su tutto `server/app` | **nessuna chiamata HTTP in uscita**. Non `Http::post`, non `file_get_contents('http…')` |
| `composer.json` | nessun Sentry, nessun servizio di crash reporting. I `report($e)` nel codice finiscono nel file di log locale |
| `desktop/electron-builder.yml` | l'unica connessione in uscita è l'updater che chiede a GitHub Releases se c'è una versione nuova. Non manda nulla |
| #1301 (backup su Drive) | **bloccata**, non spedita. Oggi il backup è un file che scrivi tu dove vuoi |

Quindi: i dati degli atleti — certificati medici compresi — **non lasciano il computer della palestra**.
Non li vedo io, non li vede un hosting, non c'è una catena di sub-processor perché non c'è una catena.

---

## 2. Cosa cambia per #227 (tenere i PDF o no)

La DPIA-lite in `docs/legal/dpia-medical-certificates.md` § 7 mette Opzione A (tenere i PDF) contro
Opzione B (solo `valido sì/no + scadenza`), e raccomanda **B fino a traction**.

Quella raccomandazione era giusta per il mondo in cui è stata scritta. I costi che la sostenevano
sono quasi tutti costi **miei**, da fornitore che processa dati sanitari:

| Costo che rendeva A cara | Vale ancora? |
|---|---|
| €2-4k/anno di DPO esterno | **No.** La soglia "larga scala" si contava sul *cumulato di N clienti* nel mio database. Non ho un database |
| DPIA piena ogni 12-18 mesi | **No**, per lo stesso motivo. L'obbligo dell'art. 35 è del titolare, e il titolare è la palestra |
| Notifica al Garante in caso di breach | **Non mia.** Se il PC della palestra viene compromesso, è la palestra a doverlo valutare — esattamente come per la cartella dove teneva i PDF prima |
| Encryption at-rest da implementare | **Già fatta**, a #224. AES-256-GCM, chiave separata da `APP_KEY`. Costo residuo: zero |
| Audit log immutabile | **Già c'è** (`app/Observers/Audit/`) |

E il vantaggio principale di B — **togliere Budojo dal perimetro dell'art. 9** — è già ottenuto
dall'architettura, non dalla rimozione della feature. Budojo non è nel perimetro perché non riceve
niente.

Resta un fatto che nessuna delle due issue nomina: **la palestra quei certificati li tiene comunque**,
per obbligo suo (CONI/FGI glieli chiedono). L'Opzione B non fa sparire i PDF dal mondo. Li sposta in
una cartella Drive non cifrata, senza audit log e senza scadenzario — cioè **peggio** di dove stanno
adesso.

**La mia lettura:** sotto local-only, A non è più la scelta costosa. B lo è diventata, in termini di
danno per la palestra.

---

## 3. Cosa resta da sistemare in #1255

I documenti in `docs/legal/` descrivono un servizio che non esiste. In ordine di quanto sono sbagliati:

**`sub-processors.md`** — elenca DigitalOcean, Cloudflare, Forge. Nessuno di questi tocca più niente.
Il documento non è impreciso, è **vuoto di oggetto**.

**`dpa-template.md`** — un DPA è il contratto fra titolare e responsabile. Non essendoci più un
responsabile, non c'è più un contratto da firmare.

**`privacy-policy.md`** § 1 dice, testualmente, che «Budojo opera come responsabile del trattamento
(processor), secondo i termini del DPA». Oggi è **falso**, e una privacy policy falsa è peggio di una
assente.

**`account-deletion.md`**, **`cookie-audit.md`** — da rileggere ma probabilmente in gran parte validi
(la versione web esiste ancora come codice, anche se non è deployata da nessuna parte).

---

## 4. Le domande

### D1 — Certificati medici: A o B?

- **A — restano dentro Budojo** (com'è oggi): cifrati, con audit log e scadenzario. Non tocco niente,
  aggiorno la DPIA per dire che il perimetro è della palestra e perché.
- **B — solo `valido sì/no + scadenza`**: rimuovo l'upload, i PDF li tiene la palestra altrove.
  ~30h di lavoro, e la palestra perde cifratura e scadenzario sul file vero.

*Se non rispondi, il default è A — perché è ciò che il software fa già, e cambiarlo è il lavoro.*

### D2 — I documenti legali: riscrivere o archiviare?

- **Riscrivere per il locale**: una privacy policy breve e vera («i dati stanno sul tuo computer,
  Budojo non li riceve»), `sub-processors.md` e `dpa-template.md` spostati in `docs/archive/` con una
  riga che dice perché.
- **Archiviare e basta**: banner "non applicabile" su tutti, nessun testo nuovo. Più veloce, ma
  l'app resta senza una privacy policy — e ne serve una comunque, perché *la palestra* deve darne una
  ai propri atleti.
- **Non toccare niente ora.**

### D3 — Vuoi una revisione legale vera?

Serve solo se decidi di **vendere** Budojo a terzi. Finché lo usi tu, il titolare sei tu e stai
documentando a te stesso. Se invece lo vendi, il punto su cui un legale serve davvero non è la
privacy policy: è cosa prometti nei **Termini di servizio** su backup e perdita dati.

### D4 — E la #1301 (backup su Drive)?

È bloccata, ma quando la sblocchi **cambia tutto quello che c'è scritto sopra**: nel momento in cui i
certificati medici finiscono su Drive, ricompare una catena di trattamento e Google ci entra dentro.

- **Escludere i documenti dal backup cloud** (backup solo del database, i PDF restano locali).
- **Includerli, cifrati** — sono già cifrati a riposo, il blob su Drive sarebbe illeggibile senza la
  chiave locale. Ma va scritto da qualche parte, e la chiave va gestita.
- **Decidere quando ci arrivo.**

---

## 5. Cosa faccio con le risposte

| Risposta | Lavoro |
|---|---|
| D1 = A | Aggiorno `dpia-medical-certificates.md` con l'analisi local-only e chiudo #227 con la decisione scritta |
| D1 = B | Issue di rimozione upload + migrazione dei file esistenti. #227 resta aperta fino a quello |
| D2 = riscrivere | PR: privacy policy nuova (breve), archivio per DPA e sub-processors, banner sui restanti. Chiude #1255 |
| D2 = archiviare | PR solo di banner. #1255 chiusa con nota |
| D4 | Commento su #1301 con il vincolo, così non me lo dimentico quando la riapro |
