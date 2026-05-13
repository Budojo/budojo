/**
 * Release-data source for the user-facing What's new page (#254).
 *
 * Originally embedded inline inside `whats-new.component.ts` — extracted
 * once the file passed the 1200-line mark and per-release diffs became
 * harder to read against the surrounding template / router glue. The
 * convention is unchanged: every `develop → main` release **prepends**
 * a new `Release` entry to the head of the array, in lock-step with
 * the matching `docs/changelog/user-facing/v{X.Y.Z}.md` markdown source.
 *
 * Trip-wires: the vitest version-pin spec + the cypress visible-on-
 * landing spec assert the newest-first ordering and the total card
 * count, so a release that forgets to update this file (or appends
 * instead of prepends) fails CI.
 */

export interface ChangelogSection {
  readonly heading: string;
  readonly bullets: readonly string[];
}

export interface Release {
  readonly version: string;
  readonly date: string;
  readonly headline: string;
  readonly sections: readonly ChangelogSection[];
}

export const RELEASES: readonly Release[] = [
  {
    version: 'v2.11.0',
    date: '2026-05-13',
    headline:
      "A mobile-first overhaul: six list-heavy pages (athletes, daily attendance, monthly summary, athlete documents, athlete payments, expiring documents) now render as Apple-minimalist cards below 768px instead of horizontally-scrolling tables — every card is a thumb-friendly tap target with the same data and the same actions as the desktop row, just rearranged so the operator on the mat doesn't have to side-swipe. The mobile sidebar drawer gained the standard Android gestures: swipe-left dismisses it, tap-outside-when-open no longer scrolls the page underneath, and the drawer no longer rubber-bands on a vertical drag. The two-factor and API-tokens dialogs on /dashboard/profile now carry [breakpoints]={ '768px': '92vw' } so they fit phone viewports correctly instead of the old maxWidth: 90vw workaround. For the TWA APK on the Play Store: splash background is now #0A0A0B (matches the icon's black square) instead of the previous white that put a jarring black square in the middle of a bright screen — requires a Bubblewrap rebuild + reinstall to see. Audit roadmap docs/design/mobile-ux-audit.md tracks 17/20 mobile gaps now flipped 🟢; the remaining 3 (filter bottom-sheet, offline fallback) are queued for v2.12.0.",
    sections: [
      {
        heading: '✨ Sei elenchi diventano card sul telefono',
        bullets: [
          'Sotto i 768px le tabelle che facevano scroll orizzontale ora sono cards. Stessa informazione, ma il pollice scorre verticale.',
          "Atleti (/dashboard/atleti) — card Apple-style: nome+età grandi, badge cintura + stato + pagato in una riga, menu 3-puntini per Modifica/Elimina. Tap sulla card → detail dell'atleta.",
          'Presenze giornaliere — un card per atleta, tap-toggle per marcare presente (stesso tasto del web, accessibile via tastiera).',
          'Riepilogo mensile — un card per atleta, conteggio + percentuale sulla destra.',
          "Documenti dell'atleta — tipo documento + scarica/elimina in testa, nome file in mezzo, badge scadenza in fondo.",
          "Pagamenti dell'atleta — un card per mese, badge Pagato/Non pagato + importo + data, tasto ✓/× per cambiare stato.",
          "Documenti in scadenza — nome atleta linkato (tap → tab documenti di quell'atleta) + tasto scarica, badge scadenza in fondo.",
          'Il layout desktop (sopra 768px) resta identico — solo il telefono cambia.',
        ],
      },
      {
        heading: '✨ Drawer laterale + gesture native',
        bullets: [
          "Swipe-left per chiudere — trascini il drawer aperto verso sinistra e si chiude (gesture standard Android, finalmente c'è anche qui).",
          'Niente più scroll della pagina sotto quando il drawer è aperto — iOS Safari + Chrome Android avevano questo bug di default.',
          'Drawer non rimbalza più — il "rubber-band" su/giù quando trascinavi dentro al drawer è risolto.',
        ],
      },
      {
        heading: '✨ Dialog del profilo — fit corretto su telefono',
        bullets: [
          'I dialog "Autenticazione a due fattori" e "Token API" su /dashboard/profile ora si dimensionano correttamente sotto i 768px (92% larghezza viewport invece di sforare).',
        ],
      },
      {
        heading: "🐛 Splash dell'app Android",
        bullets: [
          "Lo splash all'avvio dell'APK ora ha sfondo scuro #0A0A0B che matcha l'icona, invece del bianco di default che metteva un quadrato nero sospetto in mezzo a uno sfondo luminoso.",
          "Per vedere il fix devi reinstallare la nuova versione dell'APK — è solo un cambio di config TWA, niente codice.",
        ],
      },
      {
        heading: '📐 Roadmap mobile UX pubblicata',
        bullets: [
          'Nuovo doc docs/design/mobile-ux-audit.md traccia ogni gap mobile riga per riga.',
          'Cose in attesa per le prossime release: filtri (cintura/stato/pagato) in bottom-sheet, schermata offline custom invece del "Impossibile raggiungere il sito" di Chrome.',
        ],
      },
    ],
  },
  {
    version: 'v2.10.1',
    date: '2026-05-13',
    headline:
      "Same-day polish patch for two issues reported on the live feed right after v2.10.0 shipped. Promotions tab on /dashboard/athletes/{id} was rendering the raw i18n key (athletes.promotions.emptyBody) instead of the translated copy for any athlete with no recorded promotions yet — caused by the template referencing 'athletes.promotions.*' while the keys live under 'athletes.detail.promotions.*' in the translation files; ngx-translate's silent-key-fallback meant the bug shipped past every gate and only surfaced on the empty-state branch on prod. Fixed: empty + error states, 'First belt' label, 'stripes' suffix, and 'Recorded by {name}' line all render translated copy now. Reactions list polish: a middot separator between the 👏 and 🙏 counts in the summary pill so the counts read as distinct items, and the reactions sheet now dismisses naturally on tap-outside (the redundant X is gone; Esc still dismisses).",
    sections: [
      {
        heading: '🐛 Promotions tab: translated copy instead of the raw key',
        bullets: [
          "Opening an athlete's Promozioni tab on /dashboard/athletes/{id} showed the literal text 'athletes.promotions.emptyBody' for any athlete with no recorded promotions yet (i.e. anyone promoted before v2.10.0 shipped the history table).",
          "Cause: the template referenced 'athletes.promotions.*' but the keys live under 'athletes.detail.promotions.*' in the translation files — ngx-translate falls back to the raw key when the path doesn't resolve, so it shipped past every gate and surfaced on the empty-state branch only.",
          "Fixed: the empty state, error state, 'First belt' label, 'stripes' suffix, and 'Recorded by {name}' line now all render the EN / IT translated copy correctly.",
        ],
      },
      {
        heading: '✨ Reactions list — small polish',
        bullets: [
          "Middot separator between the 👏 and 🙏 counts in the summary pill ('👏 1 · 🙏 2') so the two counts read as distinct items, not one tight run-on.",
          'The reactions sheet now dismisses naturally on tap-outside (backdrop tap), and the now-redundant X button is gone. Esc still dismisses.',
        ],
      },
    ],
  },
  {
    version: 'v2.10.0',
    date: '2026-05-13',
    headline:
      "Two feature drops and one production fix, all driven by ideas sent back after v2.9.0 shipped. Reactions list: tap the count line under a post on the community feed and a sheet slides up listing every reactor with their name, handle, belt, and the emoji they picked (bottom-sheet on phones, centered dialog on desktop, tabs to filter just 👏 or just 🙏). Promotion history: every belt change AND every stripe change now records a dated row in the athlete's profile — open an athlete → Promotions tab and see the full ladder back to the first row, with who recorded each change. Stripe promotions also post to the community feed now (until now, only belt changes celebrated; stripe drops on a belt-up still don't celebrate because the belt-promotion post already covers it). Sidebar version on production now reads the actual release tag (e.g. 'v2.9.0') instead of 'Dev' — Cloudflare Pages' depth=1 clone was blinding git describe to the release tag, fixed by unshallowing in the build step.",
    sections: [
      {
        heading: '✨ Reactions list — see who reacted with what',
        bullets: [
          'When a post on the community feed has 👏 claps and 🙏 prays, the count next to each button tells you how many — but not who. Tap the count line under the post and a sheet slides up listing every reactor with their name, handle, and belt, plus the emoji they picked.',
          'Tabs at the top let you filter to just 👏 or just 🙏. On phones it lands as a bottom-sheet you can flick down to dismiss; on desktop it opens as a centered dialog.',
          "Reported by you as 'voglio vedere chi ha messo cosa come Facebook'.",
        ],
      },
      {
        heading: '✨ Promotion history per athlete',
        bullets: [
          "Every belt change AND every stripe change now records a dated row in the athlete's profile. Open an athlete → Promotions tab and you see the full ladder: 'White → Blue · 2025-09-14', 'Blue 0 → 1 stripes · 2026-02-03', 'Blue 3 → 4 stripes · 2026-04-21', all the way back to the first row.",
          'Each entry shows who recorded the change.',
          "Reported by you as 'vorrei che per ogni atleta ci si ricordasse di questi passaggi (giorno per lo meno) nella sezione profilo... cosi io owner ricordo quando ho dato la striscia a chi'.",
        ],
      },
      {
        heading: '✨ Stripe promotions also post to the feed',
        bullets: [
          "Until now, only belt changes auto-posted a celebration to the community feed. Stripe bumps were silent. Now a stripe increase fires its own feed post — separate from the belt-promotion post-type so the celebration text reads differently ('X earned their Nth stripe on the Y belt' vs. 'X earned a new belt').",
          "Stripe drops (4 → 0 when a belt goes up) deliberately don't celebrate — the existing belt-promotion post already covers it.",
          "Reported by you as 'vorrei mettere gli aggiornamenti/promozione di cintura nuova anche per le striscette'.",
        ],
      },
      {
        heading: '🐛 Sidebar version on production',
        bullets: [
          "The version label in the sidebar read 'Dev' instead of 'v2.9.0' on budojo.it production. Cloudflare Pages clones the repo with depth=1 by default, which made `git describe` blind to the release tag and fall back to the dev placeholder.",
          'Fixed by unshallowing the clone in the build step — the sidebar now shows the real version on every deploy.',
        ],
      },
    ],
  },
  {
    version: 'v2.9.0',
    date: '2026-05-12',
    headline:
      "A polish-and-fix follow-up to v2.8.0, all reported within hours of the v2.8.0 ship on the community feed. Three changes: notification toggles on /dashboard/profile no longer render the white knob overflowing the green track (iOS-shape: 1.5rem track + 1.25rem knob + 0.125rem gap, knob sits inside the pill in light + dark mode). Community feed dates flipped from formal 'May 12, 2026, 20:57:49' to locale-aware human formats — post + comment timestamps read 'now' / '5 min ago' / 'yesterday' / 'Sat at 10:30' / 'May 12' depending on age (it: 'adesso' / '5 min fa' / 'ieri' / 'sab alle 10:30' / '12 mag'); event start times read 'Today at 10:00' / 'Tomorrow at 10:00' / 'Saturday at 10:00' / 'May 16 at 10:00' depending on distance (24-hour time across both locales). Reaction counter rendered on the wrong button when a post had only 🙏 prays — fixed by exposing per-emoji counts from the server (clap_reactions_count + pray_reactions_count) and rendering each next to its own button.",
    sections: [
      {
        heading: '🐛 Notification toggles — knob inside the track',
        bullets: [
          'The toggle switches on /dashboard/profile → Notifications rendered with the white knob overflowing the green track on iOS Safari: the knob clipped past the right edge AND overhung the top + bottom of the pill.',
          "Two coupled regressions from v2.8.0's checked-state border + the Material preset's mismatched track / knob proportions. Fixed to an iOS-shape: 1.5rem track + 1.25rem knob + 0.125rem gap — the knob now sits inside the green pill with a small margin all around, in both light and dark mode.",
        ],
      },
      {
        heading: '✨ Human-friendly dates on the community feed',
        bullets: [
          "Post and comment timestamps no longer read like 'May 12, 2026, 20:57:49' — locale-aware buckets: 'now' / '5 min ago' / '3 hours ago' / 'yesterday' / 'Sat at 10:30' / 'May 12' / 'May 12, 2025' (it: 'adesso' / '5 min fa' / '3 ore fa' / 'ieri' / 'sab alle 10:30' / '12 mag' / '12 mag 2025').",
          "Event start times read 'Today at 10:00' / 'Tomorrow at 10:00' / 'Saturday at 10:00' / 'May 16 at 10:00' / 'May 16, 2027 at 10:00' (it: 'Oggi alle 10:00' / 'Domani alle 10:00' / 'Sabato alle 10:00' / '16 maggio alle 10:00' / '16 maggio 2027 alle 10:00'). 24-hour time across both locales — en-GB convention.",
          'Both flip live when you toggle the sidebar language.',
        ],
      },
      {
        heading: '🐛 Reaction count on the right button',
        bullets: [
          "A community post with two 🙏 prays + zero 👏 claps rendered the '2' counter on the Clap button — the wrong one. Cause: the feed only carried a single reactions_count total, attached to whichever button rendered first.",
          'Fixed by surfacing per-emoji counts from the server (clap_reactions_count / pray_reactions_count) and rendering each count next to its own button. Clap → Pray swaps update both buckets without a refresh.',
        ],
      },
    ],
  },
  {
    version: 'v2.8.0',
    date: '2026-05-12',
    headline:
      "A focused follow-up to v2.7.0: the community feed is now first-class for academy owners too. New /dashboard/community entry in the sidebar (chat-bubbles icon, between Stats and Profile) opens the same feed athletes see — belt promotions, events, comments, RSVPs. A 'Post event' composer button at the top lets owners post a new event in 5 fields (title required 1–120 chars; when via calendar + 24-hour time picker; where, details, max attendees all optional); the card lands at the top of the feed immediately and every academy member except the editor gets the new-event inbox notification. Owner moderation: a trash icon appears on every post (owners only — athletes don't see it) and on every comment (regardless of author). Tap → red Delete confirm → removed for everyone. Notification recipient fix: community_event_new now reaches the academy owner too (was silently skipping non-editor owners, vestige of the 'owner always IS the editor' assumption). One visible bug: the notification toggles on /dashboard/profile were half-purple / half-green on iOS Safari — fixed to a white knob on green track in both light and dark mode (matches the iOS Settings shape).",
    sections: [
      {
        heading: '✨ Owners now have the community feed in their sidebar',
        bullets: [
          'New Community entry in the dashboard sidebar between Stats and Profile (chat-bubbles icon). Tap it and you arrive on the same /dashboard/community feed your athletes see — belt-promotion celebrations, owner-posted events, comments, RSVPs.',
          'Owners can do everything an athlete can on the feed: 👏 Clap / 🙏 Pray reactions, write and delete their own comments, Yes / Maybe / No RSVPs on event posts.',
          'The athlete-portal feed under /dashboard/me/feed is unchanged. The two routes share the same backing component; the API has always been role-agnostic, the owner just hadn’t had a route into it before.',
        ],
      },
      {
        heading: '✨ "Post event" composer',
        bullets: [
          'Right above the feed, owners now see a "Post event" button. Tap it and a dialog opens with five fields: Title (required, 1–120 chars), When (calendar with a 24-hour time picker), Where (optional, up to 200 chars), Details (optional, up to 2000 chars), Max attendees (optional — leave empty for no cap).',
          'Hit "Post event" and the new event card lands at the top of the feed immediately. Every other academy member receives an inbox notification — the editor (you) is excluded, since you already see your own post in the feed. Default-on; opt-out lives on /dashboard/profile → Notifications.',
          'V1 ships create only — editing or cancelling an event is V2. Plan accordingly until then. If you mistype, delete the post via the new trash affordance (next section) and re-post.',
        ],
      },
      {
        heading: "✨ Owner moderation — delete posts and others' comments",
        bullets: [
          "A trash icon appears on every post header on the feed (visible only to owners — athletes don't see it).",
          'A trash icon also appears on every comment in every thread, regardless of who wrote it. The author had always been able to delete their own; owners now get the same affordance across the board.',
          'Tap the trash and you get a confirmation dialog with a red Delete button (Krug § Forgiveness for mistakes — no accidents). On confirm the post / comment is removed from the feed for everyone, and from your local view immediately.',
          "This was already the server-side rule (the owner has always been authorized to moderate their academy) — the dashboard just hadn't surfaced the affordance until now.",
        ],
      },
      {
        heading: '✨ Owners now receive the community_event_new notification',
        bullets: [
          'Until v2.8.0 the community_event_new inbox notification only reached athletes with a linked user account. Owners who weren\'t the editor of the event were silently skipped — a vestige of the "the owner always IS the editor" assumption.',
          'Recipient set is now "every academy user except the editor" — so in the multi-owner future the owner-side community surface is built for, every owner reads the inbox row about an event their co-owner posted.',
          "Owners still don't get notified about events they posted themselves (correct exclusion: the editor sees the new post they just made appear in their own feed).",
        ],
      },
      {
        heading: '🐛 Notification toggles — green track + white handle, no more split colour',
        bullets: [
          "The toggle switches on /dashboard/profile → Notifications were rendering with a half-purple, half-green split visible on iOS Safari: the track flipped to green correctly when on, but the round knob stayed full indigo from the Material preset's default.",
          "iOS toggles use a white knob on a green track regardless of system theme — that's the shape you'll see now, in light and dark mode (Apple HIG § Controls).",
        ],
      },
    ],
  },
  {
    version: 'v2.7.0',
    date: '2026-05-12',
    headline:
      "The biggest release since v2.0. Two new product surfaces land together: the athlete portal (every athlete can now sign in and see their own attendance / payments / documents / profile, plus a 'My academy' card) and the community feed (a Facebook-style timeline of academy life — auto-posted belt promotions, owner-posted events, reactions, comments, RSVPs). Three new community inbox notifications tie them together: community_reply (default-on, fires when someone replies to a thread you're in), community_event_new (default-on, fires when the owner posts a new event), and community_belt_celebration (default-OFF — wider blast radius, opt-in on /dashboard/profile). The owner-side dashboard is unchanged; the portal is purely additive — athletes you've already invited will see their version of the data starting next sign-in. Behind the scenes: race-safe reaction toggle on the (post_id, user_id, emoji) unique constraint, per-post Subject + switchMap as the canonical optimistic-UI pattern (reactions, RSVPs, comments all share the shape), belt-promotion auto-post via an #[ObservedBy] observer that skips console / seeder context, and a new defaultOff() mechanism on NotificationPreferences for opt-in categories.",
    sections: [
      {
        heading: '✨ The athlete portal — every athlete now signs in',
        bullets: [
          'Every invited athlete now has their own login and lands on /dashboard/me/profile — name, avatar, handle, belt, contact details. Edit mode (gear top-right) opens a clean reactive form with the same handle validation the owner-side uses (@mariobjj, lowercase, no consecutive / trailing dots).',
          "/dashboard/me/academy is a read-only 'My academy' card with the school name, owner, location, and the athlete's own membership status (joined date, current belt).",
          '/dashboard/me/attendance shows the athlete their own attendance log — month-by-month grid of training days, percentage attended, streak indicator.',
          "/dashboard/me/payments shows the athlete their own payment history, in the language's currency format (€1.234,56 for IT, €1,234.56 for EN), friendly month label, status pill.",
          '/dashboard/me/documents shows the athlete their own medical certificates and other documents with the expiry status pill (Valid / Expiring soon / Expired). The expired-today boundary is inclusive — a cert expiring today shows expired.',
          '/dashboard/me/feed is the new community feed (see below).',
          'The owner-side dashboard is unchanged. The portal is purely additive — athletes you already invited will see their version on next sign-in.',
        ],
      },
      {
        heading: '🎉 The community feed',
        bullets: [
          "/dashboard/me/feed is a timeline of academy life. Three kinds of post today: belt promotions (auto-created when an owner changes an athlete's belt — the celebration card carries the athlete's name + old belt → new belt, and is auto-deleted if you ever delete the athlete), events (open mats, seminars, in-house tournaments — owner-posted from a new API endpoint, with the SPA composer landing in a focused follow-up), and the foundation for free-form announcements.",
          "Every post carries the author badge — name, avatar, handle, and belt — using the same identity-line you see across the dashboard, with a short-fallback ('Mario R.') when no handle is set.",
        ],
      },
      {
        heading: '👏 Reactions',
        bullets: [
          'Tap 👏 Clap or 🙏 Pray at the bottom of any post. The button flips to its active state immediately (optimistic UI) and the count on the post updates.',
          'Tap the same emoji again to remove your reaction. Tap the other emoji to switch.',
          'Quick double-clicks are serialized server-side via a transaction + shared lock on the (post_id, user_id, emoji) unique constraint, so the row never ends up in a half-toggled state.',
        ],
      },
      {
        heading: '💬 Comments',
        bullets: [
          'Each post has a one-level Comments section that expands on tap. Write a comment (up to 500 chars), see it appear in the list, delete your own with the trash icon.',
          "The post's comment count updates inline as comments arrive or are deleted — no full refresh needed.",
        ],
      },
      {
        heading: '📅 Event RSVPs',
        bullets: [
          'Event posts carry three RSVP buttons: Yes / Maybe / No. Tap to commit, tap again to clear, tap a different one to switch.',
          'The headcount on the event card updates in real time as RSVPs flow in (optimistic locally, race-safe server-side).',
        ],
      },
      {
        heading: '🔔 New inbox notifications — community-flavoured',
        bullets: [
          "Someone replied to a thread you're in — community_reply, default-ON. When you comment on a post and someone else later comments on the same post, you get an inbox row pointing back to the thread. The author of the new comment never gets notified about their own post.",
          "Your academy posted a new event — community_event_new, default-ON. When the owner posts a new event to the feed, every athlete in the academy gets an inbox row deep-linking to the event card. The owner who posted it isn't notified.",
          'A teammate earned a new belt — community_belt_celebration, default-OFF. The every-athlete blast radius is wide enough that you have to opt in explicitly on /dashboard/profile → Notifications. Once on, every belt promotion in your academy lands as an inbox row (except for the one you recorded yourself).',
          'All three are gated server-side and surfaced as toggles in /dashboard/profile → Notifications, with the off-by-default one carrying a clear hint in the description copy. Toggles persist instantly with optimistic UI.',
        ],
      },
      {
        heading: '🔧 Owner-side event creation',
        bullets: [
          'Owners can now create events programmatically against a new API endpoint (the SPA composer lands in a focused follow-up). V1 ships create only — edit / cancel surfaces are V2. The endpoint accepts title (required, 1-120 chars), description (optional, max 2000), start date-time (required ISO 8601, normalised to canonical UTC), optional location text + lat / lon (V2 map view-ready), and max attendees. Only academy owners can post; athletes get a polite refusal.',
        ],
      },
      {
        heading: '🔧 Behind the scenes',
        bullets: [
          'Race-safe reaction toggle: read-then-upsert on the unique (post_id, user_id, emoji) constraint now runs inside a DB transaction with a shared lock + caught QueryException on concurrent races. Worth knowing for anyone wiring similar UI primitives.',
          'Optimistic UI as the canonical pattern: every interaction in the new feed (reactions, RSVPs, comments) is wired through a per-post Subject + switchMap that serializes rapid clicks and rolls back the UI on server error. Same shape across all three flows.',
          'Belt-promotion observer skips console / seeder context (no authenticated user to attribute), so seeded belt changes during db:seed never generate stale celebration posts.',
          "Default-off notification categories: the preferences system grew a new defaultOff() mechanism (consulted by NotificationPreferences::isEnabled for the absent-key fallback). community_belt_celebration uses it — absent-key recipients are NOT notified until they explicitly opt in. The SPA panel surfaces it with an 'Off by default' hint.",
          'Stable payload key set: community_posts.payload now carries a fixed shape per post type, pinned by a schema test. Adding a new post type or a new payload field touches both the factory and the schema test in the same diff.',
        ],
      },
    ],
  },
  {
    version: 'v2.6.1',
    date: '2026-05-11',
    headline:
      'A polish release. One small visible fix in the email-verification flow: the "Resend verification email" button on /auth/verify-error now shows a spinner and disables itself for the duration of the request (previously you clicked and got no feedback until the redirect / toast arrived at the end). The rest is behind-the-scenes — extracted a shared <app-verify-page> chrome across the three verify landing pages, dropped the leftover one-resident `Account/` namespace on the backend (controllers, actions, and form request all redistributed by consumer to Auth/User/), added Vitest coverage on five previously-untested Angular components (35+ new tests pinning state machines + error paths), and a /graphify knowledge-graph integration that surfaced the namespace-cleanup issues in this release as part of its diagnostic pass. Nothing visible in the dashboard from the internal work, but cleaner foundation for the next milestone.',
    sections: [
      {
        heading: "🐛 Email verify — resend button now shows you it's working",
        bullets: [
          'If a verification email link expired or got mis-clicked and you landed on the "Verification failed" page, clicking Resend used to give you no visible feedback for the full duration of the request — the button stayed bright and clickable, the page stayed put. Annoying enough that some people clicked twice; the app already ignored the second click via an internal re-entrancy guard, but from the screen you couldn\'t tell.',
          'Now: the button shows a spinner and disables itself for the whole duration of the resend request. Standard "your click registered, sit tight" feedback.',
        ],
      },
      {
        heading:
          '🔧 Behind the scenes — auth-chrome refactor + first test coverage on a stale corner',
        bullets: [
          "The three landing pages users hit after clicking a verification email (verify-success, verify-error, verify-email-change) used to ship three near-identical copies of the page chrome. Centred icon, title, message, CTA all live in one shared <app-verify-page> component now, with state-coloured icon variants. When the M7 athlete-invite verification link lands, it'll be a 5-line consumer of the same component instead of a fourth copy.",
          'PHP-side: the `App\\Http\\Controllers\\Account\\` namespace had exactly one controller in it (EmailChangeController) — left over from earlier rapid feature shipping. Split it so request + cancel (authenticated /me/* actions) live under User/, and verify (public token-based) lives next to the existing primary-email verify under Auth/. The Actions/Account/ namespace followed its controllers the same way. URLs unchanged.',
          "Five previously-untested Angular components got proper Vitest specs: VerifySuccess, VerifyError, AthletePortalWelcome, NotificationBell, AthleteInvite — 35+ new tests pinning their state machines, lifecycle hooks, branching logic, and error paths. They were Cypress-only before; now a future refactor can't silently regress them at the unit level.",
          'New /graphify slash command in the repo — it builds a navigable graph of the codebase (3.7k nodes, 4.6k edges) and the agent consults it before touching unfamiliar code. A post-commit hook keeps the graph current. Pure agent-side tooling, but it actually surfaced the two namespace-cleanup issues in this release.',
          "Project board hygiene pass alongside: 30 issues re-assigned to the right owner, every stale test-plan checkbox on closed PRs ticked or cleaned, two new entries added to the team gotchas file so the same trips don't happen twice.",
        ],
      },
    ],
  },
  {
    version: 'v2.6.0',
    date: '2026-05-11',
    headline:
      'A double-feature release: stronger sign-in security and a calmer dashboard surface. Two-factor authentication (TOTP + 8 single-use backup codes) is now opt-in from /dashboard/profile — scan a QR with any authenticator app, type the 6-digit code on next sign-in. A new bell icon in the dashboard topbar opens a 20-row notification inbox (each row deep-links to its source and flips read in one tap; "Mark all read" bulk-flips). A first-run "Getting started" checklist (5 steps: add athlete / log attendance / mark payment / upload document / view stats) lands on /dashboard/athletes for brand-new owners — self-dismisses when every step is ticked, or one-click dismiss with a confirm popup. New API tokens panel on /dashboard/profile lets you mint long-lived bearer tokens for scripts (abilities-scoped, optional expiry 1-730 days, plaintext shown ONCE with a copy + "save it now" gate). Compliance: medical certificates are now encrypted at rest with AES-256-GCM (separate key, rotatable independently of APP_KEY; pre-existing plaintext rows still readable), and a daily 03:15 Europe/Rome cron auto-purges any medical cert whose expires_at is more than 24 months in the past (DPIA § R6 enforced — same code path the athlete-removal cascade uses, file bytes + DB row both go). Behind the scenes: server-side Web Push subscription plumbing (push_subscriptions table + 3 endpoints + VAPID config) — the SPA toggle + delivery integration land in a focused follow-up.',
    sections: [
      {
        heading: '🛡️ Two-factor authentication',
        bullets: [
          'New "Two-factor authentication" panel on /dashboard/profile. Scan a QR with Google Authenticator / 1Password / Authy / any TOTP app, type the 6-digit code it shows, and 2FA is on. From the next login forward the password screen now asks for the code AFTER the password.',
          'You also receive 8 single-use backup codes on enrolment (XXXX-XXXX format, ambiguous-char-free alphabet). Save them in a password manager — each one works once if you lose your phone. The panel surfaces how many remain and lets you regenerate the set whenever you want.',
          "Disabling 2FA requires your current password (defense in depth — a stolen session can't strip 2FA from you).",
        ],
      },
      {
        heading: '✨ "Getting started" checklist on the dashboard',
        bullets: [
          'Brand-new owners landing after academy setup now see a 5-step checklist at the top of /dashboard/athletes: add an athlete, log attendance, mark a payment, upload a document, view stats.',
          'Each row has a "Show me" CTA that navigates to the right feature AND ticks the step done in one tap.',
          'The checklist self-dismisses once every step is ticked. There\'s also a small "Dismiss" link in the corner — one click + confirm and it\'s gone for good.',
        ],
      },
      {
        heading: '🔔 In-app notification center',
        bullets: [
          'A bell icon arrives in the dashboard topbar. Unread count badges on the bell; tapping it opens a 20-row panel with the latest notifications.',
          'Each row deep-links to the originating object (the athlete whose certificate is expiring, the payment month you haven\'t ticked yet) and flips to "read" in the same click. A "Mark all read" CTA at the top bulk-flips.',
          'The inbox surface ships today; the actual reminder fan-out (medical-cert expiry, unpaid-athletes digest) gets wired into the bell in a focused follow-up.',
        ],
      },
      {
        heading: '🔧 API tokens — scripted access to your data',
        bullets: [
          'New "API tokens" panel on /dashboard/profile lets you mint long-lived bearer tokens for scripts and integrations.',
          'Each token gets a name, a scoped subset of abilities (athletes:read, documents:write, payments:read, attendance:write, …), and an optional expiry (1–730 days).',
          'The plaintext bearer is shown ONCE at creation with a copy button and a clear "save it now, you won\'t see it again" gate. Lost a token? Generate a new one and revoke the old.',
        ],
      },
      {
        heading: '🛡️ Medical certificates encrypted at rest',
        bullets: [
          'Medical certificates are special-category health data under GDPR Art. 9. From v2.6.0 every new medical-cert upload is encrypted with AES-256-GCM before the bytes ever touch disk; decryption happens in memory at download time.',
          'The encryption key is separate from the app secret and rotatable independently — losing the document key without a backup means the encrypted files are permanently unrecoverable, so the runbook in docs/infra/production-deployment.md documents the procedure.',
          "Existing medical certificates uploaded before v2.6.0 stay plaintext and still serve correctly; we'll re-encrypt them in a future maintenance window.",
        ],
      },
      {
        heading: '🛡️ Auto-purge of expired medical certificates',
        bullets: [
          'The DPIA on medical certificates set a 24-month retention window. A new daily cron (03:15 Europe/Rome) sweeps every medical certificate whose expires_at is more than 24 months in the past and removes BOTH the database row and the file on disk.',
          'Federation registrations and ID copies are not touched — they have different retention rules.',
          'GDPR Art. 5 § 1 (e) ("kept for no longer than necessary") is now enforced by automation, not by a footnote.',
        ],
      },
      {
        heading: '🔧 Behind the scenes — browser push plumbing',
        bullets: [
          'Server-side: a push_subscriptions table + three endpoints on /me/push-subscriptions + VAPID config wiring. When the follow-up Profile toggle ships, the SPA will call PushManager.subscribe() and POST the envelope here.',
          'No user-visible surface yet — the bell icon is the channel users see today; browser push is an additional fan-out path for time-sensitive nudges like "medical certificate expires tomorrow" without forcing the tab to stay open.',
        ],
      },
    ],
  },
  {
    version: 'v2.5.0',
    date: '2026-05-10',
    headline:
      'A "security & notifications center" on your profile page. Four new sections, all on /dashboard/profile: (1) one-click cancel of a scheduled account deletion via the link in the confirmation email — no sign-in required, the page auto-strips the one-time token from the URL post-consume so it doesn\'t leak via screenshots or browser history; (2) an "Active sessions" panel listing every device with a live Sanctum session, friendly device label like "Chrome on macOS" or "Safari on iOS", last-used timestamp, "this session" pill on the current row, per-row revoke + a top-level "sign out other sessions" CTA — you can revoke the session you\'re currently using too, the next request from that tab gets signed out and you\'re bounced to login; (3) a "Login history" panel listing the last 50 sign-in attempts (successful AND failed) so a failed-login burst from a stranger doesn\'t go unnoticed — failed rows carry a subtle red wash + a "failed" pill, history is kept for 90 days then auto-purged, privacy policy at /privacy § 4 updated to disclose the retention window; (4) per-category email notification preferences for the digest emails (medical-cert reminders, unpaid-athletes monthly digest) with transactional emails (password reset, verification, etc.) listed in a read-only "always sent" block — toggles save instantly with optimistic UI, revert on rare save failures.',
    sections: [
      {
        heading: '🛡️ One-click cancel of a scheduled account deletion',
        bullets: [
          'When you click "Delete account" on /dashboard/profile, you enter a 30-day grace window before the data is permanently removed. Until now, cancelling that deletion required signing in again and clicking "Cancel" on the same profile page.',
          'The confirmation email now carries a "Cancel deletion" button. One tap, no sign-in. The account is restored, no data lost, and you land on a calm confirmation page that auto-strips the one-time token from the URL so it doesn\'t leak via screenshots or browser history.',
          'If you\'ve already cancelled (or the link is no longer valid because the account was already removed), the page tells you "no deletion is pending" instead of leaking which case you\'re in.',
        ],
      },
      {
        heading: '🛡️ Active sessions — see and revoke every signed-in device',
        bullets: [
          'New panel on /dashboard/profile lists every device with a live session: a friendly device label (e.g. "Chrome on macOS", "Safari on iOS"), the last time each session was used, and a "this session" pill on the row you\'re using right now.',
          'Each row has a "Revoke" button; the panel also has a top-level "Sign out other sessions" CTA for the "I forgot my laptop at the gym" flow.',
          "You can revoke the session you're currently using — the next request from that tab gets signed out automatically and you're bounced back to login.",
          'Older session names from before this release still show as "auth" or "athlete-invite-accept"; new logins re-mint with the friendly device label automatically.',
        ],
      },
      {
        heading: '🛡️ Login history — spot unfamiliar access at a glance',
        bullets: [
          'New panel below sessions lists the last 50 sign-in attempts on your account: successful logins AND failed ones. Failed attempts get a subtle red wash and a "failed" pill so they stand out — a burst of failed attempts from an IP you don\'t recognise is exactly the signal you want to catch.',
          'Each row shows the device label, the timestamp, and the IP address (when available). A footer hint links to the password-change form: "if something here looks unfamiliar, change your password and revoke the session".',
          'History is kept for 90 days, then automatically purged. The privacy policy at /privacy § 4 has been updated to disclose the retention window.',
        ],
      },
      {
        heading: '🛡️ Email notification preferences',
        bullets: [
          "Budojo sends a few digest / reminder emails per month: the medical-cert expiry reminder (daily, only when there's something to flag) and the unpaid-athletes monthly digest (16th of the month). Until now you received both with no way to opt out.",
          'The new "Email notifications" panel lets you toggle each category independently. Toggles save instantly; no "Save changes" button. On a rare save failure the switch reverts and a toast surfaces.',
          'Transactional emails (welcome, password reset, email verification, account-deletion confirmation, athlete invitation) are listed in a read-only "always sent" block — they\'re required for the service to work and can\'t be turned off.',
        ],
      },
    ],
  },
  {
    version: 'v2.4.0',
    date: '2026-05-10',
    headline:
      'A polish-and-plumbing release. Three visible iPhone fixes on the dashboard, plus a behind-the-scenes safety net so tabs stuck on an old version of the app stop staying stuck. Visible: (1) Profile page — the pencil affordance next to First name / Last name / Handle / Email no longer falls onto its own row below the value on iPhone; (2) Athletes list + Attendance — the age chip "35 y" no longer wraps to two lines on a tight column (now reads "35y"); (3) Athletes list + Attendance — kid-variant belt labels like "Green (kids)" no longer split with the colour on top and "(kids)" underneath. Invisible safety net: the dashboard now polls a version file every 20 minutes (and on every tab focus); if your tab is running an older bundle than the latest deploy, it clears its caches and reloads quietly so you land on the latest. For tabs already stuck on an old bundle, a recovery URL (https://budojo.it/?force-update=1) frees them in a single visit. Network blips during the poll never disrupt your work — the failure is silently absorbed.',
    sections: [
      {
        heading: '🐛 iPhone — pencil affordance no longer falls under the value on Profile',
        bullets: [
          'On /dashboard/profile, every editable row (First name, Last name, Handle, Email) shows the value plus a small pencil icon you can tap to edit. On iPhone-class viewports the pencil was rendering BELOW the value on its own line — the row read as "label / value / pencil" stacked vertically instead of "label / (value pencil)" as designed.',
          'Fixed by restructuring the row so value + pencil sit in a flex container; the pencil now sits on the trailing edge regardless of viewport width.',
          "This was a recurring report — the v2.1.0 polish sweep tried to fix it via absolute positioning, the iOS browser cascade silently ignored the rule, the bug came back. The new shape doesn't depend on cascade gymnastics so it should stick.",
        ],
      },
      {
        heading: '🐛 Athletes list — age chip and belt label no longer wrap to two lines',
        bullets: [
          'Age chip wrapped "35" and "y" onto two lines. The chip displayed the age followed by a literal space and a "y" (e.g. "35 y"); on a tight column the space broke and the chip rendered a digit on top, the "y" underneath. Now reads "35y" with no breakable space — fits on one line at any width.',
          'Belt label wrapped on the kid variants. Pills like "Green (kids)" were splitting on the space before "(kids)", rendering the colour on top and "(kids)" underneath. The pill now grows in width when needed instead of in height; one line at every viewport.',
          'Both fixes apply across the Athletes list AND the Attendance daily check-in page.',
        ],
      },
      {
        heading: '🛡️ Behind the scenes — your tab now reliably picks up new versions',
        bullets: [
          'The dashboard now polls a version file every 20 minutes (and every time you switch back to the tab). When the version doesn\'t match the one your tab is running, the tab quietly clears its caches and reloads on the latest version. No banners, no "click here to update" — it just lands.',
          "For tabs already stuck on an old bundle, we can now hand out a single recovery URL (https://budojo.it/?force-update=1). Visiting it once unsticks the tab without you having to clear browser data manually. We'll send this proactively to any customer flagged as stuck.",
          'Network blips don\'t disrupt your work. The version check is a background poll; if it fails (Wi-Fi drops, etc.) the tab stays exactly where you are — no false "you\'re offline" page.',
          "This is invisible if you've been refreshing normally; it's load-bearing for anyone who pinned the dashboard to their iPhone home screen and hasn't touched the tab in weeks.",
        ],
      },
      {
        heading: '🔧 Behind the scenes — post-v2.3.2 tech-debt sweep',
        bullets: [
          'The post-release sweep walked the canonical checklist (TODO comments, suppressions, outdated deps, doc drift, gotchas, memory). v2.3.2 was a small patch so the sweep was largely empty — one finding: a TODO comment in the account-deletion code referenced a closed issue. Repointed at the new follow-up (#545 — token-based "click here to cancel" email-link flow for pending account deletions). No code-behavior change.',
        ],
      },
    ],
  },
  {
    version: 'v2.3.2',
    date: '2026-05-10',
    headline:
      'A two-fix release plus a wave of behind-the-scenes legal-docs work. (1) Luigi reported that on /dashboard/attendance, sorting by belt was hiding every belt above white when there were more than 20 active athletes — there was no paginator and the per-page slice exhausted itself on white belts before any blue / purple / black belt could appear. The page now paginates at 20 per page, the paginator surfaces below the table when you have a roster bigger than that, and any filter / search / sort change snaps you back to page 1. (2) The privacy policy used to claim "daily database backups with 30-day retention" but the automated backup strategy is still being implemented before the first real production data lands. Reworded to "an automated database-backup plan planned to be implemented before any real production customer data is collected". Stopped over-promising; aligned the public claim with what the DPA template and infra runbook say internally. Everything else is invisible compliance + documentation hardening: a DPIA for medical certificates, an academy-offboarding runbook, the actual Play Store listing copy, and a fresh test layer pinning the medical-cert handling in the GDPR access + erasure paths.',
    sections: [
      {
        heading: '🐛 Attendance — sort-by-belt no longer hides the rest of the roster',
        bullets: [
          'Luigi (a customer) reported that with more than 20 active athletes and the table sorted by belt ascending, the white-belt cohort exhausted the per-page slice before any blue / purple / black belt could appear, so the rest of the roster was invisible. Filter strip changes had the same shape — narrowing on a belt and then sorting could drop you onto a phantom empty page.',
          'The page now requests one server-paginated slice at a time and binds the paginator chrome (page numbers + arrows below the table) to the result. You see the same paginator you already know from the main athletes list.',
          'Searching, filtering by belt, or clicking a sort header always snaps you back to page 1 — so a narrowing filter never leaves you on an empty page.',
          'The paginator only renders when you actually have more than 20 athletes; under that threshold the page looks identical to before.',
        ],
      },
      {
        heading: '🐛 Privacy policy — "daily backups" claim corrected',
        bullets: [
          'The bullet under § 5 ("Modalità di trattamento e misure di sicurezza" / "Processing methods and security measures") used to say "Backup giornalieri della base dati con retention 30 giorni" / "Daily database backups with 30-day retention". That was stronger than reality — the automated backup strategy is documented as an explicit prerequisite for real production customer data, but it isn\'t yet active.',
          'Reworded to "Piano di backup automatizzato della base dati in implementazione prima della raccolta di dati reali in produzione" / "An automated database-backup plan planned to be implemented before any real production customer data is collected." Points at the DPA template § 8 and the production-deployment runbook for the technical decision (DigitalOcean Managed DB vs mysqldump cron vs droplet snapshots) that\'s still being made.',
          'Transparency-improvement, not a security regression — nothing about how your data is handled changed; only what we say about it. The actual backup strategy is the next item on the production-readiness checklist.',
        ],
      },
      {
        heading: '🔧 Behind the scenes — legal docs + medical-cert test coverage',
        bullets: [
          "DPIA-lite for medical certificates (Data Protection Impact Assessment, GDPR Art. 35) lives at docs/legal/dpia-medical-certificates.md. It walks through the risks, mitigations, and the strategic A-vs-B choice between keeping medical-cert PDFs inside Budojo (with encryption + audit) vs storing only valid yes/no + expiry and letting the academy's own storage hold the file. Recommendation is option B until traction; the choice itself is still pending.",
          'Academy-offboarding runbook at docs/operations/academy-offboarding.md walks the manual procedure for when an academy customer ends the contract — three windows (T-30 notice, T0-T+30 grace export, T+30 purge) with explicit steps for each.',
          'TWA runbook rewritten so it describes the actual /.well-known/assetlinks.json flow (static file under the SPA bundle, edited via PR, served by Cloudflare Pages) instead of the retired Laravel-routed env-driven implementation deprecated in v2.3.1.',
          'Play Store listing copy drafted in English and Italian at docs/mobile/play-store-listing.md, including the Data Safety questionnaire answers — so when the Android app ships, the listing is paste-ready.',
          "Medical-certificate test coverage added to the GDPR Art. 15 export and Art. 17 erasure flows. The flows already did the right thing; the tests pin the behavior so a future refactor can't silently regress the special-category-data handling.",
        ],
      },
    ],
  },
  {
    version: 'v2.3.1',
    date: '2026-05-08',
    headline:
      'A small follow-up on the v2.3.0 release earlier today. One visible fix: the Profile photo card on /dashboard/profile was missing internal padding, so the avatar + "Profile photo" / Replace / Remove block was flush against the card edges. Restored the same padding shape as the Change password and Your data sections below. The other change is invisible — the file Chrome reads to validate the upcoming Android app (/.well-known/assetlinks.json) was being served from the API host when it actually needs to live on the SPA host. Moved to a static file under the SPA bundle.',
    sections: [
      {
        heading: '🐛 Profile photo card padding',
        bullets: [
          'The avatar block on the Profile page was rendering with no internal padding — the photo, the "Profile photo" label, the format hint, and the Replace / Remove buttons were tight against the card border. Now sits at the same internal-padding rhythm as the Change password and Your data cards directly below it.',
        ],
      },
      {
        heading: '🔧 Behind the scenes — TWA assetlinks moved to the SPA host',
        bullets: [
          "A small architectural correction on the v2.3.0 Android-app groundwork. The previous release shipped the /.well-known/assetlinks.json endpoint as a Laravel route at api.budojo.it, but Chrome's TWA verifier reads that file at the SAME ORIGIN as the PWA manifest — which lives on budojo.it (Cloudflare Pages, static), not api.budojo.it (Laravel). The endpoint was in the wrong place. Moved to a static file under the SPA bundle so Cloudflare Pages serves it from the edge directly. Invisible to existing users; unblocks the upcoming Android app once the signing keystore + Bubblewrap build land.",
        ],
      },
    ],
  },
  {
    version: 'v2.3.0',
    date: '2026-05-08',
    headline:
      'A preparation release for the Android app coming next. Most of what shipped is plumbing — the foundation an installable Android APK needs to look and feel native. The one user-visible add: when you install Budojo as a PWA on Android, long-pressing the launcher icon now offers three quick shortcuts so you can jump straight into a workflow without going through the dashboard first.',
    sections: [
      {
        heading: '📱 PWA shortcuts on Android',
        bullets: [
          "When you've installed Budojo as a PWA on an Android phone (or you've added it to your home screen on iOS), long-pressing the launcher icon opens three quick shortcuts: Athletes — jumps straight to the roster, Today's attendance — jumps to the attendance day view, Add athlete — opens the create-athlete form. Saves a tap or two on the most-frequent flows when you've got the app pinned to your home screen.",
        ],
      },
      {
        heading: '🔧 Behind the scenes — Android APK groundwork',
        bullets: [
          "The server now serves /.well-known/assetlinks.json, the Digital Asset Links record an Android Trusted Web Activity (TWA) shell needs to enter fullscreen mode (no URL bar visible — looks like a real native app). This is invisible until the actual APK ships, but it's the foundation: without it the upcoming Android app would render with the URL bar visible on top of the dashboard.",
          'A separate runbook (docs/mobile/twa-runbook.md in the repo) walks the engineer through generating the signing keystore, scaffolding the Bubblewrap project, building the APK, and uploading to Play Store internal testing. The next release will carry the actual Android app.',
        ],
      },
      {
        heading: '🧹 Other',
        bullets: [
          'PWA manifest gains categories (business / productivity / sports) — feeds into the Play Store listing for cleaner store-tab placement once we ship.',
          "display_override for progressive display-mode fallback — TWA prefers standalone, falls back through minimal-ui to browser if the host Chrome can't honour fullscreen.",
          'prefer_related_applications: false — defensive against Chrome cross-recommending another app over Budojo.',
        ],
      },
    ],
  },
  {
    version: 'v2.2.0',
    date: '2026-05-07',
    headline:
      'A polish-heavy release. The Profile page got a top-to-bottom rework so it reads exactly like the Academy detail card you already know — same row rhythm, same spacing, same edit affordance. The Athletes list now shows little Facebook and Instagram icons next to each athlete who has those links on file. And a handful of small input bugs from the v2.1 polish round are now properly fixed: the Cmd-K magnifier is back at the optical center of the search bar, the eye toggles on the change-password fields are visible everywhere, and the "two email fields, which one do I edit?" confusion on the athlete edit form is gone.',
    sections: [
      {
        heading: '✨ Athletes list — Facebook + Instagram icons inline',
        bullets: [
          "Social icons on each athlete row — when an athlete has facebook or instagram filled in, you'll see the matching icon directly under their name on the list. Click it and the profile opens in a new tab. Athletes without socials show nothing — no empty placeholders, no clutter.",
          'Same look as the academy card. This mirrors the social-link chips on the academy detail page; the visual treatment, hover state, and tooltip are identical.',
          "Click on the icon doesn't open the athlete. The icon's link is its own affordance — tapping the Instagram icon takes you to Instagram, not into the athlete page. Tap the name itself for the athlete detail.",
        ],
      },
      {
        heading: '🎨 Profile page — convergence on the Academy card design',
        bullets: [
          'Same card chrome as Academy detail. The Profile page used a slightly different card style than the Academy page (different border, different padding, different label rhythm). Both pages now share the exact same card primitive — a clean rounded container with a hairline border, hairline separators between rows, and consistent typography for labels and values. Side-by-side they look like siblings, not cousins.',
          'First name + Last name show as separate rows. Two clean rows ("First name" / "Last name") instead of one combined two-column block. Each carries its own pencil — clicking either opens the same combined edit form so the editing ergonomics are unchanged.',
          'The "Email verified" row is gone — replaced by an inline green tick. A dedicated row that just said "Email verified" with a green badge was visual noise for the 99% case. Now when your email is verified you see a small green checkmark next to the email value itself. The full Verification row only shows up when there\'s actually something to do — i.e. when the email is pending verification, with the "Resend verification email" button right there.',
          "Mobile layout fixed. On phones, the pencil affordance was wrapping below the value as an orphan affordance. It now sits cleanly at the top-right corner of each row regardless of the value's length.",
          "Edit tab first on the athlete detail. When you open an athlete, the tabs are now Edit | Documents | Attendance | Payments (was Documents | Attendance | Payments | Edit). Edit is the most-frequent action on a freshly-opened athlete; it gets the leftmost tab so it's the default reach.",
          'Athlete edit form drops the duplicate Email field. Editing an existing athlete used to show an Email row in the form even though the dedicated "Account & invitation" card above already let you change it (with the proper verification flow on linked accounts). The duplicate is gone — the Account card is the single canonical email editor on the detail page. Creating a new athlete still asks for email up-front, of course.',
        ],
      },
      {
        heading: '🐛 Input polish — Cmd-K and password fields',
        bullets: [
          "Cmd-K magnifier optically centered. The leading magnifying-glass on the Cmd-K palette and on the help-page search drifted a couple of pixels below center because of how the icon font's baseline interacts with our pill chrome. The cap is now a proper grid container with the glyph optically centered regardless of the icon font's quirks.",
          'Eye toggles on Change password are back, everywhere. The "show / hide" eye icons next to Current / New / Confirm passwords were silently missing on some browsers because of how PrimeNG 21\'s SVG icon component interacts with our pill-style overrides. Geometry is now bulletproof; eye is visible at the right edge of every password field.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          "Design-system audit + canonical icon-scale tokens. A doc walk-through of the SPA's UI surfaces shipped alongside this release cataloguing inconsistencies and proposing canonical patterns. The audit's icon-scale step (5 sizes — xs / sm / md / lg / xl) shipped as design tokens; per-surface migrations onto the scale will land in subsequent focused releases.",
          'Dependency hygiene. Routine semver-safe bumps for the Angular 21.2.x cohort, libphonenumber, and devDeps (eslint, prettier, vitest, typescript-eslint). No behavior change.',
        ],
      },
    ],
  },
  {
    version: 'v2.1.0',
    date: '2026-05-07',
    headline:
      "This release leans into account safety. Picking a new password — at sign-up, after a forgot-password reset, or rotating from your profile — now shows a live strength meter as you type, plus a check that the password hasn't shown up in any known credential leak. Two visual fixes round it out: the Cmd-K search bar no longer overlaps its magnifier icon, and the eye-toggle icons on the change-password fields are back where they belong.",
    sections: [
      {
        heading: '🔐 Stronger passwords — strength meter + known-leak check',
        bullets: [
          'Live strength meter as you type. Every password field where you set a new password — registration, forgot-password reset, and the profile change-password section — now shows a small bar that lights up from grey to red to amber to green as the password gets stronger. The grading uses the same model behind major password managers, so an easy password (your name, a date of birth, "qwerty123") reads weak even when it\'s long enough to satisfy the basic length and character checks.',
          'Known-leak check. Passwords that have appeared in any major credential leak are rejected with an inline "this password has appeared in a known data leak — pick another" error. The check is privacy-preserving by design: when you submit your password to Budojo (at sign-up, password reset, or password rotation), our server hashes it and forwards only a tiny anonymous prefix of that hash to the third-party breach database — never the full hash, never the password itself. The match against the leaked-password list happens locally on the prefix bucket the breach service returns. Budojo never stores your password in plaintext.',
          'Same rules everywhere. Whatever you can use at sign-up is what you can use at password reset and at password rotation — no surprise "this used to work but now doesn\'t" between flows.',
        ],
      },
      {
        heading: '🐛 Visual fixes',
        bullets: [
          'Cmd-K search no longer overlaps the magnifier. On desktop the placeholder text "Search athletes by name…" was running into the leading magnifying-glass icon. Both now sit cleanly side by side.',
          'Eye-toggle icons back on Change password. The three "show / hide" eye icons next to Current password, New password, and Confirm new password were silently missing after a recent design refresh. Restored on the right edge of each field.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'Design system refresh. Refreshed brand-kit assets (wordmark, glyph, the full PNG export set) plus a few small token tweaks ship in this release. No visible change to existing screens; every new screen built after this lands consistent with the latest design canon.',
        ],
      },
    ],
  },
  {
    version: 'v2.0.0',
    date: '2026-05-07',
    headline:
      'This release wraps three meaningful UX upgrades plus a quiet schema refactor that finally aligns owner accounts with the way the rest of the app already thinks about people. The version bump to 2.0.0 is mostly about that schema move — your account is now stored as first name + last name (instead of a single combined string), and a new optional @handle has been added if you want one. Existing accounts are migrated automatically: nothing changes visually unless you decide to set a handle.',
    sections: [
      {
        heading: '⌘ Cmd-K — search any athlete from anywhere',
        bullets: [
          "Press Ctrl+K (Windows / Linux) or ⌘K (Mac) anywhere in the dashboard and a search bar pops in the middle of the screen. Type three characters of an athlete's name and you get up to 20 matches in real time, sorted alphabetically by last name. Hit Enter or click a row to land on that athlete's detail page; press Escape to dismiss without leaving the page you were on. Way faster than scrolling the roster when you're trying to look someone up between classes.",
          'Belt + status alongside the name so two athletes with similar names are easy to disambiguate at a glance.',
        ],
      },
      {
        heading: '✉️ Change your email — for yourself and for your athletes',
        bullets: [
          "Owner self-edit on /dashboard/profile. A pencil now sits next to the email row. Click it, type the new address, confirm, and we send a verification link to the new email. Until you click that link, your existing login email stays exactly as it is — the change only applies once you've proven the new address is reachable. A heads-up email lands at the OLD address too, so if a change request was made without your knowledge you can react before it goes through.",
          "Athlete-side email change from the detail page. Same pencil affordance on each athlete row, but smart about state. If the athlete hasn't been invited yet, we just update the contact email. If they have a pending invitation, we revoke the old invite link and issue a fresh one to the new address — no orphaned links left around. If they've already accepted and have an active account, the same verify-the-new-address flow above kicks in for them.",
          'Mistakes are recoverable. Mistype a new email and click Save? The old address keeps working until somebody clicks the link in the verification email — and that link goes to the address you typed. So a typo locks nobody out; the worst case is "the verification email never arrives and you go set the right email when you notice".',
          '24-hour verification window, then the link expires and the pending change is dropped silently. Cancel a pending change at any time from the same row.',
        ],
      },
      {
        heading: '👤 Account — split first / last name + Instagram-style handle',
        bullets: [
          'First name + Last name as separate fields. The single name field is gone. On the registration form, on /dashboard/profile, on the athlete invite-accept page — you\'ll see two fields now. Existing accounts were migrated automatically by splitting on the first space, so "Mario Rossi" became Mario + Rossi, "Maria De Luca" became Maria + De Luca. If your account ended up with a quirky split (single-word names like "Cher", or unusual phrasings), open /dashboard/profile and fix it in three seconds.',
          'Optional @handle. A new "Handle" row sits below your name on the profile page with its own pencil. Pick anything from 3 to 30 characters, lowercase letters / numbers / dots / underscores — the rules are spelled out under the input as you type. Has to start with a letter; no double dots; must be unique across all of Budojo. Empty by default — only set one if you want one. Today the handle just shows on your profile; future releases will use it for things like mentions and shareable profile links.',
          'Friendlier mail greetings. Welcome and notification emails now start with "Hi <first name>" instead of the full legal name — feels more personal, especially in a martial-arts context. Audit / legal emails (account-deletion confirmation, support tickets) keep the formal full-name shape.',
        ],
      },
      {
        heading: '🐛 v1.19.0 follow-ups — invitation card error mapping',
        bullets: [
          'Owner-side invite errors now show the right message. A subtle wire-shape mismatch on /athletes/:id/account-invitation-card meant the "this email is already a Budojo user" and "athlete has no email on file" cases were falling through to a generic toast. Both now render the dedicated friendly copy, the way they do on the rest of the app.',
          'Profile-name whitespace bug. Typing only spaces on the inline name edit no longer trips a server 422 — the validator now catches the empty-after-trim case locally and shows the same "name is required" inline error you\'d see on a truly empty input.',
          'OpenAPI schema typo. The sent_at field on the invitation block was documented as nullable but always emitted as a string — the spec now matches the actual contract.',
        ],
      },
    ],
  },
  {
    version: 'v1.19.0',
    date: '2026-05-06',
    headline:
      'Two follow-ups to the v1.18 athlete-login first-slice land in this release. The owner-side button to invite an athlete from the detail page — flagged as "queued for the next release" in v1.18\'s release notes — is now wired and live. And on the personal-account side, you can finally edit your own display name without contacting support.',
    sections: [
      {
        heading: '🥋 Athlete invitation — owner-side button',
        bullets: [
          'Invite an athlete from the detail page. Open any athlete in your roster who has an email on file and you\'ll see a new "Account & invitation" card under the header. One click sends the invite email; the card flips to an "Invitation sent on … expires …" chip with "Send again" and "Revoke" buttons next to it. When the athlete eventually accepts the invite, the same card switches to "Athlete registered on …" so you know the round-trip closed.',
          'No-email empty state. When the athlete has no email on file, the card shows a short explanation pointing you at the email field on the edit form — rather than a disabled button with no context. Add the email, come back, and the Invite button shows up.',
          'Anti-mistake guards. The "Revoke" button asks you to confirm before pulling the link, so a slipped click doesn\'t lock the athlete out. Sending the invite to an email that\'s already a Budojo user returns a friendly "ask them to sign in instead" message instead of a generic error.',
          'Localized. Every label, chip, toast and confirm copy ships in English and Italian, switching live with the sidebar locale toggle. The expiry / sent dates render in DD/MM/YYYY format keyed off your active language.',
        ],
      },
      {
        heading: '👤 Account — edit your own name',
        bullets: [
          "Inline edit on /dashboard/profile. Your display name now has a small pencil icon next to it. Click it, type the new name, hit Save — that's it. The new name shows up immediately on the topbar avatar fallback and anywhere else the SPA reads your name from. Cancel restores the previous value without a network round-trip.",
          'Email change deferred. Changing the email address is the heavier half of the same flow — it needs a verify-the-new-address email round-trip and a "pending change" banner so we can be sure you actually own the new address. That part lands in a future release; for now, the email row stays read-only.',
        ],
      },
      {
        heading: '🛠 Behind the scenes',
        bullets: [
          'Two Italian phrases that leaked into v1.18\'s English release notes (this same page) are fixed — "Invita al sistema" → "Invite to the system", "Contatta il supporto" → "Contact support".',
          "A non-production safety net for outbound mail: in any environment that isn't production, every email is redirected to a single test address rather than the real recipient. Means a misconfigured staging deploy can't accidentally ship real onboarding mail to real customers. Fully invisible in production — no behavior change on the real app.",
        ],
      },
    ],
  },
  {
    version: 'v1.18.0',
    date: '2026-05-05',
    headline:
      'Two themes in one release. The two "talk to us" pages folded into a single support channel — fewer choices, screenshot attachment in the right place, app version + browser info attached automatically. And the first slice of the athlete-side login lands: an academy owner can now invite a roster athlete by email, the athlete clicks, sets a password, and shows up in Budojo as themselves. The full athlete dashboard pages (own attendance / payments / documents) come next milestone.',
    sections: [
      {
        heading: '🥋 Athlete login — first slice',
        bullets: [
          'Invite an athlete from the system. On any athlete in your roster who has an email on file, the API now accepts an "Invite to the system" call that emails them a one-click link to set a password and land in Budojo as themselves. The link is valid 7 days; clicking it twice returns a friendly "already accepted, sign in instead" page. The owner-side button that wires this into the athlete detail UI is queued for the next release — for now the API + the athlete-side flow are live.',
          "Athlete-side accept page. The link in the invite email opens at /athlete-invite/{token} — a focused, single-task page that shows the athlete's name + email pre-filled (read-only), asks for a password and the same privacy + ToS checkboxes as registration, and on submit auto-logs them into Budojo. If the link is expired / revoked / already accepted, a friendly error page suggests signing in or asking the academy for a new invite.",
          'Welcome page. After accepting the invite the athlete lands on /athlete-portal/welcome — a simple "your account is ready, the rest of the athlete dashboard ships next milestone" placeholder. The full athlete-side pages (Profile / My academy / My attendance / My payments / My documents) are intentionally deferred so we can ship the schema + onboarding flow safely first.',
          "Owner experience: unchanged. The dashboard, the sidebar, every existing screen — all identical. The new athlete users are kept in their own URL space and behind their own role gate, so an owner that doesn't use the invite feature notices nothing.",
          "Public registration stays owner-only. Athletes can NEVER self-register through the public sign-up form — the only way into Budojo as an athlete is through an academy owner's invite. Hard rule, deliberately not negotiable in this release.",
        ],
      },
      {
        heading: '💬 One contact channel instead of two',
        bullets: [
          '"Send feedback" is gone. The dedicated /dashboard/feedback page has been retired and folded into /dashboard/support. Same destination inbox, same private routing — but a single sidebar entry under "Contact support" instead of two near-identical ones. The icon in the sidebar changes from a life-ring to a speech-bubble to match the friendlier tone.',
          'A new "Feedback" category. When you\'d rather share input than ask for help, pick the Feedback category — same form, same place, but the support team filters by category so they can prioritise. Five categories now: Account / Billing / Bug / Feedback / Other.',
          'Screenshot attachment migrated. The screenshot upload that lived only on the old feedback form is now part of the support form. Drop in a PNG / JPEG / WEBP up to 5 MB and it lands attached to the email we receive — same as before, just in the new place.',
          'App version + browser info auto-attach. Your current Budojo build tag and your browser / OS info are now stamped onto every support submission automatically. You no longer have to type "v1.16.4 on Chrome 120 / Android 14" into the body — it\'s in the email metadata when we receive it.',
        ],
      },
      {
        heading: '🛠 Behind the scenes',
        bullets: [
          'The API endpoint /api/v1/feedback is gone. The single /api/v1/support endpoint now accepts the optional screenshot via multipart/form-data and reads the X-Budojo-Version header that the SPA stamps on every API call. Public OpenAPI spec updated accordingly.',
          "New users.role enum (owner | athlete) + an athlete_invitations table. The discriminator gates every existing dashboard route — owners go to /dashboard, athletes go to /athlete-portal — so the two personas can't accidentally trip over each other's screens.",
          'The invite token never leaves the database in plaintext. We store a SHA-256 hash; the raw URL-safe token only exists in the email body and the request URL. The accept endpoint hashes the URL-presented token and looks up by hash, so a database read leak does not yield live invitations.',
        ],
      },
    ],
  },
  {
    version: 'v1.17.0',
    date: '2026-05-05',
    headline:
      'A heavy account-and-trust release. Eight features land together: a brand-new help / FAQ page, a dedicated support contact form, change-your-password from the profile, upload your own avatar, plus the legal scaffolding (Terms of Service + cookie banner + cookie policy) Budojo needs before serving customers in the EU. On the resilience side: a friendly server-error page, an offline page, and the login form now rate-limits brute-force attempts.',
    sections: [
      {
        heading: '🆘 Help & support',
        bullets: [
          'In-product help & FAQ. A new public /help page collects every common question — "how do I add an athlete", "what does the medical-certificate digest do", "how do I export my data" — into a single searchable list. Type any keyword (English or Italian) and the matching answers surface as you type. Lives in the sidebar under "Help".',
          'Dedicated support form. A new /dashboard/support page lets you file a request directly with the team. Pick a category (account / billing / bug / other), write a subject + a description, and it lands in our support inbox. Replies come back to the email on your account, so you can keep the conversation in your usual mailbox.',
        ],
      },
      {
        heading: '👤 Account',
        bullets: [
          'Change your password. A "Change password" entry on the Profile page lets you rotate your password without the forgot-password email round-trip. Asks for your current password as a re-auth gate, then for a new one twice. Every other active session on your account (other browsers, other devices) is signed out as a precaution; the tab you\'re using stays signed in.',
          'Upload your own avatar. The circular avatar in the top-right corner used to be your initials. You can now upload a real photo from Profile → Edit avatar — browse-and-upload, replace it any time, or remove it to fall back to initials. Renders in the topbar and on the profile page.',
        ],
      },
      {
        heading: '⚖️ Legal & compliance',
        bullets: [
          'Terms of Service page. A new public page at /terms carries the Service Agreement, with an Italian version at /terms/it. Both pages link to each other and follow the same layout as /privacy and /sub-processors.',
          'Acceptance gate on registration. The sign-up form now asks you to tick a checkbox accepting the Terms of Service alongside the existing privacy-policy checkbox. Existing accounts are unaffected.',
          'Cookie consent banner. A first-visit banner explains what storage Budojo writes to your browser and lets you accept all, reject non-essential, or open a "Customise" dialog with per-category toggles (essentials always on, preferences / analytics / marketing opt-in). Your choice is remembered so the banner does not keep popping up.',
          'Cookie policy page. A new public /cookie-policy page (Italian at /cookie-policy/it) documents every category in detail — what we store, why, how long, and how to change your mind. Same chrome as the other legal pages.',
        ],
      },
      {
        heading: '🛡️ Resilience',
        bullets: [
          'Login rate limit. The sign-in form is now capped at 5 password attempts per minute from the same network — past that you wait a minute before trying again. Closes the door on automated password-guessing without being noticeable to a real user fat-fingering their password a few times.',
          'Server-error landing page. A new /error route renders a clear "something went wrong" page with a "Try again" button and a link back to the dashboard, in place of the browser\'s stack-trace screen for hand-typed deep-links or link-outs from monitoring.',
          'Offline page. A new /offline route shows a friendly "you\'re offline" message with a "Retry" button. The SPA\'s network interceptor sends you here when a request fails with no network at all, and the page lives outside the dashboard shell so it works even before the dashboard chunk has loaded.',
        ],
      },
    ],
  },
  {
    version: 'v1.16.0',
    date: '2026-05-04',
    headline:
      'The biggest release since the original Documents launch. Six new emails wired end-to-end via a real queue worker, a stuck-on-old-bundle bug class closed at the Service Worker layer, plus polish on the legal pages and the date pickers.',
    sections: [
      {
        heading: '📧 Emails everywhere now',
        bullets: [
          'Forgot password. A "Forgot your password?" link on the sign-in page sends a recovery link to your inbox; click → set a new password → sign in. Tokens are one-shot and expire after 60 minutes.',
          'Welcome on sign-up. A friendly welcome email when you create your account, with a link straight to the academy-setup wizard. Goes out alongside the existing email-verification message.',
          'Account-deletion confirmation. When you click "Delete account" in your profile you now get an email confirming the request, the scheduled execution date (30 days out), and a clear path to cancel by signing back in. Removes the "did Budojo register my deletion?" anxiety.',
          "Medical-certificate expiry digest. A daily 9:00 AM email per academy listing every athlete whose medical certificate hits the 30 days, 7 days, or 0 days remaining thresholds. The digest only fires when there's actually something to chase — quiet weeks stay quiet.",
          'Unpaid-athletes monthly digest. On the 16th of each month at 9:00 AM, a digest listing every active athlete still unpaid for the current month. Pre-15 most customers settle in the typical month-start window, so emailing earlier would just be noise. Suspended and inactive athletes never appear in the chase-list.',
          'Localised dates in the picker. When you switch the SPA to Italian, the calendar pop-over now reads in Italian too — January / February becomes Gennaio / Febbraio, weekday abbreviations follow suit. Previously the picker ignored the language switch.',
        ],
      },
      {
        heading: '🛡️ Stuck-on-old-bundle: closed at the Service Worker layer',
        bullets: [
          'A reported recurring annoyance — "I have to clear browser cache manually to see the new version" — turned out to be the Angular Service Worker entering its SAFE_MODE state during the v1.14.x blank-page hotfix run. Once a worker is in SAFE_MODE, the auto-reload logic shipped in v1.10.0 is silently inert: the version check never resolves, the auto-reload never fires, the user is stranded on the old bundle forever.',
          "Fix: when the SW signals it's unrecoverable, the SPA now unregisters every active worker and reloads the tab. The next request hits the network directly, picks up the latest deploy, installs a fresh SW, and the user is back on current. No manual cache clear needed.",
          "The Cloudflare worker also stamps no-cache headers on the SW manifest + the SPA shell — defence in depth so the file the SW polls for new versions can't be served stale by any intermediate cache.",
        ],
      },
      {
        heading: '🇮🇹 Italian /sub-processors page',
        bullets: [
          'The GDPR Art. 28 sub-processor disclosure now has an Italian translation at /sub-processors/it, mirroring the English page at /sub-processors. Both pages carry a language toggle so an Italian customer landing on the English URL can flip without re-navigating. Same pattern as /privacy ↔ /privacy/it from earlier this year.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          "Internal tooling: /prereview and /feedback-digest slash commands for project-local Claude workflows. Pre-push diff review by a fresh sub-agent, plus a customer-feedback batch synthesizer. Doesn't change anything you see.",
          'Tech-debt sweep run after v1.15.0 — small doc-drift fixes, a few new gotchas captured. No user-visible change.',
          'M5 milestone PRD checked in alongside M3 / M4 — gives the deploy walkthrough a permanent anchor for future contributors.',
        ],
      },
    ],
  },
  {
    version: 'v1.15.0',
    date: '2026-05-04',
    headline:
      'The marketing surface finally gets a real product shot, and the underlying cause of the v1.14.x blank-page hotfix run is closed at the Cloudflare edge — a structural fix rather than another patch on top.',
    sections: [
      {
        heading: '🖼️ Landing page: real product screenshot in the hero',
        bullets: [
          'A real screenshot replaces the placeholder. The home page (/) used to show a soft-coloured tile with the Budojo glyph in the centre as a stand-in until we had real captures. The hero now carries an actual phone-shaped screenshot of the Stats → Attendance heatmap with the Apex Grappling demo data — dense, glanceable, immediately recognisable as a working product.',
          'One strong shot, not a carousel. We picked the heatmap because it carries the most visual personality of any of the dashboard screens; the rest stays out of the hero so the page reads at a single glance. Multiple-image galleries can come back if conversion data ever justifies them.',
          '50 KB on the wire. The screenshot ships as a WebP image at quality 82, properly sized for high-DPR phones. No layout shift while it loads — the slot has fixed dimensions so the rest of the page paints first and the image fills in cleanly underneath.',
        ],
      },
      {
        heading: '🛡️ Stale-chunk blank page — closed at the Cloudflare layer',
        bullets: [
          'Recap. The v1.14.1 → v1.14.2 → v1.14.3 hotfix chain chased the same symptom (a blank dashboard after a deploy with a stale browser tab open) from three different angles. v1.14.2 added a frontend self-heal that recovers a stale tab via a one-time reload; v1.14.3 fixed an unrelated null-check on the Stats page. This release closes the actual upstream cause: how the Cloudflare CDN was responding to requests for files that no longer exist on the deploy.',
          'Direct cause. Cloudflare was configured to return our home page (HTML) with a 200 status code for any unknown path, including missing JavaScript chunk files. A browser asking for a missing chunk would receive an HTML page, fail to parse it as JavaScript, and crash the dashboard to blank. The Cloudflare layer now correctly returns a 404 for missing chunks and only serves the home page as a fallback for actual page-navigation requests (when you paste a deep link into a fresh tab, for example).',
          "Defence in depth. The frontend self-heal added in v1.14.2 stays in place. With this Cloudflare-level fix the self-heal should no longer ever trip in normal conditions; if it does, it indicates a different cache-mismatch class we haven't anticipated — and the safety net still recovers the page cleanly.",
          'Invisible if your tab is current. If your browser was running v1.14.3 or later, this release looks identical to before — the upstream fix simply removes the conditions under which the v1.14.x bug could fire again.',
        ],
      },
    ],
  },
  {
    version: 'v1.14.3',
    date: '2026-05-04',
    headline:
      'The actual fix for the Stats page blank-on-first-click that v1.14.1\'s preload change tried — and failed — to nail. Clicking "Stats" in the sidebar after navigating around the dashboard now lands on the page first time, every time, with no detour through F5.',
    sections: [
      {
        heading: '🐛 Stats blank page on first in-app navigation — fixed',
        bullets: [
          'Direct cause: a defensive `?` missing in one place. The Stats parent page reads the active tab from the current URL the moment it mounts. Under certain timings — specifically when entering Stats from another dashboard page, with the new "preload everything" behavior from v1.14.1 — the route information the page reads from is briefly in a half-built state. The previous code assumed it was always fully populated and crashed silently on the missing field, leaving the dashboard chrome on screen and the content area blank.',
          'Three more `?` characters and the chain falls back gracefully. With the fix, every step of the lookup is now optional, so any transient half-state cleanly falls back to the default "Overview" tab and the page renders normally on first try. Hard refresh (F5) is no longer required.',
          'Regression-pinned. A new test simulates the exact half-built route state that crashed prod and asserts the page still renders cleanly. So if a future change re-introduces the same shape of bug, CI catches it before it reaches you.',
        ],
      },
      {
        heading: "🧹 Behind the scenes (continuing v1.14.2's work)",
        bullets: [
          'v1.14.2 shipped an auto-recovery safety net for stale-bundle navigation failures (see the v1.14.2 entry below). That code is unrelated to this fix and stays as belt-and-braces for a different class of cache-related failure.',
        ],
      },
    ],
  },
  {
    version: 'v1.14.2',
    date: '2026-05-04',
    headline:
      'A behind-the-scenes safety net. No user-visible feature changes; just an extra layer that catches a class of cache-related navigation failures and self-heals automatically with a single page refresh, instead of leaving the app stuck on a blank screen.',
    sections: [
      {
        heading: '🛡️ Auto-recovery from stale-bundle navigation failures',
        bullets: [
          "Self-heal on stale chunks. If the app's main bundle in your browser ever ends up out of sync with the deployed code (a rare consequence of the way our hosting serves the SPA shell), a navigation that would previously have crashed silently to a blank page now reloads the tab once and recovers. You'll see a brief flash; afterwards everything works normally.",
          "Anti-loop guards. Two layers — one in-memory, one persistent across the reload — make sure the page can't get stuck in a refresh loop. If a single recovery attempt doesn't resolve the issue, the app stops reloading and surfaces the original error in the developer console rather than re-trying forever.",
          '30-second auto-rearm. After 30 seconds without crashing, the persistent guard clears itself, so a long-lived browser session can recover again on a future deploy mismatch.',
        ],
      },
    ],
  },
  {
    version: 'v1.14.1',
    date: '2026-05-04',
    headline:
      "A small follow-up release on top of v1.14.0's brand-new Stats section. One visible fix — clicking Stats the first time after signing in no longer flashes a blank page — plus a handful of behind-the-scenes polish-ups so the new endpoints behave consistently with the rest of the API.",
    sections: [
      {
        heading: '🐛 First-click blank page on Stats — fixed',
        bullets: [
          'Pre-warmed Stats bundles. After v1.14.0, the very first click on the Stats sidebar entry occasionally rendered a blank page that disappeared on a refresh. Cause: the Stats page is built from two lazy bundles that had to land back-to-back before the page could paint, and the second one was sometimes still in flight when the router called for it. The app now warms the Stats bundles in the background as soon as the dashboard finishes loading, so by the time you click Stats both pieces are already in the browser cache and the page renders instantly.',
          "Snappier first clicks elsewhere. Side benefit of the same fix: every other section's first click — Athletes, Attendance, Payments — feels a little snappier too, because their bundles are pre-warmed in the background by the same mechanism.",
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'API error envelope consistency. The stats endpoints (/api/v1/stats/attendance/daily, /api/v1/stats/payments/monthly) used to fall back to Laravel\'s default HTML error page in the rare case where an authenticated user had no academy attached. They now return the same {"message":"Forbidden."} JSON envelope every other authenticated endpoint emits, so the SPA\'s error handling reads them uniformly.',
          "Locale helper centralised. The pieces of the heatmap that format dates and short month names now flow through a single localeFor() helper instead of a hand-rolled 'it' ? 'it-IT' : 'en-US' ladder. No visible change today; the cleanup makes adding a third or fourth language (Spanish + German on the roadmap) a one-line edit instead of a hunt-and-update sweep.",
          "Test coverage on the new locale paths. Two new unit tests pin the heatmap's tooltip + month label output in both English and Italian — so a future regression that re-introduces the wrong locale is caught in CI, not by a beta tester.",
        ],
      },
    ],
  },
  {
    version: 'v1.14.0',
    date: '2026-05-03',
    headline:
      'The headline this month: a brand-new Stats section in the dashboard. See your academy at a glance — belt distribution, the IBJJF age-division histogram, an attendance heatmap that paints the last twelve months at once, and a monthly revenue chart. Plus a small swap on the home dashboard: the "8/9 · 87%" attendance counter becomes a proper progress knob, and the whole app now formats currency and dates according to the language you\'ve chosen, so an Italian user reads "€50,00" / "3 mag 2026" instead of "€50.00" / "May 3, 2026".',
    sections: [
      {
        heading: '📊 New Stats page',
        bullets: [
          '/dashboard/stats is live. A new entry in the sidebar opens a four-tab surface: Overview, Athletes, Attendance, Payments. Each tab paints a single chart that answers one question — no dense tables, no exports to wrangle.',
          'Overview tab — belt distribution. A doughnut chart of every belt on the roster, ordered by the canonical IBJJF rank progression (kids → adults → senior coral / red). Hover any slice to see the absolute count and the percentage of the academy.',
          'Athletes tab — IBJJF age divisions. A histogram across all 13 IBJJF age-divisions (Mighty Mite through Master 7) with the count of athletes whose age today falls in each band. Empty divisions still show as zero so you read the full distribution at a glance. Athletes with no date of birth on file are surfaced as a separate "missing date of birth" footnote so the histogram numbers stay honest.',
          'Attendance tab — yearly heatmap. A GitHub-contributions-style heatmap of daily check-ins, with a 3 / 6 / 12 month range selector. Each cell is hued by month so the chart reads as a rhythm of the year, not just intensity. Hover any cell to see the date and the count for that day.',
          'Payments tab — monthly revenue. A bar chart of revenue per month over the trailing 12 months (extendable to 24). Buckets with no payments still appear at zero so the chart is continuous instead of punctuated by gaps.',
        ],
      },
      {
        heading: '🥁 Attendance counter — knob instead of "8 / 9"',
        bullets: [
          'Knob in place of "8 / 9 · 87%". The home-dashboard attendance widget swapped its text counter for a proper PrimeNG progress knob. Same data, but a glance at the curve tells you "near full" or "half empty" without doing the percent math in your head. The text count stays inside the knob so anyone wanting the exact ratio can still read it.',
        ],
      },
      {
        heading: '🌍 Locale-aware formatting',
        bullets: [
          'Currency. Italian users see "€50,00" with a comma, English users see "€50.00" with a dot — without ever leaving the page. Toggling the language flips every monetary amount the SPA prints (Payments tab, athletes-list paid badges, monthly summary).',
          'Dates. Same treatment for dates and short month names — "3 mag 2026" in Italian, "3 May 2026" in English (we use the British format because it\'s day-first, like Italian, while keeping English vocabulary). Day-first ordering is consistent across the whole app instead of mixing US-style "May 3, 2026" into Italian sentences.',
          'Reactive. The toggle takes effect live — no reload, no second tab refresh.',
        ],
      },
      {
        heading: '🐛 Stats fixes (same release)',
        bullets: [
          'Heatmap fills correctly on first paint. The cell colors now resolve immediately when the page renders, instead of briefly painting as flat grey before the per-month hue lands.',
          'Charts read with one consistent color. Bars and slices were briefly using a rotating palette; they\'re now monocolor against the academy\'s primary accent, so a glance at the chart tells you "this is one academy" rather than "this is twelve unrelated categories".',
          'No more redirect race after login. Logging in and landing on the dashboard occasionally raced against an in-flight chart fetch; the redirect path is now serialised so the chart always paints from a known state.',
        ],
      },
    ],
  },
  {
    version: 'v1.13.0',
    date: '2026-05-03',
    headline:
      'The headline this month: the dashboard now speaks Italian everywhere. v1.12.0 covered the pages you use day-to-day; v1.13.0 finishes the job — every screen, every form field, every tooltip and dropdown reads in Italian when you toggle the language. After this release there is nowhere left in the dashboard where Italian users see English by mistake.',
    sections: [
      {
        heading: '🌍 Italian translation completes the dashboard',
        bullets: [
          'Athlete detail tabs. Open any athlete and the four sub-tabs read in Italian end-to-end: Documenti (column headers, "Aggiungi documento", download/elimina tooltips, empty states), Presenze (the eyebrow, the "X / Y giorni" counter, the prev/next-month buttons, the day-cell screen-reader labels), Pagamenti (the "Pagamenti — 2026" title, the no-fee hint, every column header and button, the "Segna pagato" / "Annulla pagato" actions), and the header itself (the back link "Atleti", the joined-on date, the contact-link aria-labels).',
          'Athlete form, every label. Add or edit an athlete and every visible label reads in Italian: Nome, Cognome, Telefono (with the country-code dropdown showing "+39 Italia / +33 Francia / +44 Regno Unito / …"), Cintura (Bianca / Blu / Viola / Marrone / Nera / Rossa e nera / Rossa e bianca / Rossa), Stato (Attivo / Sospeso / Inattivo), the address fieldset with localised placeholders. The "Aggiungi atleta" / "Modifica atleta" titles and the "Crea atleta" / "Salva modifiche" buttons match the action being performed.',
          'Validation messages too. Submit a form with empty required fields and the inline errors come back in Italian: "Il nome è obbligatorio", "L\'email non è valida", "Il prefisso è obbligatorio se inserisci un numero", "Il CAP deve essere di 5 cifre". Every guard the form runs has a translated message — no more English errors mixed into Italian forms.',
          'Sidebar fix. "Academy" in the sidebar was still reading in English even on the IT locale because the translation key was missing. Now reads "Accademia" as it should.',
          'Reactive language toggle. The dropdowns (belts, statuses, country codes) all update live when you flip the language — no need to refresh the page.',
        ],
      },
      {
        heading: '🛠 Behind the scenes',
        bullets: [
          "Cloudflare deploy reliability. A configuration drift between our internal commit conventions and the release tagging tool meant some urgent fixes weren't producing a tag (silently). Sorted — every commit type the team uses now produces a tag and a release entry on the right cadence.",
          'Frontend dependency refresh. Angular runtime + tooling moved up to the latest patch level (21.2.11 / 21.2.9) and the test environment jumped a major version (jsdom 28 → 29). No visible behaviour change; foundation for the bigger Cypress + TypeScript bumps still on the roadmap.',
        ],
      },
    ],
  },
  {
    version: 'v1.12.0',
    date: '2026-05-02',
    headline:
      'The headline this month: the dashboard speaks Italian. Every screen you use day-to-day — Profile, Athletes, Attendance, Documents, Academy — flips between English and Italian with a single toggle in the sidebar. And Budojo finally has a public landing page at the root URL, so prospects landing on budojo.app see what the product is before being asked to log in.',
    sections: [
      {
        heading: '🌍 Italian translation across the dashboard',
        bullets: [
          "Sidebar language toggle, EN ↔ IT. Pick your language once from the sidebar and the whole dashboard flips: buttons, table headers, filter dropdowns, tooltips, confirm dialogs, toast messages, error states, empty states. The choice persists per device — close the browser, come back tomorrow, and you're still in the language you picked.",
          'Five areas covered. Profile (your account page), Athletes list (titles, filters, sort tooltips, paid badges, mark-paid / mark-unpaid confirms), Attendance (daily check-in + monthly summary + the home-dashboard widget), Documents (the cross-athlete expiring list and its dashboard widget), and Academy (the read-only detail page + the edit form, including the training-days picker).',
          'Locale-aware month names. When you toggle to Italian, the "Paid · Apr" column header reads "Pagato · apr", and the mark-paid confirm dialog reads "Segnare Mario Rossi come pagato per maggio 2026?" instead of mixing English month names into Italian sentences.',
          'Italian belts and statuses respect the IT register. "Cintura blu" not "Belt blu", "Sospeso" / "Inattivo" / "Attivo" with masculine agreement (atleta is the implicit subject), "Pagato" / "Non pagato" for the paid status. Nothing reads like a machine translation.',
        ],
      },
      {
        heading: '🚪 Public landing page',
        bullets: [
          'Visit budojo.app and see the product. The root URL now serves a public landing page explaining what Budojo does, with clear "Log in" and "Sign up" entry points. Previously the root redirected straight to the login form, which read as cold to prospects and gave first-time visitors no context for what they were logging into.',
          "Logged-in users are unaffected. If you're already authenticated, the landing page sends you straight to the dashboard the same way the old root did. Bookmarks to dashboard URLs keep working unchanged.",
        ],
      },
    ],
  },
  {
    version: 'v1.11.0',
    date: '2026-05-01',
    headline:
      'The headline this month: a new "Unpaid this month" widget on the dashboard home, so the second half of the month tells you who you still need to chase. Plus a couple of cosmetic polishes — payment rows no longer jump in height, the date pickers across the app finally read as a single rounded control.',
    sections: [
      {
        heading: '🛟 Chasing payments',
        bullets: [
          '"Unpaid this month" widget on the dashboard home. New tile on the dashboard, alongside the expiring-documents tile and the monthly-attendance tile. Shows you a count of athletes who haven\'t paid the current month yet, plus the first 5 names as direct links to each athlete\'s Payments tab. Tap "View all" to land on the athletes list filtered to the unpaid set. The widget appears from the 16th of the month onwards — first half is "still early"; second half is "actually chase". Hidden completely if the academy doesn\'t track payments through Budojo (no monthly fee configured = no widget).',
        ],
      },
      {
        heading: '🐛 Cosmetic polishes',
        bullets: [
          'Payments tab — finishing the row-height fix from v1.10.0. v1.10.0 promised the Payments tab rows would line up; in practice the future-month rows (the ones with a dash placeholder) still rendered visibly shorter than the rows with an icon button. The dash placeholder now matches the icon-button height exactly, so paid / current-month / future-month rows are all the same height and the table reads as a clean grid.',
          'Date pickers read as one control. Every form field with a calendar icon (Date of birth, Joined, Document expires_at / issued_at, daily attendance) now renders as a single rounded outer shell instead of two visually-detached pieces. Hover and focus light up the whole composite, not just the input.',
        ],
      },
    ],
  },
  {
    version: 'v1.10.0',
    date: '2026-05-01',
    headline:
      'A new way to talk back to us, plus a pair of behind-the-scenes upgrades that mostly fade away — which is the point.',
    sections: [
      {
        heading: '🛟 In-app feedback',
        bullets: [
          "Send feedback right from the dashboard. A new \"Send feedback\" entry sits in the sidebar (just above What's new). Open it, write a subject + a description, optionally drop in a screenshot, and it lands directly in our inbox. The current app version and your device info are attached automatically — so when something looks off, you don't have to remember which version you're on or which browser you're using.",
        ],
      },
      {
        heading: '⚡ Auto-update',
        bullets: [
          "The app refreshes itself when a new version ships. Until now, Budojo would keep running the bundle that was cached on your device until you hard-refreshed the page. From now on, when a new version is available the app activates it and reloads on its own — including a periodic check during long sessions on a phone. Trade-off: if a reload happens while you're mid-form, anything you hadn't saved is lost. Forms here are short, so the win (you're always on the latest fix) outweighs the cost.",
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Payments list rows line up at last. On the athletes\' Payments tab, the "mark paid" / "unmark paid" controls and the empty-month placeholder all share the same row height now, so the table reads as a clean grid instead of a slightly jumpy one.',
        ],
      },
    ],
  },
  {
    version: 'v1.9.0',
    date: '2026-05-01',
    headline:
      'The Italian rollout reaches the screens you see before you ever sign in: login, register, the email-verify pages, and the setup wizard now flip languages alongside the dashboard nav. Plus a tighter Athletes flow — Edit moves inside the athlete page where it belongs — and a smarter "Paid" column that finally tells you which month it\'s checking.',
    sections: [
      {
        heading: '🌍 Languages',
        bullets: [
          "Italian arrives on the auth flow + setup wizard. Sign in, register, the verify-email landing pages, the setup wizard, the dashboard chrome (top bar + brand area), and the 404 page now all speak Italian when you've toggled the language. Pre-seeds itself from the language you picked inside the dashboard, so the experience stays consistent the moment you sign back in.",
          'Privacy policy now defaults to English. Hitting /privacy cold (without a language preference) lands you on the English version — matching the new English-first product direction. The Italian version lives at /privacy/it and is one tap away via the toggle at the top of each page.',
        ],
      },
      {
        heading: '🥋 Athletes',
        bullets: [
          'Edit lives inside the athlete now. The "Edit" tab sits next to Documents, Attendance, and Payments on each athlete\'s page, instead of being a separate screen you bounce out to. Saving or cancelling keeps you on that athlete — same place you were when you opened the form. The list also drops the redundant folder icon: tap the athlete\'s name to open their page (the standard list-link pattern).',
          'The "Paid" column tells you which month it\'s checking. The athletes list now writes the current month right in the column header (e.g. "Paid · May") so a glance at the table tells you whether someone\'s up to date for the month you\'re actually in — no more guessing whether the toggle is for last month or this one.',
        ],
      },
      {
        heading: '🛡️ Profile',
        bullets: [
          '"Your data" card stacks vertically. The GDPR export card under Profile — the one with the description and the "Download my data" button — now stacks cleanly on narrow screens so the hint text and the button stay readable and easy to tap on a phone.',
        ],
      },
    ],
  },
  {
    version: 'v1.8.0',
    date: '2026-04-30',
    headline:
      'Two changes on the way to going international plus a couple of paper-cuts smoothed over. Pick your language from the sidebar — English is the new default, Italian one click away — and finally set the monthly fee that makes the Payments tab actually do its job.',
    sections: [
      {
        heading: '🌍 Languages',
        bullets: [
          "English by default, Italian one tap away. A new language toggle lives in the sidebar, just above the version footer. Pick English (default) or Italiano — your choice is remembered in your browser. Right now the sidebar nav and the Privacy policy switch language; the rest of the dashboard text is already English everywhere. We'll bring Italian translations to the dashboard pages in the next release.",
          'English Privacy policy added. Same content as the original Italian version, faithfully translated. A small Italiano · English toggle at the top of each version lets you flip between the two without losing your spot. (As of v1.9.0 the URL scheme changed: English now lives at /privacy and Italian at /privacy/it.)',
        ],
      },
      {
        heading: '💰 Payments',
        bullets: [
          'Set your monthly fee from the Academy page. Go to Academy → Edit and a new "Monthly fee" field is waiting. Once you set it, the Payments tab on each athlete profile activates, and the inline mark-paid toggle on the athletes list comes alive. Leave it empty if you don\'t want to track payments through Budojo — the toggle and the tab simply hide.',
        ],
      },
      {
        heading: '📐 Layout polish',
        bullets: [
          'Academy and Profile pages now centered on desktop. They were sitting flush against the left edge while the rest of the dashboard floated centered — small inconsistency, finally smoothed. No change on mobile.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'i18n framework live. ngx-translate wired into the SPA with a synchronous bundled-JSON loader, so the first paint of every screen is already translated (no flicker of raw keys). The plumbing is in place to roll Spanish and German translations onto the dashboard once we expand into those markets.',
        ],
      },
    ],
  },
  {
    version: 'v1.7.0',
    date: '2026-04-30',
    headline:
      'Payments tracking arrives. Mark whether each athlete has paid for the current month right from the roster, or open a per-athlete tab to see all twelve months at a glance.',
    sections: [
      {
        heading: '💰 Payments',
        bullets: [
          'Per-athlete payments tab. Open any athlete profile and the new "Payments" tab shows every month of the current year as a row — Paid / Unpaid status and the amount. Tap a row to toggle the state.',
          "Inline mark-paid on the athletes list. A quick toggle on each row of the athletes list flips the current month's payment state without leaving the roster. Useful at the start of the month when collecting fees.",
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Profile › Your data card now in English. Was leaking the Italian copy "Esporta i tuoi dati" — now matches the rest of the SPA\'s English UI.',
          "Pending-deletion banner shows on first sign-in. If you'd requested account deletion and signed back in within the 30-day grace window, the cancel-deletion banner sometimes didn't show until you reloaded. Fixed.",
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'Design system polish. Page widths and side padding now resolve through a small set of design tokens instead of being copy-pasted on every screen. No visible change — but adding a new screen now picks up the right chrome automatically.',
        ],
      },
    ],
  },
  {
    version: 'v1.6.0',
    date: '2026-04-30',
    headline:
      'A big compliance + privacy push, with full IBJJF belt support arriving alongside the legal scaffolding for our launch readiness.',
    sections: [
      {
        heading: '🛡️ Privacy & data control',
        bullets: [
          'Download a copy of your data. Open Profile → Your data and grab a ZIP with everything: academy details, athletes, payments, attendance, and uploaded documents.',
          'Delete your account. A new "Delete account" flow on the Profile page starts a 30-day grace window. Cancel anytime within those 30 days; after that, your data is wiped automatically.',
          'A real Privacy Policy at /privacy. GDPR Art. 13, in Italian. Shipped as a draft pending lawyer review — the technical facts are accurate today.',
          'Sub-processors page at /sub-processors. Full disclosure of every third party that touches your data, with a 30-day notice window before any change.',
          'No cookie banner needed. We audited every cookie and storage entry the SPA writes. Result: zero tracking cookies, only two strictly-technical localStorage keys.',
        ],
      },
      {
        heading: '🥋 Athletes & belts',
        bullets: [
          'Full IBJJF belt support. Every belt and rank is now in the dropdown — kids (grey, yellow, orange, green), adults (white, blue, purple, brown, black with graus), and senior (red-and-black 7°, red-and-white 8°, red 9°+).',
          'Per-belt stripe limits. Black belts go up to 6 graus; everyone else stops at 4. Red belts have no graus by definition.',
        ],
      },
      {
        heading: '📱 Mobile fixes',
        bullets: [
          'Phone country-code prefix renders cleanly on Pixel 8 Pro. No more "+..." ellipsis swallowing the country code on narrower viewports.',
          'Profile page is tighter on mobile. Removed huge vertical gaps between labels and values — now stacks naturally on phones, keeps the two-column layout on tablet and up.',
        ],
      },
      {
        heading: '🧹 Behind the scenes',
        bullets: [
          'The register form now requires an explicit "I have read the privacy policy" checkbox.',
          'New multi-viewport Cypress test infrastructure so layout regressions on Pixel-class phones get caught in CI, not by beta testers.',
        ],
      },
    ],
  },
  {
    version: 'v1.5.0',
    date: '2026-04-29',
    headline:
      'Beta-tester feedback round. Two small but visible fixes plus the start of full IBJJF coverage.',
    sections: [
      {
        heading: '🥋 Athletes & belts',
        bullets: [
          'Kids belts. Grey, yellow, orange, and green are now selectable on the athlete form — proper youth ranks instead of forcing kids onto an adult belt.',
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Phone country-code is clearable. Previously, once you picked a country code on the athlete form there was no way to remove it without picking a different one. Now you can clear the field entirely.',
          '404 page instead of a blank fallback. Typing a URL that doesn\'t exist no longer dumps you onto a white screen — you get a proper "page not found" with a link back home.',
        ],
      },
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026-04-29',
    headline: 'Contact links across the app, an attendance redesign, and a polished email layout.',
    sections: [
      {
        heading: '📞 Contact links everywhere',
        bullets: [
          'Academy contacts. Phone, email, Instagram, website, Google Maps — fill them on the academy form, and they render as tappable chips on the academy detail page.',
          'Athlete contacts. Same pattern on the athlete profile: phone (with country code), email, Instagram. Tap a chip and your phone or email client opens.',
        ],
      },
      {
        heading: '📋 Attendance',
        bullets: [
          'Daily check-in redesigned. The check-in screen now mirrors the athletes list layout — same row shape, same density. Easier to scan a long roster on a phone.',
          'Monthly summary headline updated. Instead of summing "training days" (a number that drifted from what coaches wanted to see), the page now leads with average athletes per session — a more useful gut check on attendance health.',
        ],
      },
      {
        heading: '📧 Emails',
        bullets: [
          'Branded transactional emails. Verification emails, deletion confirmations, and any future notifications now carry the Budojo wordmark and our indigo accent color. No more generic Laravel template look.',
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Belt sort icon respects the active state. The little arrow next to the Belt column header now changes shape and color when Belt is the active sort — so you can see at a glance which column is sorting.',
        ],
      },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-04-29',
    headline: 'A handful of small UX improvements on the athletes list and the attendance flow.',
    sections: [
      {
        heading: '📋 Athletes list',
        bullets: [
          '4-state name sort. Tap the Full name column to cycle through first-name ascending, first-name descending, last-name ascending, last-name descending. Old behaviour was a single direction toggle.',
          'Bigger tap target. The full-name header button now fills the entire cell — easier to hit on a phone.',
        ],
      },
      {
        heading: '📅 Attendance',
        bullets: [
          "Smarter default day. Open the daily check-in screen and it lands on the most recent training day — not always today. If today isn't a training day in your weekly schedule, you don't have to manually scroll back to find the last one.",
        ],
      },
      {
        heading: '🐛 Fixes',
        bullets: [
          'Phone country-code spacing. A small visible gap between the country code dropdown and the phone-number input (used to render flush against each other).',
          'Version footer shows the real version. The bottom-of-sidebar tag now displays the proper "v1.3.0" instead of a bare commit SHA on production builds.',
        ],
      },
    ],
  },
];
