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

        $previousPath = $academy->logo_path;

        $academy->forceFill(['logo_path' => $path])->save();

        if ($previousPath !== null && $previousPath !== $path) {
            Storage::disk('public')->delete($previousPath);
        }

        return $academy->refresh();
    }
}
