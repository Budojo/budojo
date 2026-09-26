<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

/** A batch of notifications back into the inbox (#1914). */
class UnarchiveNotificationsRequest extends FormRequest
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
            // A thousand at a time; the SPA sends a larger batch in several.
            'ids' => ['required', 'array', 'max:1000'],
            'ids.*' => ['string', 'uuid'],
        ];
    }
}
