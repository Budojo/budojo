<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class UploadAthletePhotoRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();

        // Academy scoping is the controller's job — it has the resolved
        // athlete and answers 403. This only asserts there is a caller.
        return $user !== null;
    }

    /**
     * Mirrors `UploadAvatarRequest` (#411), for the same reasons.
     *
     * `image` without `allow_svg` covers the standard browser bitmaps;
     * `mimes` narrows it to the three we actually accept, which rejects GIF and
     * BMP — surface we do not need. **SVG is deliberately out**: it is a script
     * vector, and making it safe on the academy-logo path needed a hand-rolled
     * sanitiser. That is far too much surface for a head-shot.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'photo' => [
                'required',
                'file',
                'image',
                'mimes:jpeg,jpg,png,webp',
                // 2 MB, as everywhere else here. Nothing re-encodes server-side
                // (GD ships PNG-only in this image), so this ceiling is what
                // actually bounds the disk.
                'max:2048',
            ],
        ];
    }
}
