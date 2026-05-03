# Cookie & local-storage audit (#221)

**Esito audit:** _Non serve cookie banner._ Tutti gli artefatti di archiviazione lato client sono **strettamente tecnici** ai sensi dell'art. 5.3 della Direttiva ePrivacy (e delle linee guida del Garante per la protezione dei dati personali del 10 giugno 2021).

Data audit: 2026-04-29 · ultima revisione: 2026-04-29

## 1. Cookie HTTP

| Cookie | Origine | Finalità | Esente banner? |
| --- | --- | --- | --- |
| _Nessuno_ | — | — | — |

La SPA Angular **non legge e non scrive cookie HTTP**. L'autenticazione usa Sanctum **Bearer token** in header `Authorization`, non cookie di sessione. Verifica:

```bash
grep -rn "document\.cookie" client/src      # → 0 risultati
```

## 2. localStorage

| Chiave | Valori | Finalità | Durata | Esente banner? |
| --- | --- | --- | --- | --- |
| `auth_token` | stringa Sanctum opaca | Persiste il token Bearer fra reload così l'utente non deve riautenticarsi a ogni F5 | Finché l'utente non fa logout o non revoca il token | **Sì** — strettamente necessario per fornire il servizio richiesto (l'utente ha esplicitamente chiesto di "essere autenticato") |
| `documents.showCancelled` | `'1'` o assente | Ricorda se l'utente vuole vedere i documenti cancellati nella lista per atleta | Finché l'utente non ridisattiva il toggle (la chiave viene rimossa), oppure finché non svuota i dati del sito dal browser | **Sì** — preferenza UI, non identifica e non profila l'utente |

Riferimenti codice:
- [`client/src/app/core/services/auth.service.ts`](../../client/src/app/core/services/auth.service.ts) — `TOKEN_KEY = 'auth_token'`
- [`client/src/app/features/athletes/detail/documents-list/documents-list.component.ts`](../../client/src/app/features/athletes/detail/documents-list/documents-list.component.ts) — `TOGGLE_STORAGE_KEY = 'documents.showCancelled'`

## 3. sessionStorage / IndexedDB / WebSQL

Nessun utilizzo. Verifica:

```bash
grep -rn "sessionStorage\|indexedDB" client/src   # → 0 risultati
```

## 4. Tracker e analytics di terze parti

| Strumento | Presente? | Note |
| --- | --- | --- |
| Google Analytics / GA4 / `gtag` | ❌ | Non installato |
| Google Tag Manager | ❌ | Non installato |
| Meta / Facebook Pixel (`fbq`) | ❌ | Non installato |
| Hotjar / Microsoft Clarity | ❌ | Non installato |
| Segment / Amplitude / Mixpanel | ❌ | Non installato |
| Sentry / error tracking | ❌ | Non installato (futuro: vedi #225 sub-processor list) |

Verifica via grep su `client/src` e `client/package.json`: nessuna corrispondenza.

## 5. Service worker (PWA)

Il `ngsw-worker.js` (Angular Service Worker, configurato in `client/ngsw-config.json`) effettua **caching tecnico** dell'app shell (`/index.html`, JS/CSS bundle) e degli asset statici (favicon, icone, immagini, font). Allo stato corrente non sono configurati `dataGroups` per `/api/v1/**` — le chiamate API non sono cached né servite offline. È archiviazione **necessaria al funzionamento dell'app installata** (PWA), esente sotto la stessa logica del token di autenticazione. Se in futuro si introduce caching API, va rivisto qui (e basta — sono ancora dati tecnici dell'utente, non profilazione).

## 6. Conclusione operativa

- **Banner cookie**: **non necessario**. Tutto ciò che la SPA scrive lato client serve a erogare la funzione richiesta dall'utente.
- **Privacy policy**: deve comunque contenere una sezione "Cookie e archiviazione locale" che dichiara cosa salviamo, perché, e per quanto. Il testo entra nell'informativa privacy gestita in [#219](https://github.com/Budojo/budojo/issues/219).
- **Re-audit obbligatorio quando**:
  - Si aggiunge **qualunque** strumento di analytics, error tracking, A/B testing, marketing pixel, recaptcha, embed video / iframe esterno
  - Si introduce un sub-processor che setta cookie propri (es. integrazione Stripe Checkout, Google Maps embed, Calendly)
  - Si aggiunge una **terza** chiave localStorage / sessionStorage che non sia strettamente necessaria
- L'introduzione di uno qualsiasi degli strumenti sopra **richiede prima** l'implementazione di un banner di consenso conforme (opt-in attivo, granulare, revocabile, con blocco dei tracker fino al consenso).

## Suggerito snippet per la privacy policy (#219)

> **Cookie e archiviazione locale**
>
> Budojo non utilizza cookie HTTP, né cookie di profilazione propri o di terze parti. Per ricordare il tuo accesso e la tua preferenza sulla visualizzazione dei documenti cancellati, l'applicazione usa il `localStorage` del tuo browser con due chiavi: `auth_token` (token di sessione, rimosso al logout) e `documents.showCancelled` (preferenza interfaccia, rimossa quando ridisattivi il toggle). Questi dati restano sul tuo dispositivo e non vengono trasmessi a terzi. Puoi rimuoverli in qualsiasi momento dal logout, dalla disattivazione del toggle, oppure svuotando i dati del sito dalle impostazioni del browser. Non utilizziamo strumenti di analytics, tracking di terze parti o pixel di marketing.

## Riferimenti normativi

- Direttiva 2002/58/CE (ePrivacy) art. 5.3 — esenzione consenso per archiviazione "strettamente necessaria"
- GDPR art. 7 — caratteristiche del consenso (sarebbe richiesto solo se introducessimo tracker non-tecnici)
- Garante Privacy — _Linee guida cookie e altri strumenti di tracciamento_, 10 giugno 2021
