<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

/**
 * After a fast-forward, deletes the files no row names any more (#2030, PRD §
 * 5.2). Swapping a database in runs no Observer and no Action, so a document
 * deleted on the other device left its file here. Deleting it is GDPR, not
 * tidiness: a medical certificate must not outlive its row.
 *
 * Each folder keeps what its rows name, by the rules the deleting Action
 * follows: a soft-deleted document's file is gone (`DeleteDocumentAction`),
 * while a soft-deleted athlete keeps its photo.
 */
final class ReconcileFilesAction
{
    /** @return int how many files were deleted */
    public function execute(): int
    {
        return $this->sweep('local', 'documents', Document::query()->pluck('file_path')->all())
            + $this->sweep('public', 'academy-logos', Academy::query()->whereNotNull('logo_path')->pluck('logo_path')->all())
            + $this->sweep('public', 'users/avatars', User::query()->whereNotNull('avatar_path')->pluck('avatar_path')->all())
            + $this->sweep('public', 'athletes/photos', Athlete::withTrashed()->whereNotNull('photo_path')->pluck('photo_path')->all());
    }

    /** @param array<mixed> $named the paths the rows name */
    private function sweep(string $disk, string $folder, array $named): int
    {
        $keep = array_flip(array_filter($named, \is_string(...)));
        $storage = Storage::disk($disk);
        $deleted = 0;

        foreach ($storage->allFiles($folder) as $file) {
            if (! isset($keep[$file])) {
                $storage->delete($file);
                $deleted++;
            }
        }

        return $deleted;
    }
}
