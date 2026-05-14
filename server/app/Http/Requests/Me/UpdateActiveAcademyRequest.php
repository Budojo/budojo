<?php

declare(strict_types=1);

namespace App\Http\Requests\Me;

use App\Models\AcademyMembership;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the body of `PATCH /me/active-academy` (#427 / #718).
 *
 * The user is identified by Sanctum auth — no controller-side input
 * binds to anyone else's row. The only validation rule that earns
 * its keep is: `academy_id` must be the id of an academy in which
 * THIS user has an active (not-revoked) membership. The `Rule::exists`
 * scoped to the user's memberships does that in one shot.
 */
class UpdateActiveAcademyRequest extends FormRequest
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
        /** @var User $user */
        $user = $this->user();

        return [
            'academy_id' => [
                'required',
                'integer',
                Rule::exists(AcademyMembership::class, 'academy_id')
                    ->where('user_id', $user->id)
                    ->whereNull('revoked_at'),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'academy_id.exists' => 'You are not an active member of this academy.',
        ];
    }
}
