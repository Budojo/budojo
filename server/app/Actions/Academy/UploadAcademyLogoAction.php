<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class UploadAcademyLogoAction
{
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
     * Removes: `<script>`, `<foreignObject>`, `<iframe>`, all `on*` event
     * attributes, and any attribute whose value carries a `javascript:` URI.
     */
    private function sanitizeSvg(string $path): void
    {
        $disk = Storage::disk('public');
        $content = $disk->get($path);
        if (! \is_string($content)) {
            return;
        }

        libxml_use_internal_errors(true);
        $doc = new \DOMDocument();
        $loaded = $doc->loadXML($content, LIBXML_NONET | LIBXML_NOENT);
        libxml_clear_errors();

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
        $dangerousElements = ['script', 'foreignObject', 'iframe'];
        $children = iterator_to_array($element->childNodes);
        foreach ($children as $child) {
            if (! $child instanceof \DOMElement) {
                continue;
            }
            if (\in_array(strtolower($child->localName ?? ''), $dangerousElements, true)) {
                $element->removeChild($child);

                continue;
            }
            $this->stripDangerous($child);
        }

        /** @var array<\DOMAttr> $attributes */
        $attributes = iterator_to_array($element->attributes);
        foreach ($attributes as $attr) {
            $name = strtolower($attr->name);
            $value = strtolower($attr->value);
            if (str_starts_with($name, 'on') || str_contains($value, 'javascript:')) {
                $element->removeAttribute($attr->name);
            }
        }
    }
}
