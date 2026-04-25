<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use Illuminate\Support\Facades\Storage;

class DeleteAcademyLogoAction
{
    public function execute(Academy $academy): Academy
    {
        $path = $academy->logo_path;
        if ($path === null) {
            return $academy;
        }

        Storage::disk('public')->delete($path);
        $academy->forceFill(['logo_path' => null])->save();

        return $academy->refresh();
    }
}
