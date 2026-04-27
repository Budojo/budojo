<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class UploadAcademyLogoRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();

        return $user !== null && $user->academy !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'logo' => [
                'required',
                'file',
                'mimes:png,jpg,jpeg,svg,webp',
                'max:2048',
            ],
        ];
    }
}
