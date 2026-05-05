<?php

declare(strict_types=1);

namespace App\Http\Requests\Support;

use App\Enums\SupportTicketCategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SubmitSupportTicketRequest extends FormRequest
{
    /**
     * Any authenticated user can file a ticket. No academy gate —
     * the ticket targets the support inbox, "which academy" is
     * metadata not authorisation. Note that the SPA dashboard shell
     * is hidden behind `hasAcademyGuard`, so in normal flow the user
     * always has an academy by the time they reach `/dashboard/support`.
     * Keeping the API permissive on purpose: a user mid-setup who
     * can't complete the wizard must still be able to ask for help
     * (direct API call from a future "soft" support entry point, or
     * a server-side support row created from the public `mailto:`
     * link's eventual evolution into a real form). The
     * "no-academy" feature test pins this contract.
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
