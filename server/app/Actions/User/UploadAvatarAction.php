<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

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
        // 200, so we check explicitly and 422-equivalent the request.
        $realPath = $file->getRealPath();
        if ($realPath === false) {
            throw new \RuntimeException('Uploaded avatar file is unreadable (no real path).');
        }
        $bytes = file_get_contents($realPath);
        if ($bytes === false) {
            throw new \RuntimeException("Failed to read uploaded avatar bytes from {$realPath}.");
        }

        // `Storage::put()` returns false on a transient disk error
        // (e.g. permission, full filesystem). Bail before the model
        // write so we never persist `avatar_path` pointing at a file
        // that was never written — the caller's upload would 200 with
        // a broken `avatar_url` otherwise.
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
