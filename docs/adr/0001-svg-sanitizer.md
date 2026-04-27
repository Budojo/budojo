# ADR 0001 — SVG sanitiser: keep hand-rolled, don't take the GPL dependency

**Status:** Accepted
**Date:** 2026-04-27
**Issue:** [#97](https://github.com/m-bonanno/budojo/issues/97)
**Driving constraint:** Budojo's roadmap includes commercial sale of the product (private repo + paid licenses or self-host distribution).

## Context

Academy owners can upload an SVG logo; the file is stored on the public disk and embedded as a `<img src=…>`. Browsers sandbox `<img>`-loaded SVGs from script execution, **but** a victim opening the image URL directly (right-click → "open in new tab") loads the SVG as a top-level document where scripts inside it DO run. We sanitise the file at upload time so the on-disk content is itself harmless, regardless of how it's later referenced.

The original sanitiser (PR #92) was hand-rolled `DOMDocument` walking. PR #96 attempted to swap it for `enshrined/svg-sanitize` — the de-facto industry library — but Copilot correctly flagged that `enshrined/svg-sanitize` is licensed **GPL-2.0-or-later** while the project's `composer.json` declares **MIT**. PR #96 reverted the swap and shipped only the unrelated `AcademyService.mutate()` helper. Issue #97 captured the unresolved decision.

## Options considered

### 1. Keep hand-rolled (status quo)

- ✅ No new dependency; no licence concern.
- ❌ Hand-rolled SVG sanitisers historically miss vectors uncovered by ongoing research (XXE, animation-attribute swaps, namespace abuse, percent-encoded scheme bypasses).
- ❌ The maintenance burden grows with the threat-model surface.

### 2. Swap to a permissive-licence alternative

Candidates from #97's body:

- **`darkghosthunter/svg-sanitizer`** — MIT, but a small community (single-maintainer, sporadic activity).
- **`heydays/svg-sanitizer`** — MIT, less battle-tested than the GPL leader; minimal CVE history.
- **`Symfony\Component\HtmlSanitizer`** — MIT, official Symfony component, BUT designed for HTML and lacks SVG-specific element/attribute knowledge out of the box. Would need substantial configuration to even approximate `enshrined/svg-sanitize`'s coverage.

### 3. Accept `enshrined/svg-sanitize` (GPL-2.0-or-later)

- ✅ Best coverage; mature; the reference implementation other libraries cite.
- ❌ **GPL-2.0 forces the same licence on derivative works that link to it.** For a SaaS-only deployment the practical effect is debated, but the moment we ship a self-host distribution, sell licenses, or distribute the source — the entire codebase must be GPL. That's a **product-defining** constraint we don't want to take on quietly.
- ❌ Investors, acquirers, and enterprise buyers run dependency licence audits as a matter of course. A GPL transitive in a product they'd want to extend or rebrand is a yellow flag at best, a deal-blocker at worst.

### 4. Pin a security review cadence on the hand-rolled implementation

Independent of the library choice; can layer onto option 1 or 2.

## Decision

**Option 1 + Option 4: keep the hand-rolled sanitiser, harden it for the known gaps now, and lock a yearly review cadence.**

The deciding factor is the commercial trajectory. We will not own a GPL dependency in a codebase we plan to sell. Among the permissive options, none is mature enough to outweigh the cost of swapping in a new dependency we'd then need to audit ourselves anyway. Owning the sanitiser is more honest: we keep the code small, we know exactly what it covers, and the maintenance burden is bounded by an annual review.

## What "hardening" means here

Concretely, on top of what shipped in #92, the implementation now also strips:

| Vector | Defence |
|---|---|
| `<embed>`, `<object>`, `<link>`, `<meta>` elements | Added to the dangerous-element list |
| `<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>` targeting `href` / `xlink:href` | Removed when `attributeName` is a hyperlink attribute (these can swap an inert href to `javascript:` at runtime, defeating the static attribute scrub) |
| `<use>` with cross-document `href` / `xlink:href` | Removed when not a same-document `#anchor` reference |
| Percent-encoded `javascript:` URIs (`%6Aavascript:…`) | `rawurldecode()` before scheme match |
| HTML-entity-encoded `javascript:` (`&#106;avascript:…`) | `html_entity_decode()` before scheme match |
| Whitespace / control-character padding (`\t`, `\n` before `javascript:`) | `preg_replace` strip before scheme match |
| `vbscript:` and `data:text/html` URI schemes | Added alongside `javascript:` to the URI blocklist |

Removed via `removeAttributeNode()` (not `removeAttribute(name)`) so namespaced attributes like `xlink:href` are actually stripped — the original implementation silently missed those.

`xmlns:*` namespace declarations carrying `javascript:` URIs are NOT a defended vector: PHP's DOM API treats them as namespace nodes, not attribute nodes, so they don't appear in `$element->attributes`. The practical attack surface is also narrow — modern browsers do not auto-resolve namespace URIs as scripts. Documented here so a future reviewer doesn't assume it was overlooked.

## Cadence

Reviewed: **2026-04-27** (this ADR).
Next review: **2027-04-27** or sooner if any of the following triggers fire:

1. A CVE lands in `enshrined/svg-sanitize` or another major SVG sanitiser — implies a vector we should mirror.
2. The OWASP SVG security cheat-sheet adds a new attack class.
3. The product moves to a multi-tenant deployment where a malicious tenant's SVG could affect a victim from another tenant (raises the impact substantially; may warrant re-evaluating option 2 with newly-audited libraries).
4. The licensing landscape changes (e.g. `enshrined/svg-sanitize` relicenses, or a credible MIT fork emerges with a real maintainer track record).

The reviewer (the maintainer) walks the current `UploadAcademyLogoAction::sanitizeSvg` against the OWASP cheat-sheet and any CVE list filed against SVG sanitisers in the prior 12 months, files a follow-up tightening PR if any new vectors apply, and re-stamps the ADR header date.

## Out of scope

- Multi-tenant logo isolation (separate disks, content-security-policy headers, cross-origin restrictions). Those are deployment concerns and don't replace upload-time sanitisation.
- A user-visible "this SVG was modified at upload" warning. The user's intent is to upload a valid logo; if our sanitisation removed a `<script>` they didn't know about, the modification is in their interest.
- Image-format conversion (SVG → PNG at upload). Removes the attack surface entirely but kills a legitimate use case (vector logos scale; raster logos blur) that the academies care about.

## References

- Issue [#97](https://github.com/m-bonanno/budojo/issues/97) — open question
- PR [#92](https://github.com/m-bonanno/budojo/pull/92) — original hand-rolled implementation (logo upload feature)
- PR [#96](https://github.com/m-bonanno/budojo/pull/96) — reverted GPL-library swap
- OWASP — [SVG security cheat-sheet](https://cheatsheetseries.owasp.org/cheatsheets/SVG_Security_Cheat_Sheet.html) (referenced for the vector list above)
- Choose a License — [GPL-2.0 implications for distribution](https://choosealicense.com/licenses/gpl-2.0/)
