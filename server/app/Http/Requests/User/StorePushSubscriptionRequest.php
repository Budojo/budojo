<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a Web Push subscription envelope on `POST /me/push-subscriptions`
 * (#996 — controller-bloat extraction + SSRF gate hardening).
 *
 * **Why this FormRequest exists**: the `endpoint` field is the SSRF-
 * sensitive surface — the fanout worker POSTs back to this URL with a
 * JWT signed by our VAPID private key. Accepting arbitrary http /
 * internal / loopback URLs would let an authenticated user point the
 * worker at internal services. The rule below enforces:
 *
 *   - `regex:^https:\/\/`  — TLS-only, no `http://`, no `data:`, no
 *     `javascript:`, no `file://`.
 *   - `url` — Laravel's URL validator catches malformed shapes that
 *     match the regex but fail RFC 3986 (e.g. `https://`, `https:////`).
 *
 * `keys.p256dh` / `keys.auth` carry the base64url shape from the W3C
 * PushSubscription serialisation; the regex rejects anything that
 * isn't `[A-Za-z0-9_-]+` so garbage rows can't slip in and fail later
 * at signing time.
 *
 * Pulling the rule out of the controller body makes the SSRF gate
 * grep-discoverable from a single file the moment a future audit
 * reaches for it (server canon § FormRequest discipline).
 */
class StorePushSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'endpoint' => ['required', 'string', 'max:1024', 'regex:/^https:\/\//', 'url'],
            'keys' => ['required', 'array'],
            'keys.p256dh' => ['required', 'string', 'max:255', 'regex:/^[A-Za-z0-9_\-]+$/'],
            'keys.auth' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_\-]+$/'],
        ];
    }
}
