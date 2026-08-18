<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Models\Athlete;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Stores an athlete photo on the `public` disk at
 * `athletes/photos/{athlete-id}.{ext}` (#1357).
 *
 * Deliberately the same shape as `UploadAvatarAction` (#411), down to the
 * failure handling, because the two solve the same problem and a second
 * approach would be a second set of edge cases to get wrong.
 *
 * **No server-side resize.** The PHP image in this stack ships GD with PNG
 * support only — the JPEG and WebP encoders are not compiled in. Neither
 * existing uploader re-encodes either; the client frames the image with CSS
 * `object-fit: cover`, and the FormRequest's 2 MB ceiling bounds the on-disk
 * footprint.
 *
 * **Why `{athlete-id}.{ext}`.** Deterministic per athlete, so replacing a photo
 * overwrites rather than accumulating. When the format changes the path changes
 * with it, which is exactly when an orphan would be left behind — hence the
 * explicit unlink below.
 */
class UploadAthletePhotoAction
{
    public function execute(Athlete $athlete, UploadedFile $file): Athlete
    {
        $disk = Storage::disk('public');

        $extension = strtolower($file->extension() ?: $file->getClientOriginalExtension());
        // Safari uploads `image/jpeg` as `jpeg`, Chrome as `jpg`. Two paths for
        // one format would leak an orphan on every replacement.
        $extension = $extension === 'jpeg' ? 'jpg' : $extension;
        $newPath = "athletes/photos/{$athlete->id}.{$extension}";

        // Read the bytes here rather than handing the UploadedFile to
        // `putFile()`, which would hash the name and lose the deterministic
        // path. Both calls can return false on a corrupt upload; casting that
        // to string would store an empty file and report 200. It is a payload
        // problem, so it surfaces as 422 on the field, not a 500.
        $realPath = $file->getRealPath();
        if ($realPath === false) {
            throw ValidationException::withMessages([
                'photo' => 'The uploaded file is unreadable. Please try again.',
            ]);
        }

        $bytes = file_get_contents($realPath);
        if ($bytes === false) {
            throw ValidationException::withMessages([
                'photo' => 'Failed to read the uploaded file. Please try again.',
            ]);
        }

        // A false from `put()` IS a server problem — disk permissions, a full
        // filesystem — so it stays a 500. The client's payload was fine.
        if ($disk->put($newPath, $bytes) === false) {
            throw new \RuntimeException("Failed to write athlete photo to {$newPath}.");
        }

        $previousPath = $athlete->photo_path;
        $athlete->forceFill(['photo_path' => $newPath])->save();

        // Same-extension replace overwrites in place — `put()` is
        // last-write-wins on one key, so there is no orphan there.
        if ($previousPath !== null && $previousPath !== $newPath) {
            $disk->delete($previousPath);
        }

        return $athlete->refresh();
    }
}
