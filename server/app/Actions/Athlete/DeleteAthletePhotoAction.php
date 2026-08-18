<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Models\Athlete;
use Illuminate\Support\Facades\Storage;

/**
 * Removes an athlete's photo and clears the column (#1357).
 *
 * A no-op when there is nothing to remove, rather than a 404. Deleting nothing
 * leaves the caller in exactly the state it asked for, and answering with an
 * error would only make the client special-case a success.
 */
class DeleteAthletePhotoAction
{
    public function execute(Athlete $athlete): Athlete
    {
        $path = $athlete->photo_path;

        if ($path === null) {
            return $athlete;
        }

        Storage::disk('public')->delete($path);
        $athlete->forceFill(['photo_path' => null])->save();

        return $athlete->refresh();
    }
}
