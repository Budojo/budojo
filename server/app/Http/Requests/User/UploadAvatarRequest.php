<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class UploadAvatarRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();

        return $user !== null;
    }

    /**
     * Mirror the academy-logo precedent (#411) — `image` covers the same
     * three browser-renderable bitmaps (jpeg / png / webp). SVG is
     * intentionally NOT accepted here: an SVG profile photo is unusual,
     * and the academy-logo path needed a hand-rolled sanitiser to make
     * it safe — that surface is too heavy for a head-shot. Bitmap-only
     * keeps the input space tight and reuses Laravel's built-in file
     * fingerprint check.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'avatar' => [
                'required',
                'file',
                // `image` (without `allow_svg`) covers the standard browser
                // bitmaps; `mimes:jpeg,jpg,png,webp` narrows the trio we
                // actually accept. Both rules together reject GIF / BMP
                // (surface area we don't need) AND keep SVG out — the
                // academy-logo flow needed a hand-rolled sanitiser to make
                // SVG safe; we don't replicate that surface for head-shots.
                'image',
                'mimes:jpeg,jpg,png,webp',
                // 2 MB ceiling, mirrors UploadAcademyLogoRequest. Server-side
                // we re-encode to a 256x256 JPEG (~10-30 KB) so the on-disk
                // footprint stays tiny regardless of the upload size.
                'max:2048',
            ],
        ];
    }
}
