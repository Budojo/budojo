<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class UploadAcademyLogoAction
{
    /** Element names whose mere presence is unsafe inside an SVG document. */
    private const DANGEROUS_ELEMENTS = [
        'script',
        'foreignobject',
        'iframe',
        'embed',
        'object',
        'link',
        'meta',
    ];

    /**
     * Animation primitives that can mutate attributes at runtime — including
     * `href` / `xlink:href`. We strip them when they target either, since the
     * static attribute scrub below can't see a value that only appears after
     * the timer fires.
     */
    private const ANIMATION_ELEMENTS = ['animate', 'animatetransform', 'animatemotion', 'set'];

    public function execute(Academy $academy, UploadedFile $file): Academy
    {
        $path = $file->store("academy-logos/{$academy->id}", 'public');

        if ($path === false) {
            throw new \RuntimeException('Failed to store uploaded academy logo.');
        }

        if (str_ends_with(strtolower($path), '.svg')) {
            $this->sanitizeSvg($path);
        }

        $previousPath = $academy->logo_path;

        $academy->forceFill(['logo_path' => $path])->save();

        if ($previousPath !== null && $previousPath !== $path) {
            Storage::disk('public')->delete($previousPath);
        }

        return $academy->refresh();
    }

    /**
     * Strip script-bearing constructs from an uploaded SVG so the file is safe
     * to serve from the public disk and embed in `<img>` tags. Browsers
     * sandbox SVGs loaded via `<img src=...>`, but a victim opening the URL
     * directly would still execute scripts inside the document. We address
     * that at upload time so the on-disk content is itself harmless.
     *
     * Hand-rolled by design (see `docs/adr/0001-svg-sanitizer.md`):
     * `enshrined/svg-sanitize` is GPL-2.0-or-later and incompatible with the
     * project's commercial-distribution roadmap; available MIT alternatives
     * are too small/under-tested to lean on. Owning the sanitiser ourselves
     * costs us a yearly review cadence in exchange for a clean licence.
     *
     * Removes:
     * - Dangerous elements: `<script>`, `<foreignObject>`, `<iframe>`,
     *   `<embed>`, `<object>`, `<link>`, `<meta>`.
     * - Animation elements that target href/xlink:href (`<animate>`,
     *   `<animateTransform>`, `<animateMotion>`, `<set>`) — they can swap
     *   an inert href to `javascript:` at runtime, defeating the static
     *   attribute scrub below.
     * - `<use>` elements with cross-document hrefs (only same-document
     *   `#id` references survive).
     * - `on*` event attributes anywhere.
     * - Any attribute whose value resolves to a `javascript:`, `vbscript:`,
     *   or `data:text/html` URI after percent / entity / whitespace decoding
     *   (`%6Aavascript:` and friends are blocked).
     */
    private function sanitizeSvg(string $path): void
    {
        $disk = Storage::disk('public');
        $content = $disk->get($path);
        if (! \is_string($content)) {
            return;
        }

        // XXE defence — two layers:
        //
        //   1. Strip any `<!DOCTYPE …>` declaration from the raw bytes BEFORE
        //      handing the content to libxml. This kills the inline-entity
        //      vector (`<!DOCTYPE svg [<!ENTITY pwned "…">]>` referenced by
        //      `&pwned;`), which PHP's DOMDocument silently expands at
        //      serialise time even without `LIBXML_NOENT`. Real-world SVGs
        //      almost never carry a DOCTYPE — SVG 1.1 deprecated it.
        //
        //   2. Block the external entity loader at the libxml level so any
        //      `<!ENTITY xxe SYSTEM "file:///etc/passwd">` that somehow
        //      slipped past step 1 still can't resolve. `LIBXML_NONET`
        //      alone is NOT enough — it blocks network fetches but lets
        //      `file://` through.
        $content = $this->stripDoctype($content);

        // `libxml_set_external_entity_loader(null)` resets to the libxml
        // default — which on modern PHP refuses external entity resolution
        // unless the caller opts in. Setting our own null-returning loader
        // makes the refusal explicit and survives any future change to that
        // default. The function returns bool (not the previous loader), so
        // we just reset to null after parse instead of trying to restore.
        libxml_set_external_entity_loader(
            static fn (?string $publicId, ?string $systemId, array $context): ?string => null,
        );

        libxml_use_internal_errors(true);
        $doc = new \DOMDocument();
        $loaded = $doc->loadXML($content, LIBXML_NONET);
        libxml_clear_errors();

        // Reset the loader to libxml's default so we don't leak our
        // null-loader into other parts of the app that might rely on it.
        libxml_set_external_entity_loader(null);

        if (! $loaded || $doc->documentElement === null) {
            $disk->put($path, '<svg xmlns="http://www.w3.org/2000/svg"/>');

            return;
        }

        $this->stripDangerous($doc->documentElement);

        $sanitized = $doc->saveXML();
        $disk->put($path, \is_string($sanitized) ? $sanitized : '<svg xmlns="http://www.w3.org/2000/svg"/>');
    }

    private function stripDangerous(\DOMElement $element): void
    {
        $children = iterator_to_array($element->childNodes);
        foreach ($children as $child) {
            if (! $child instanceof \DOMElement) {
                continue;
            }

            $name = strtolower($child->localName ?? '');

            if (\in_array($name, self::DANGEROUS_ELEMENTS, true)) {
                $element->removeChild($child);

                continue;
            }

            // Animation primitives are dangerous only when they target a
            // hyperlink-bearing attribute. An `<animate attributeName="fill">`
            // is harmless; an `<animate attributeName="href" to="javascript:…">`
            // is the canonical bypass.
            if (\in_array($name, self::ANIMATION_ELEMENTS, true)) {
                $target = strtolower($child->getAttribute('attributeName'));
                if ($target === 'href' || $target === 'xlink:href') {
                    $element->removeChild($child);

                    continue;
                }
            }

            // `<use>` can pull an external SVG document — same-origin or
            // not, fetching arbitrary content into a sanitised file is a
            // hole. Allow only same-document references (`#anchor`).
            if ($name === 'use') {
                if ($this->hasExternalUseHref($child)) {
                    $element->removeChild($child);

                    continue;
                }
            }

            $this->stripDangerous($child);
        }

        $this->stripDangerousAttributes($element);
    }

    private function stripDangerousAttributes(\DOMElement $element): void
    {
        /** @var array<\DOMAttr> $attributes */
        $attributes = iterator_to_array($element->attributes);
        foreach ($attributes as $attr) {
            $name = strtolower($attr->name);

            // `removeAttributeNode($attr)` (NOT `removeAttribute($name)`) is
            // the canonical hook for namespaced attributes — `xlink:href` and
            // friends would silently survive `removeAttribute("href")`
            // because the underlying API matches local names without the
            // namespace prefix.
            if (str_starts_with($name, 'on')) {
                $element->removeAttributeNode($attr);

                continue;
            }

            // Decode percent-escapes and HTML entities BEFORE scheme matching
            // — `%6Aavascript:`, `&#106;avascript:`, mixed-case, leading
            // whitespace are all known historical bypasses for naive
            // `str_contains($value, 'javascript:')` checks.
            if ($this->valueHasDangerousUriScheme($attr->value)) {
                $element->removeAttributeNode($attr);
            }
        }
    }

    /**
     * Strip any `<!DOCTYPE …>` declaration from the raw SVG content. PHP's
     * libxml expands inline entities (declared inside a DOCTYPE) at save
     * time even without `LIBXML_NOENT`; the only fully-safe shape is to
     * not let the DTD reach the parser in the first place. The regex
     * matches across newlines and is non-greedy so it stops at the FIRST
     * closing `>` after `<!DOCTYPE` — the canonical SVG DOCTYPE syntax.
     * Multi-line DOCTYPEs with internal subsets (`[<!ENTITY …>]`) are also
     * matched because the `]` closing bracket is part of the captured
     * region before `>`.
     */
    private function stripDoctype(string $content): string
    {
        // Two-step: handle internal-subset DOCTYPEs first (`<!DOCTYPE svg [..]>`)
        // since the `>` inside the bracket would prematurely terminate a naive
        // single-pass match.
        $content = preg_replace('/<!DOCTYPE[^>\[]*\[[^\]]*\]\s*>/is', '', $content) ?? $content;
        $content = preg_replace('/<!DOCTYPE[^>]*>/is', '', $content) ?? $content;

        return $content;
    }

    private function hasExternalUseHref(\DOMElement $useElement): bool
    {
        foreach (['href', 'xlink:href'] as $attrName) {
            $value = trim($useElement->getAttribute($attrName));
            if ($value === '') {
                continue;
            }
            // Same-document anchor references are the only safe shape.
            if (! str_starts_with($value, '#')) {
                return true;
            }
        }

        return false;
    }

    /**
     * True iff the attribute value resolves — after fully canonicalising —
     * to a URI scheme that can execute code in a browser. The current
     * blocklist covers `javascript:`, `vbscript:`, and `data:text/html`
     * (the last one is the canonical way to smuggle HTML+JS through a
     * data URI; image data: types stay safe).
     *
     * Decodes percent-escapes, named/numeric HTML entities, leading
     * whitespace, tabs and newlines (browsers strip those before scheme
     * parsing too) before checking the prefix — `%6Aavascript:` and
     * `&#106;avascript:` are known historical bypasses for naive
     * `str_contains($value, 'javascript:')` checks.
     */
    private function valueHasDangerousUriScheme(string $value): bool
    {
        $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $decoded = rawurldecode($decoded);
        $decoded = preg_replace('/[\s\x00-\x1F]+/', '', $decoded) ?? '';
        $decoded = strtolower($decoded);

        return str_starts_with($decoded, 'javascript:')
            || str_starts_with($decoded, 'vbscript:')
            || str_starts_with($decoded, 'data:text/html');
    }
}
