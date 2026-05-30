# Spec — Share external technique videos to the community feed

Epic: **#1153**. Extends the M9 community feed ([`m9-community.md`](./m9-community.md), #600).

## Problem / Goal

Athletes learn a lot of technique from short videos on Instagram, YouTube and TikTok. Today that knowledge stays on their phone. **Goal:** let athletes (and owners) drop a technique video into their academy's community feed so teammates can watch it, react, comment, and talk about drilling it in class — turning the feed into a shared, social technique library.

This is the first feed content type that **athletes** can author (today only owners post — events).

## V1 scope (locked with PO, 2026-05-30)

| Decision | Choice |
|---|---|
| Providers | **Instagram, YouTube, TikTok** — domain allowlist only |
| Who can post | **Athletes + owners**, post-moderated (owners delete via #641); no pre-approval |
| Preview | Facebook-style card: cover thumbnail + caption + provider glyph |
| Playback | **Tap-to-play facade** (see below) — plays inline in Budojo |
| Engagement | Existing reactions + comments |

## The tap-to-play facade (the load-bearing decision)

Inline playback of IG/TikTok needs the platform's own embed (third-party iframe + script), which conflicts with Budojo's "no trackers without consent" promise. We square the two with a **facade**:

1. By default we render a **first-party cover** (our cached thumbnail + a play button + provider glyph). **Nothing third-party loads** — no scripts, no cookies, no tracking.
2. On **tap**, we load the provider's official embed in a **sandboxed iframe** and the video plays **inline in Budojo**. Consent-by-action; the user chose to load that provider.

This is the GDPR-friendly "click-to-load" pattern used by privacy-conscious sites. It delivers "the video plays in Budojo" without breaking the privacy stance.

### Per-provider reality (from the 2026-05-30 spike, tested live)

| Provider | Cover thumbnail | Inline playback |
|---|---|---|
| **YouTube** | oEmbed (`youtube.com/oembed`) ✅ no key | `youtube-nocookie.com/embed/<id>` iframe ✅ reliable, privacy-enhanced |
| **TikTok** | oEmbed (`tiktok.com/oembed`) ✅ open, no key (CDN URL expires → cache) | oEmbed `html` blockquote + `embed.js` ✅ |
| **Instagram** | crawler-UA OG fetch (`facebookexternalhit` → `og:image`) ✅ **public only**, cache | `/<type>/<code>/embed/` iframe ⚠️ **best-effort** — IG may force click-out → **degrade to "cover + Open on Instagram"** |

Instagram is the weak link: public content only, ToS-bound, and reel playback may not embed. V1 attempts inline and **degrades gracefully** to a cover that opens the reel on Instagram. Worst case IG is still a nice cover card.

## Data model

Rides `community_posts` — **no new table**.

- New `CommunityPostType` case: `shared_video`.
- `payload` shape:
  ```
  {
    provider:      'instagram' | 'youtube' | 'tiktok',
    url:           original canonical URL,
    video_id:      provider video id / shortcode,
    thumbnail_path: our cached cover (storage path; CDN URLs expire + privacy),
    title?:        provider title,
    author_name?:  provider author handle/name,
    caption?:      the sharer's own note (user text)
  }
  ```

## API

- **Create** — open to athletes + owners: `POST /api/v1/community/posts` with `{ type: 'shared_video', url, caption? }`. The server resolves the preview (below), stores the cached thumbnail, and persists the post. 422 on a non-allowlisted / unresolvable URL.
- **Read** — `CommunityPostResource` projects the `shared_video` payload (provider, video_id, thumbnail url, title, author, caption) so the SPA renders the facade + the embed on tap.
- Documented in `docs/api/v1.yaml` + `docs/entities/community-post.md`.

## Server-side preview resolver (`ResolveVideoPreviewAction`)

1. **Validate** the URL host against the allowlist (`instagram.com`, `youtube.com`, `youtu.be`, `tiktok.com`, incl. `www.`). Reject anything else → 422.
2. **Resolve** metadata by provider: YouTube oEmbed, TikTok oEmbed, Instagram crawler-UA OG fetch.
3. **Download + store** the cover thumbnail to our storage (don't hotlink — CDN URLs expire and hotlinking leaks the viewer's IP to the provider).

### Security — SSRF guard (mandatory)

The resolver fetches a user-supplied URL → classic SSRF surface. Guards:
- Host **allowlist check before any network call** (only the four domains above).
- Resolve DNS and **reject private / link-local / loopback IPs** (no `10/8`, `127/8`, `169.254/16`, `192.168/16`, `::1`, metadata `169.254.169.254`).
- Request **timeout** + **response size cap**; do not follow redirects off the allowlisted hosts.
- Caption is **sanitized** (rendered as feed text).

## UX

- **Create:** from the feed composer (the ➕ / "Pubblica" surface), a **"Share a video"** option — available to athletes too (new). Paste URL → a **live preview card** resolves → optional caption → post. Loading + error states (unresolvable / private / non-allowlisted).
- **Feed tile:** provider-badged cover + play button + caption + author. Tap → inline embed in a sandboxed iframe (or, for IG degrade, opens the reel on Instagram). Reactions + comments below, same as any post.
- **Privacy affordance:** a small "loads <provider>" hint by the play button so the user knows a tap pulls in third-party content.

## Out of scope (V2)

- True inline IG reel playback when IG blocks the embed (degrade is V1).
- A dedicated **"want to drill it"** intent signal (reactions cover it for V1).
- Other providers (Vimeo, X, …).
- Abuse / content scanning beyond the domain allowlist.

## Slices

1. **#1154 — BE foundation:** `shared_video` type + payload + `ResolveVideoPreviewAction` (SSRF-guarded) + create endpoint open to athletes + Resource + docs. TDD per provider + permission + allowlist + SSRF.
2. **#1155 — FE:** composer "share a video" flow + tap-to-play facade tile.
3. **#1156 — IG validation + hardening:** confirm IG inline-vs-degrade with a real reel, sandbox/CSP, consent hint, edge states.

## Open risks

- **Instagram** is the fragile dependency (public-only, ToS, may block server OG fetch from datacenter IPs + may not embed reels). Mitigation: graceful degrade everywhere; cache aggressively; never hard-fail a share because IG metadata is missing (fall back to a plain provider card).
- Provider embed/oEmbed contracts can change — keep each provider behind its own small resolver so one breaking change is isolated.
