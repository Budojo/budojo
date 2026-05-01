<?php

declare(strict_types=1);

namespace App\Http\Requests\Feedback;

use Illuminate\Foundation\Http\FormRequest;

class SubmitFeedbackRequest extends FormRequest
{
    /**
     * Any authenticated user can submit feedback. Academy-scoping doesn't
     * apply here — the email goes to the product owner; "which academy"
     * is metadata, not an authorisation gate.
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
            // Subject + description are the load-bearing payload. Caps
            // chosen to keep the email body legible — a 5KB rant is
            // useless triage signal.
            'subject' => ['required', 'string', 'min:3', 'max:100'],
            'description' => ['required', 'string', 'min:10', 'max:2000'],

            // Single optional image attachment, capped at 5 MB. The
            // `mimetypes:` rule (vs `mimes:`) checks the actual MIME
            // sniffed from the file body — `mimes:` only checks the
            // extension which a curl client can lie about.
            'image' => ['nullable', 'file', 'max:5120', 'mimetypes:image/png,image/jpeg,image/webp'],

            // SPA-supplied build version (e.g. "v1.9.0", "v1.9.0-beta.3",
            // or "dev" on hot-reload). Optional — the User-Agent + the
            // timestamp on the email already give the owner enough to
            // grep server logs if app_version is missing for any reason.
            'app_version' => ['nullable', 'string', 'max:50'],
        ];
    }
}
