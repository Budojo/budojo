<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize + validate `POST /api/v1/community/events`.
 *
 * Owner-only — the gate requires the caller to be `isOwner()` AND
 * have a linked academy. The Action then writes the event scoped
 * to the owner's academy.
 *
 * Validation:
 * - `title` required, 1-120 chars (matches feed-card render budget).
 * - `description` optional, max 2000 chars.
 * - `starts_at` required, parseable as ISO-8601 date-time. The
 *   Action re-serialises it to canonical ISO format.
 * - `location_text` optional, max 200 chars.
 * - `location_lat` optional float `[-90, 90]` (V2 map view —
 *   accept nullable today so the V2 migration is non-destructive).
 * - `location_lon` optional float `[-180, 180]`.
 * - `max_attendees` optional positive integer; null = uncapped.
 */
class CreateEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null || ! $user->isOwner()) {
            return false;
        }

        return $user->academy?->id !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'min:1', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'starts_at' => ['required', 'string', 'date'],
            'location_text' => ['nullable', 'string', 'max:200'],
            'location_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'location_lon' => ['nullable', 'numeric', 'between:-180,180'],
            'max_attendees' => ['nullable', 'integer', 'min:1', 'max:10000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        foreach (['title', 'description', 'location_text'] as $field) {
            if ($this->has($field) && \is_string($this->input($field))) {
                $this->merge([$field => trim($this->input($field))]);
            }
        }
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
