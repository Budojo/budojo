<?php

declare(strict_types=1);

namespace App\Http\Requests\Me;

use App\Enums\AppLocale;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** The app's language, as the SPA's language switch sets it (#1912). */
class UpdateLocaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'locale' => ['required', 'string', Rule::enum(AppLocale::class)],
        ];
    }
}
