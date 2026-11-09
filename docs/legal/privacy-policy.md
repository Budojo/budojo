# Informativa sulla Privacy (#219, #1255)

> **STATO: BOZZA TECNICA — NON RIVISTA DA UN LEGALE.**
> Nessun legale ha ancora rivisto questo testo (`decisioni-aperte.md` D3). I fatti tecnici sotto (chi è titolare dei dati, dove sono conservati, cosa esce dal dispositivo, quali terze parti l'app contatta) corrispondono a quello che l'app fa oggi. Una revisione legale potrà cambiarne la formulazione, non i fatti tecnici (che richiederebbero una modifica del software prima di un cambio del documento).

Versione: 0.2 (bozza) · Ultima modifica: 2026-11-09

Sorgente citabile delle pagine `/privacy` (EN) e `/privacy/it` (IT): le tre vanno modificate insieme, nello stesso PR.

---

## 1. Chi è titolare dei dati

Ogni palestra che usa Budojo è **titolare del trattamento** dei propri dati e dei dati dei propri atleti. Decide cosa registrare, perché, su quale base giuridica e per quanto tempo, e dà ai propri atleti la propria informativa.

Budojo è un software che gira sui dispositivi della palestra. **Budojo e il suo autore non ricevono nessuno di quei dati e non ne sono responsabili del trattamento** (decisione del titolare del progetto, 9 novembre 2026, #1255). Questa pagina descrive cosa fa il software con i dati su quei dispositivi, così che la palestra possa descriverlo a sua volta.

Domande sul software: privacy@budojo.it.

## 2. Dove stanno i dati

- **Sul PC** — un'app Windows (Electron, PHP incluso, SQLite). Tutto quello che salva sta in `%APPDATA%\Budojo\` su quel computer: il database, i documenti, i backup e i log ([`docs/desktop/architecture.md`](../desktop/architecture.md) § Data layout).
- **Sul telefono** — un'app Android. I suoi dati stanno nella memoria privata dell'app, esclusi dal backup cloud di Android e dal trasferimento su un telefono nuovo (`mobile/android/app/src/main/res/xml/data_extraction_rules.xml`).
- **Budojo non gestisce nessun server.** La versione ospitata è stata spenta in #1230.

Cosa salva l'app, come la palestra lo inserisce:

| Categoria | Esempi |
|---|---|
| **Profilo del titolare** | Nome, email, foto |
| **Palestra** | Nome, indirizzo, recapiti, logo, orari, quote |
| **Atleti** | Nome, recapiti, data e luogo di nascita, codice fiscale, sesso come sul documento, indirizzo, foto, cintura e stato |
| **Attività** | Presenze, pagamenti, promozioni di cintura, note delle lezioni |
| **Documenti** | Certificati medici, documenti d'identità, assicurazioni e altri file. I certificati medici sono dati relativi alla salute (art. 9 GDPR) |

## 3. Cosa esce dal dispositivo

- **A Budojo non arriva niente.** L'app non invia telemetria, statistiche d'uso né segnalazioni di crash; nessuna di queste dipendenze è installata (verificato con grep su `client/`, `desktop/`, `server/`, `mobile/`). I log restano sul dispositivo.
- **Niente email e niente push.** Il desktop non invia email (`MAIL_MAILER=log`, `desktop/src/php-runtime.ts`); i promemoria del telefono sono notifiche locali (`@capacitor/local-notifications`). I profili `desktop` e `mobile` abilitano solo `document_upload`/`sync` e `sync` (`server/config/budojo.php`): community, account atleta, web push, email e controllo password violate sono solo web, e non vengono distribuiti.
- **Google, solo se la palestra collega il proprio account Google** — per la copia dei backup e la sincronizzazione fra PC e telefono (§ 4).
- **Una cartella dei backup, solo se il titolare ne sceglie una** (#1320) — il PC ci copia ogni backup: una chiavetta USB, un disco di rete, o una cartella sincronizzata da un servizio cloud. Quel servizio è una scelta della palestra.
- **GitHub, per gli aggiornamenti** — il PC controlla GitHub Releases con electron-updater (`desktop/electron-builder.yml`, provider `github`, `Budojo/budojo`) e scarica da lì; il telefono interroga `api.github.com/repos/Budojo/budojo/releases` per l'avviso di aggiornamento (`client/src/app/core/mobile/app-update.ts`). GitHub vede l'indirizzo IP e lo user agent del dispositivo; nessun dato della palestra viene inviato.
- **I link che il titolare apre** — il link al video di una tecnica o un pulsante WhatsApp si apre nel browser o nell'app del dispositivo, solo al clic (`shell.openExternal` sul desktop). L'app non scarica niente da quei siti.

Chi è ciascuno e cosa vede: [`sub-processors.md`](./sub-processors.md).

## 4. Google Drive: backup e sincronizzazione

Sono entrambi facoltativi e usano l'account Google della palestra, secondo l'accordo fra la palestra e Google. Il trattamento di Google, e dove avviene, ricadono in quell'accordo.

- **Backup** (#1301). Ogni backup del PC (ogni 6 ore mentre l'app è aperta) viene caricato in una cartella `Budojo` di quel Drive, con lo scope `drive.file`: l'app vede solo i file che ha creato. Un archivio contiene il database, in gran parte in chiaro, e i documenti, che restano cifrati ([`docs/desktop/backup-restore.md`](../desktop/backup-restore.md)).
- **Sincronizzazione fra PC e telefono** (M12). I due dispositivi si scambiano i dati attraverso lo stesso Drive. Ogni file è sigillato con AES-256-GCM sotto la chiave di sincronizzazione della palestra ([`docs/sync/protocol.md`](../sync/protocol.md)).
- **Le chiavi.** La chiave di sincronizzazione e le chiavi che aprono i documenti stanno nei dati nascosti dell'applicazione nell'account Google (scope `drive.appdata`), così il telefono apre la palestra dopo l'accesso con Google.

**Chi controlla quell'account Google può leggere i dati della palestra:** il database nei backup è in gran parte in chiaro, e una volta collegato il telefono le chiavi lì accanto aprono tutto il resto, certificati medici compresi ([`docs/specs/m12-mat-app.md`](../specs/m12-mat-app.md) § 5.4). Tieni attiva la verifica in due passaggi di Google.

## 5. Misure di sicurezza

- I documenti, certificati medici compresi, sono cifrati a riposo con la chiave dei documenti della palestra (`DOCUMENT_ENCRYPTION_KEY`).
- Sul PC, le chiavi (`secrets.bin`), il token di accesso (`auth-token.bin`) e il token di aggiornamento di Google (`drive-token.bin`) sono cifrati con il portachiavi di Windows (DPAPI), legato all'account utente di Windows. Il database invece è in gran parte in chiaro: a proteggerlo è l'accesso a quell'account di Windows.
- Sul telefono, le chiavi sono sigillate dall'Android Keystore (#2134, #2163), e l'app chiede l'impronta quando si apre. I promemoria mostrano il testo intero sulla schermata di blocco, nomi e importi compresi (PRD M12 § 6.3).
- Gli archivi di backup non contengono chiavi. Per aprire i documenti su un computer nuovo serve il codice di recupero (#1254).

## 6. Periodo di conservazione

| Dato | Durata |
|---|---|
| Dati della palestra e degli atleti | Li decide la palestra, che li cancella dall'app |
| Certificati medici scaduti | Cancellati in automatico sul PC 24 mesi dopo la scadenza (`budojo:purge-expired-medical-certificates`, #537) |
| Atleta rimosso | Tolto dall'elenco, documenti cancellati; scheda e storico restano (soft delete, [`docs/entities/athlete.md`](../entities/athlete.md)) |
| Backup | Circa due settimane: i sei più recenti, poi l'ultimo di ciascuno dei 14 giorni più recenti in cui l'app è stata aperta; la stessa regola nella cartella dei backup e su Drive (#1330). Quello che si cancella nell'app resta nei backup più vecchi finché non ruotano via. Fa eccezione `Budojo/sync/` su Drive: tiene la prima versione della palestra, una copia completa con i documenti, finché il titolare non cancella la cartella (`retention.ts` non elimina mai una versione senza genitore) |
| Dopo la disinstallazione | I dati restano: disinstallare non tocca `%APPDATA%\Budojo\`. Come rimuoverli: [`account-deletion.md`](./account-deletion.md) |

## 7. Cookie e dati salvati sul dispositivo

Budojo **non imposta cookie** e non fa tracciamento né profilazione. L'app tiene alcuni valori tecnici nella propria memoria sul dispositivo: la lingua, il tema, i dati di servizio della sincronizzazione e una preferenza di visualizzazione; sul telefono, anche il token di accesso. L'inventario completo è in [`cookie-audit.md`](./cookie-audit.md).

## 8. Diritti dell'interessato

Gli atleti esercitano i loro diritti GDPR (articoli 15–22) **presso la palestra**, che è il titolare. Budojo non ha nessuno dei loro dati e non può rispondere al posto della palestra.

L'app aiuta la palestra a rispondere: mostra e corregge la scheda di un atleta, rimuove un atleta, e sul PC esporta i dati della palestra con i documenti in un file ZIP («Impostazioni → Account → Scarica i miei dati», `GET /api/v1/me/export?format=zip`).

## 9. Reclamo all'autorità di controllo

Chiunque può proporre reclamo all'autorità di controllo competente: per l'Italia il **Garante per la protezione dei dati personali**, via [garanteprivacy.it](https://www.garanteprivacy.it).

## 10. Modifiche a questa pagina

Questa pagina è parte dell'app: una modifica arriva con un aggiornamento, e il numero di versione e la data in cima cambiano con lei.

## 11. Riferimenti

- [Sub-processor](./sub-processors.md) (#225, #1255)
- [Cookie audit](./cookie-audit.md) (#221)
- [Cancellazione](./account-deletion.md) (#688)
- [DPIA-lite certificati medici](./dpia-medical-certificates.md) — bozza tecnica, da rivedere in #227
- [Le decisioni aperte](./decisioni-aperte.md) — #227, #1255
