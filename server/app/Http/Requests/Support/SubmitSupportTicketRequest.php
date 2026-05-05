<?php

declare(strict_types=1);

namespace App\Http\Requests\Support;

use App\Enums\SupportTicketCategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SubmitSupportTicketRequest extends FormRequest
{
    /**
     * Any authenticated user can file a ticket. No academy-scoping —
     * the ticket targets the support inbox; "which academy" is
     * metadata, not an authorisation gate.
     */
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
            // Same caps as feedback (#311) — keeps the email body
            // legible and triage-friendly.
            'subject' => ['required', 'string', 'min:3', 'max:100'],

            // Validates against the SupportTicketCategory enum, so a
            // payload like `category: marketing` bounces with a 422.
            // The Angular client mirrors the four cases as a typed
            // union — server is the authoritative gate.
            'category' => ['required', Rule::enum(SupportTicketCategory::class)],

            // Body is the load-bearing free text. Cap at 5 KB — long
            // enough for a serious description, short enough to keep
            // the support inbox readable.
            'body' => ['required', 'string', 'min:10', 'max:5000'],
        ];
    }
}
