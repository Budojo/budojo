<?php

declare(strict_types=1);

namespace App\Http\Requests\Sync;

use App\Actions\Sync\DecideConflictAction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** `POST /api/v1/sync/conflicts/{entry}/decision` (#2031): the owner's answer. */
class DecideConflictRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The route's `role:owner` and `capability:sync` already decide who.
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'decision' => ['required', 'string', Rule::in(DecideConflictAction::DECISIONS)],
        ];
    }

    public function decision(): string
    {
        $decision = $this->validated('decision');

        return \is_string($decision) ? $decision : '';
    }
}
