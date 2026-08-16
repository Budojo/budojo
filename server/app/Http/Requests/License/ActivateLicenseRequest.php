<?php

declare(strict_types=1);

namespace App\Http\Requests\License;

use App\Rules\ValidLicenseKey;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `POST /api/v1/license` (#1290) — the key, and nothing else.
 *
 * The route already carries `role:owner`; a signed-in owner is the whole
 * authorisation story here, because a licence belongs to the instance rather
 * than to any one record inside it.
 */
class ActivateLicenseRequest extends FormRequest
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
            // The cap is generous next to a real key (~250 characters) and
            // still stops a multi-megabyte body reaching signature
            // verification.
            'key' => ['required', 'string', 'max:4096', new ValidLicenseKey()],
        ];
    }
}
