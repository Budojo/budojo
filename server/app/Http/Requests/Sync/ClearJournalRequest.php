<?php

declare(strict_types=1);

namespace App\Http\Requests\Sync;

use Illuminate\Foundation\Http\FormRequest;

/** `DELETE /api/v1/sync/journal?through=<ulid>` (#2031): the entry id to clear through. */
class ClearJournalRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The route's `role:owner` and `capability:sync` already decide who.
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'through' => ['required', 'string', 'regex:/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/'],
        ];
    }

    public function through(): string
    {
        $through = $this->validated('through');

        return \is_string($through) ? $through : '';
    }
}
