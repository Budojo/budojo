# Cookie & local-storage audit (#221, #421, #1255)

**Esito audit (al 2026-11-09):** _Le app per Windows e per Android non impostano cookie e non usano strumenti di tracciamento. Tengono nella propria memoria alcuni valori tecnici, tutti strettamente necessari al funzionamento o legati a una scelta dell'utente, e quindi esenti dal banner ai sensi dell'art. 5.3 della Direttiva ePrivacy._ Il banner di consenso (#421) è montato solo sul profilo `web` (#1508, #1520), che non è distribuito da nessuna parte dal #1230.

Data audit: 2026-04-29 · ultima revisione: 2026-11-09 (#1255 — l'app locale, PC e telefono)

Le pagine pubbliche `/cookie-policy` (EN) e `/cookie-policy/it` (IT) rispecchiano la tabella del § 2 per un pubblico non tecnico. Lock-step: ogni modifica alla tabella si riflette nelle due pagine HTML nello stesso PR.

## 1. Cookie HTTP

| Cookie | Origine | Finalità | Esente banner? |
| --- | --- | --- | --- |
| _Nessuno_ | — | — | — |

La SPA **non legge e non scrive cookie HTTP**. Sul desktop il token di accesso lo tiene il processo principale, cifrato con il portachiavi del sistema operativo (`auth-token.bin`, [`docs/desktop/architecture.md`](../desktop/architecture.md)); sul telefono sta in `localStorage` (§ 2). Il server locale risponde all'API senza sessione: la route `/storage/{path}` che serve le immagini non passa dal middleware `web`. Verifica:

```bash
grep -rn "document\.cookie" client/src      # → 0 risultati
```

## 2. localStorage e sessionStorage — l'app locale

| Chiave | Dove | Valori | Finalità | Dispositivo | Esente banner? |
| --- | --- | --- | --- | --- | --- |
| `budojoLang` | localStorage | `'en'` \| `'it'` | Lingua selezionata (#273) | PC e telefono | **Sì** — preferenza scelta dall'utente |
| `budojoTheme` | localStorage | `'system'` \| `'light'` \| `'dark'` | Tema selezionato | PC e telefono | **Sì** — preferenza scelta dall'utente |
| `budojoSyncLedger` | localStorage | JSON: versione di base, ultime voci inviate, per dispositivo/cartella/epoca | Dati di servizio della sincronizzazione (#2046). Solo con la sincronizzazione attiva | PC e telefono | **Sì** — strettamente necessario alla sincronizzazione chiesta dall'utente |
| `budojoSyncNamed` | localStorage | JSON: per ogni versione tenuta, gli hash SHA-256 dei file che usa | Dati di servizio della sincronizzazione (#2118). Solo con la sincronizzazione attiva | PC e telefono | **Sì** — come sopra |
| `documents.showCancelled` | localStorage | `'1'` o assente | Se l'elenco documenti di un atleta mostra i documenti cancellati | PC e telefono | **Sì** — preferenza scelta dall'utente |
| `auth_token` | localStorage | stringa Sanctum opaca | Token di accesso, nella memoria privata dell'app | Telefono | **Sì** — strettamente necessario a restare autenticati |
| `budojoRestoredBackup` | localStorage | nome del file di backup | Il backup da cui il telefono è stato ripristinato, così un nuovo accesso entra subito (#2079) | Telefono | **Sì** — strettamente necessario |
| `budojo.reminders.told` | localStorage | JSON delle chiavi dei promemoria già mostrati | Perché nessun promemoria compaia due volte (#2047) | Telefono | **Sì** — strettamente necessario |
| `budojo-stale-chunk-reload-attempted` | sessionStorage | `'1'` o assente | Impostato solo se l'app deve ricaricarsi dopo un aggiornamento, perché non lo faccia all'infinito; rimosso dopo 30 secondi di funzionamento normale | PC e telefono | **Sì** — strettamente necessario |

Nessuno di questi valori esce dal dispositivo. Sul PC stanno nel profilo di Electron sotto `%APPDATA%\Budojo\`; sul telefono nella memoria privata dell'app, esclusa dal backup di Android.

Riferimenti codice:
- [`client/src/app/core/services/language.service.ts`](../../client/src/app/core/services/language.service.ts) — `STORAGE_KEY = 'budojoLang'`
- [`client/src/app/core/services/theme.service.ts`](../../client/src/app/core/services/theme.service.ts) — `STORAGE_KEY = 'budojoTheme'`
- [`client/src/app/core/sync/ledger-store.ts`](../../client/src/app/core/sync/ledger-store.ts) — `KEY = 'budojoSyncLedger'`
- [`client/src/app/core/sync/named-store.ts`](../../client/src/app/core/sync/named-store.ts) — `KEY = 'budojoSyncNamed'`
- [`client/src/app/features/athletes/detail/documents-list/documents-list.component.ts`](../../client/src/app/features/athletes/detail/documents-list/documents-list.component.ts) — `TOGGLE_STORAGE_KEY = 'documents.showCancelled'`
- [`client/src/app/core/services/token-storage.service.ts`](../../client/src/app/core/services/token-storage.service.ts) — `KEY = 'auth_token'`, usato solo dove manca il ponte del desktop
- [`client/src/app/features/door/door.component.ts`](../../client/src/app/features/door/door.component.ts) — `RESTORED_KEY = 'budojoRestoredBackup'`
- [`client/src/app/core/mobile/phone-reminders.service.ts`](../../client/src/app/core/mobile/phone-reminders.service.ts) — `LEDGER_KEY = 'budojo.reminders.told'`
- [`client/src/app/shared/utils/stale-chunk-recovery.ts`](../../client/src/app/shared/utils/stale-chunk-recovery.ts) — `RELOAD_FLAG_KEY`

## 3. IndexedDB, WebSQL, service worker

Nessun utilizzo. Le build `desktop` e `mobile` hanno `"serviceWorker": false` (`client/angular.json`). Verifica:

```bash
grep -rn "indexedDB" client/src   # → 0 risultati
```

## 4. Tracker e analytics di terze parti

| Strumento | Presente? | Note |
| --- | --- | --- |
| Google Analytics / GA4 / `gtag` | No | Non installato |
| Google Tag Manager | No | Non installato |
| Meta / Facebook Pixel (`fbq`) | No | Non installato |
| Hotjar / Microsoft Clarity | No | Non installato |
| Segment / Amplitude / Mixpanel | No | Non installato |
| Sentry / error tracking / crash reporting | No | Non installato né in `client/`, né in `desktop/`, né in `mobile/`, né in `server/` |

Le terze parti che l'app contatta (Google se collegato, GitHub per gli aggiornamenti, i link aperti dal titolare) sono in [`sub-processors.md`](./sub-processors.md). I link si aprono nel browser o nell'app del dispositivo: i loro cookie stanno lì.

## 5. Il profilo `web` (non distribuito)

Il codice del profilo `web` esiste ancora e aggiunge, rispetto al § 2:

- `auth_token` in `localStorage` anche fuori dal telefono;
- `budojoCookieConsent` — la scelta sul banner di consenso (#421), JSON `{ version, choices, savedAt }`, con `CONSENT_VERSION` che forza un nuovo consenso al cambio;
- `budojo_notif_prompt_decided_v1` — la scelta sul prompt delle notifiche push del browser (#745);
- la cache del service worker (`ngsw-worker.js`, solo app shell e asset statici).

Il banner (`app.html`) e la sezione «In a browser» / «Nel browser» delle pagine cookie, col pulsante che lo riapre, compaiono solo su quel profilo. `ConsentService.hasConsent('analytics' | 'marketing')` resta il punto da cui passare per qualsiasi script facoltativo futuro.

## 6. Re-audit obbligatorio quando

- si aggiunge **qualunque** strumento di analytics, error tracking, A/B testing, marketing pixel, recaptcha, embed video / iframe esterno;
- l'app inizia a contattare un nuovo servizio (vedi [`sub-processors.md`](./sub-processors.md));
- si aggiunge una nuova chiave localStorage / sessionStorage / IndexedDB;
- si distribuisce di nuovo il profilo `web`.

## Riferimenti normativi

- Direttiva 2002/58/CE (ePrivacy) art. 5.3 — esenzione consenso per archiviazione "strettamente necessaria"
- GDPR art. 7 — caratteristiche del consenso (sarebbe richiesto solo se introducessimo tracker non-tecnici)
- Garante Privacy — _Linee guida cookie e altri strumenti di tracciamento_, 10 giugno 2021
