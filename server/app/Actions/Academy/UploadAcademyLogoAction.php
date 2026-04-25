<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use enshrined\svgSanitize\Sanitizer;
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
     * Strip script-bearing constructs from an uploaded SVG so the file is
     * safe to serve from the public disk and embed in `<img>` tags. Browsers
     * sandbox SVGs loaded via `<img src=...>`, but a victim opening the URL
     * directly would still execute scripts inside the document — we strip
     * them at upload time so the on-disk content is itself harmless.
     *
     * Uses `enshrined/svg-sanitize` (the same library that powers WordPress's
     * SVG plugin) instead of a hand-rolled DOMDocument walk so XXE,
     * malformed-DOCTYPE, and other less-obvious attack vectors are covered
     * by the library's allowlist + tests.
     */
    private function sanitizeSvg(string $path): void
    {
        $disk = Storage::disk('public');
        $content = $disk->get($path);
        if (! \is_string($content)) {
            return;
        }

        $sanitizer = new Sanitizer();
        $sanitizer->minify(true);
        $sanitized = $sanitizer->sanitize($content);

        $disk->put(
            $path,
            \is_string($sanitized) && $sanitized !== ''
                ? $sanitized
                : '<svg xmlns="http://www.w3.org/2000/svg"/>',
        );
    }
}
