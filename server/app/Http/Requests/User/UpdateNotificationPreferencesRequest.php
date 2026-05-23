<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use App\Support\NotificationCategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates `PATCH /me/notification-preferences` (#1004 — controller-
 * bloat extraction).
 *
 * Shape: `preferences: { <category>: bool }`. The `Rule::array(...)`
 * rule restricts the keys to the `NotificationCategory` catalog so a
 * malformed request fails fast with 422 naming the offending key —
 * easier to debug than the silent-drop fallback (which `NotificationPreferences::update`
 * still applies as defense-in-depth).
 */
class UpdateNotificationPreferencesRequest extends FormRequest
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
            'preferences' => [
                'required',
                'array',
                Rule::array(NotificationCategory::all()),
            ],
            'preferences.*' => ['boolean'],
        ];
    }
}
