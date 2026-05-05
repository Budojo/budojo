<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Stores an uploaded avatar on the `public` disk under
 * `users/avatars/{user-id}.{ext}` (#411).
 *
 * **No server-side resize.** The PHP image in this stack ships GD with
 * PNG support only — JPEG / WebP encoders are NOT compiled in
 * (`gd_info()` confirms this). Rather than gate the feature on
 * rebuilding the Dockerfile or pulling Intervention Image, we do what
 * `UploadAcademyLogoAction` does: persist the original file and let
 * the client render it inside a fixed-size frame via CSS
 * (`object-fit: cover` on a 256px circle on the dashboard chip,
 * `object-fit: cover` on the profile card). The FormRequest's
 * `image:jpeg,jpg,png,webp|max:2048` rule keeps the on-disk footprint
 * bounded; an avatar UI never approaches the 2 MB ceiling for real
 * head-shot dimensions.
 *
 * **Why store under `{user-id}.{ext}`.** Deterministic per user. When
 * a user replaces their avatar with a different format (PNG → WebP),
 * the old path differs from the new and the helper below unlinks the
 * orphan — same shape as `UploadAcademyLogoAction`.
 */
class UploadAvatarAction
{
    public function execute(User $user, UploadedFile $file): User
    {
        $disk = Storage::disk('public');
        $extension = strtolower($file->extension() ?: $file->getClientOriginalExtension());
        // Normalize the awkward `jpeg` → `jpg` so the path stays predictable
        // across browsers (Safari uploads as `image/jpeg` ext `jpeg`, Chrome
        // as `jpg`).
        $extension = $extension === 'jpeg' ? 'jpg' : $extension;
        $newPath = "users/avatars/{$user->id}.{$extension}";

        // Read the upload bytes ourselves rather than handing the
        // UploadedFile to `Storage::putFile()` so the storage path
        // stays deterministic ({id}.{ext}) instead of getting a hash.
        // Both `getRealPath()` and `file_get_contents()` can return
        // false on a hostile / corrupt UploadedFile — casting false to
        // string would silently store an empty file while reporting
        // 200. Surface those as 422 ValidationException on the
        // `avatar` field rather than a 500 RuntimeException, because
        // the failure is a client-payload problem (corrupt or
        // unreadable upload), not a server bug.
        $realPath = $file->getRealPath();
        if ($realPath === false) {
            throw ValidationException::withMessages([
                'avatar' => 'The uploaded file is unreadable. Please try again.',
            ]);
        }
        $bytes = file_get_contents($realPath);
        if ($bytes === false) {
            throw ValidationException::withMessages([
                'avatar' => 'Failed to read the uploaded file. Please try again.',
            ]);
        }

        // `Storage::put()` returning false IS a server-side problem
        // (disk permission, full filesystem). Stays a RuntimeException
        // — surfaces as 500, which is correct: the client's payload
        // was fine.
        $stored = $disk->put($newPath, $bytes);
        if ($stored === false) {
            throw new \RuntimeException("Failed to write avatar to {$newPath}.");
        }

        $previousPath = $user->avatar_path;
        $user->forceFill(['avatar_path' => $newPath])->save();

        // Replace-discipline mirroring UploadAcademyLogoAction: when the new
        // path differs from the old one (different extension), unlink the
        // orphan. Same-extension replace overwrites in place — `put()` is
        // last-write-wins on the same key, so no orphan there.
        if ($previousPath !== null && $previousPath !== $newPath) {
            $disk->delete($previousPath);
        }

        return $user->refresh();
    }
}
