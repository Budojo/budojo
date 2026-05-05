<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Re-encodes an uploaded image into a 256x256 center-cropped JPEG and stores
 * it on the `public` disk under `users/avatars/{user-id}.jpg` (#411).
 *
 * **Why GD, not Intervention Image.** Intervention Image is the obvious
 * library choice but it's not in `composer.json` today; the GD extension
 * is already compiled into the API container (`docker/api/Dockerfile`
 * § `docker-php-ext-install ... gd`). For a single-call square-crop +
 * resize the GD primitives do everything we need with no new dependency.
 * If a second feature ever needs richer image manipulation (e.g. document
 * thumbnailing) we revisit and adopt Intervention Image then — same
 * pragmatic threshold the server canon applies elsewhere.
 *
 * **Why 256x256.** Big enough for a Retina header chip (DPR 2 on a 96px
 * slot) and the profile-page card on desktop. Small enough that the
 * on-disk footprint is ~10-30 KB per user — three orders of magnitude
 * smaller than a typical phone photo, so storage stays trivial even at
 * 100k users.
 *
 * **Why JPEG output, not the input format.** A single output extension
 * keeps `users/avatars/{id}.jpg` deterministic — no dangling files when
 * a user replaces a PNG with a JPEG (overwrite is in-place, no orphan).
 * JPEG quality 85 is the standard sweet spot for photographic content;
 * the visual loss vs the original is imperceptible at 256px.
 */
class UploadAvatarAction
{
    private const TARGET_SIZE = 256;

    private const JPEG_QUALITY = 85;

    public function execute(User $user, UploadedFile $file): User
    {
        $sourcePath = $file->getRealPath();
        $resized = $this->resizeToSquareJpeg($sourcePath);

        $disk = Storage::disk('public');
        $newPath = "users/avatars/{$user->id}.jpg";

        $disk->put($newPath, $resized);

        $previousPath = $user->avatar_path;
        $user->forceFill(['avatar_path' => $newPath])->save();

        // Replace-discipline mirroring UploadAcademyLogoAction: when the new
        // path differs from the old one, unlink the orphan. In practice the
        // path is deterministic ({id}.jpg), so a same-extension replace
        // overwrites in place and `$previousPath === $newPath` — the unlink
        // call is a no-op safety net for any future schema where the path
        // includes a content hash or extension.
        if ($previousPath !== null && $previousPath !== $newPath) {
            $disk->delete($previousPath);
        }

        return $user->refresh();
    }

    /**
     * Reads the source file via GD, center-crops to a square, resizes to
     * 256x256, and returns the JPEG bytes. Throws on a corrupt input —
     * the FormRequest's `image` rule already pre-screens the upload, so
     * reaching this branch means the validator was bypassed (e.g.
     * `Storage::fake` test path) and the action failure is the right
     * signal.
     */
    private function resizeToSquareJpeg(string $sourcePath): string
    {
        $info = @getimagesize($sourcePath);
        if ($info === false) {
            throw new \RuntimeException('Uploaded avatar is not a readable image.');
        }

        $source = $this->createSourceImage($sourcePath, $info[2]);

        $width = imagesx($source);
        $height = imagesy($source);
        $side = min($width, $height);
        $cropX = (int) (($width - $side) / 2);
        $cropY = (int) (($height - $side) / 2);

        $target = imagecreatetruecolor(self::TARGET_SIZE, self::TARGET_SIZE);
        if ($target === false) {
            imagedestroy($source);
            throw new \RuntimeException('Failed to allocate avatar canvas.');
        }

        // Flatten transparent pixels to white. PNG / WebP can carry alpha;
        // JPEG cannot. Without this, transparent regions render as black
        // blobs after re-encoding — a worse default than a clean white card.
        $white = imagecolorallocate($target, 255, 255, 255);
        if ($white !== false) {
            imagefilledrectangle($target, 0, 0, self::TARGET_SIZE, self::TARGET_SIZE, $white);
        }

        imagecopyresampled(
            $target,
            $source,
            0,
            0,
            $cropX,
            $cropY,
            self::TARGET_SIZE,
            self::TARGET_SIZE,
            $side,
            $side,
        );

        ob_start();
        imagejpeg($target, null, self::JPEG_QUALITY);
        $bytes = (string) ob_get_clean();

        imagedestroy($source);
        imagedestroy($target);

        return $bytes;
    }

    /**
     * Decodes the source bytes into a GdImage using the loader matching
     * the upload's MIME type. The FormRequest constrains the input to
     * jpeg / png / webp; anything else here means the validator was
     * bypassed and a runtime failure is correct.
     */
    private function createSourceImage(string $path, int $imageType): \GdImage
    {
        $img = match ($imageType) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => @imagecreatefromwebp($path),
            default => false,
        };

        if (! $img instanceof \GdImage) {
            throw new \RuntimeException('Unsupported avatar image type.');
        }

        return $img;
    }
}
